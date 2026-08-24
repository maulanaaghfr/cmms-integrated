<?php

declare(strict_types=1);

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PmService
{
    public function __construct(private readonly WorkOrderService $workOrders) {}

    public function calculateNextDue(object $trigger, string $timezone, mixed $from): CarbonImmutable
    {
        $date = CarbonImmutable::parse($from, $timezone);
        $value = (int) $trigger->interval_value;
        $next = match ($trigger->interval_unit) {
            'DAY' => $date->addDays($value), 'WEEK' => $date->addWeeks($value),
            'MONTH' => $date->addMonthsNoOverflow($value), 'YEAR' => $date->addYearsNoOverflow($value),
        };
        if ($trigger->fixed_local_time ?? null) {
            $next = $next->setTimeFromTimeString($trigger->fixed_local_time);
        }

        return $next->utc();
    }

    public function completeOccurrence(string $occurrenceId, mixed $completedAt = null): void
    {
        $completedAt = CarbonImmutable::parse($completedAt ?? now());
        $occurrence = DB::table('pm_occurrences')->where('id', $occurrenceId)->first();
        if (! $occurrence) {
            return;
        }

        DB::table('pm_occurrences')->where('id', $occurrenceId)->update([
            'status' => 'COMPLETED',
            'completed_at' => $completedAt,
            'updated_at' => now(),
        ]);

        $schedule = DB::table('pm_schedules')->where('id', $occurrence->pm_schedule_id)->first();
        if (! $schedule) {
            return;
        }

        $changes = ['last_completed_at' => $completedAt, 'updated_at' => now()];
        if ($schedule->schedule_mode === 'COMPLETION_BASED') {
            $trigger = DB::table('pm_schedule_triggers')
                ->where('pm_schedule_id', $schedule->id)
                ->where('trigger_type', 'TIME')
                ->where('is_active', true)
                ->first();
            if ($trigger) {
                $changes['next_due_at'] = $this->calculateNextDue($trigger, $schedule->timezone, $completedAt);
            }
        }

        DB::table('pm_schedules')->where('id', $schedule->id)->update($changes);
    }

    public function generateDue(): int
    {
        $generated = 0;
        foreach (DB::table('pm_schedules')->where('status', 'ACTIVE')->whereNull('archived_at')->whereNotNull('next_due_at')->get() as $schedule) {
            if (CarbonImmutable::parse($schedule->next_due_at)->subMinutes($schedule->generation_lead_minutes)->isFuture()) {
                continue;
            }
            $generated += DB::transaction(function () use ($schedule): int {
                $locked = DB::table('pm_schedules')->where('id', $schedule->id)->lockForUpdate()->first();
                if (! $locked || $locked->status !== 'ACTIVE') {
                    return 0;
                }
                $trigger = DB::table('pm_schedule_triggers')->where('pm_schedule_id', $locked->id)->where('is_active', true)->where('trigger_type', 'TIME')->first();
                if (! $trigger) {
                    return 0;
                }
                if ($locked->open_occurrence_policy === 'HOLD_NEXT' && DB::table('pm_occurrences')->where('pm_schedule_id', $locked->id)->whereIn('status', ['PENDING', 'GENERATED', 'HELD'])->exists()) {
                    return 0;
                }
                $key = $locked->id.'|'.CarbonImmutable::parse($locked->next_due_at)->utc()->toIso8601String();
                if (DB::table('pm_occurrences')->where('occurrence_key', $key)->exists()) {
                    return 0;
                }
                $template = DB::table('pm_templates')->where('id', $locked->pm_template_id)->first();
                $asset = DB::table('assets')->where('id', $locked->asset_id)->first();
                $actor = DB::table('tenant_users')->where('id', $locked->created_by)->first();
                $occurrenceId = (string) Str::ulid();
                DB::table('pm_occurrences')->insert([
                    'id' => $occurrenceId, 'pm_schedule_id' => $locked->id, 'pm_template_id' => $template->id, 'asset_id' => $asset->id,
                    'trigger_id' => $trigger->id, 'occurrence_key' => $key, 'due_at' => $locked->next_due_at,
                    'generation_due_at' => CarbonImmutable::parse($locked->next_due_at)->subMinutes($locked->generation_lead_minutes),
                    'generated_at' => now(), 'status' => 'GENERATED', 'skipped_at' => null, 'skipped_by' => null, 'skip_reason' => null,
                    'completed_at' => null, 'created_at' => now(), 'updated_at' => now(),
                ]);
                $this->workOrders->create($asset, $actor, [
                    'title' => $template->name, 'description' => $template->work_instructions ?: $template->description,
                    'priority' => $template->priority, 'team_id' => $template->default_team_id,
                    'assignee_id' => $template->default_technician_id, 'due_at' => $locked->next_due_at, 'requester_id' => null,
                ], 'PM', null, $occurrenceId);
                $next = $locked->schedule_mode === 'FIXED' ? $this->calculateNextDue($trigger, $locked->timezone, $locked->next_due_at) : null;
                DB::table('pm_schedules')->where('id', $locked->id)->update(['last_generated_at' => now(), 'next_due_at' => $next, 'updated_at' => now()]);

                return 1;
            });
        }

        return $generated;
    }
}
