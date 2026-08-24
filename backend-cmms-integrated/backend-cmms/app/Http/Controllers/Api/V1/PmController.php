<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\AuditService;
use App\Services\PmService;
use App\Services\TenantScope;
use App\Support\ApiData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PmController extends Controller
{
    public function __construct(private readonly PmService $pm, private readonly AuditService $audit, private readonly TenantScope $scope) {}

    public function templates(Request $request): mixed
    {
        return ApiData::paginated($this->scope->pmTemplates($request->attributes->get('tenant_user'))->whereNull('archived_at')->orderBy('name')->paginate($request->integer('per_page', 20)));
    }

    public function template(Request $request, string $template): mixed
    {
        return ApiData::item($this->scope->pmTemplate($request->attributes->get('tenant_user'), $template));
    }

    public function createTemplate(Request $request): mixed
    {
        $data = $this->templateData($request);
        $this->validateTemplateSite($request->attributes->get('tenant_user'), $data['site_id'], $data['default_team_id'] ?? null, $data['default_technician_id'] ?? null);
        $id = (string) Str::ulid();
        DB::table('pm_templates')->insert(['id' => $id, ...$data, 'default_team_id' => $data['default_team_id'] ?? null, 'default_technician_id' => $data['default_technician_id'] ?? null, 'estimated_duration_minutes' => $data['estimated_duration_minutes'] ?? null, 'description' => $data['description'] ?? null, 'work_instructions' => $data['work_instructions'] ?? null, 'created_by' => $request->attributes->get('tenant_user')->id, 'lock_version' => 1, 'created_at' => now(), 'updated_at' => now(), 'archived_at' => null]);
        $this->audit->tenant($request, 'pm_template.created', 'PM_TEMPLATE', $id, null, $data);

        return ApiData::item($this->scope->pmTemplate($request->attributes->get('tenant_user'), $id), 201);
    }

    public function updateTemplate(Request $request, string $template): mixed
    {
        $before = $this->scope->pmTemplate($request->attributes->get('tenant_user'), $template);
        $data = $this->templateData($request, true, $template);
        $siteId = $data['site_id'] ?? $before->site_id;
        $this->validateTemplateSite(
            $request->attributes->get('tenant_user'),
            $siteId,
            array_key_exists('default_team_id', $data) ? $data['default_team_id'] : $before->default_team_id,
            array_key_exists('default_technician_id', $data) ? $data['default_technician_id'] : $before->default_technician_id,
        );
        DB::table('pm_templates')->where('id', $template)->update([...$data, 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now()]);
        $this->audit->tenant($request, 'pm_template.updated', 'PM_TEMPLATE', $template, $before, $data);

        return $this->template($request, $template);
    }

    public function archiveTemplate(Request $request, string $template): mixed
    {
        $this->scope->pmTemplate($request->attributes->get('tenant_user'), $template);
        DB::table('pm_templates')->where('id', $template)->update(['status' => 'RETIRED', 'archived_at' => now(), 'updated_at' => now()]);

        return response()->json(null, 204);
    }

    public function schedules(Request $request): mixed
    {
        return ApiData::paginated($this->scope->pmSchedules($request->attributes->get('tenant_user'))->whereNull('archived_at')->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))->orderBy('name')->paginate($request->integer('per_page', 20)));
    }

    public function schedule(Request $request, string $schedule): mixed
    {
        $row = $this->scope->pmSchedule($request->attributes->get('tenant_user'), $schedule);
        $row->triggers = DB::table('pm_schedule_triggers')->where('pm_schedule_id', $schedule)->get();

        return ApiData::item($row);
    }

    public function createSchedule(Request $request): mixed
    {
        $data = $this->scheduleData($request);
        $this->validateScheduleSite($request->attributes->get('tenant_user'), $data['site_id'], $data['pm_template_id'], $data['asset_id']);
        $triggerData = $data['trigger'];
        unset($data['trigger']);
        $id = (string) Str::ulid();
        DB::transaction(function () use ($id, $data, $triggerData, $request): void {
            $trigger = (object) $triggerData;
            $firstDue = $this->pm->calculateNextDue($trigger, $data['timezone'], $data['start_date']);
            DB::table('pm_schedules')->insert(['id' => $id, ...$data, 'generation_lead_minutes' => $data['generation_lead_minutes'] ?? 0, 'open_occurrence_policy' => $data['open_occurrence_policy'] ?? 'HOLD_NEXT', 'end_date' => $data['end_date'] ?? null, 'next_due_at' => $firstDue, 'last_generated_at' => null, 'last_completed_at' => null, 'paused_at' => null, 'paused_by' => null, 'pause_reason' => null, 'lock_version' => 1, 'created_by' => $request->attributes->get('tenant_user')->id, 'created_at' => now(), 'updated_at' => now(), 'archived_at' => null]);
            DB::table('pm_schedule_triggers')->insert(['id' => (string) Str::ulid(), 'pm_schedule_id' => $id, 'trigger_type' => 'TIME', 'trigger_operator' => 'EVERY_INTERVAL', ...$triggerData, 'fixed_day_of_week' => $triggerData['fixed_day_of_week'] ?? null, 'fixed_day_of_month' => $triggerData['fixed_day_of_month'] ?? null, 'fixed_local_time' => $triggerData['fixed_local_time'] ?? null, 'meter_id' => null, 'meter_threshold_value' => null, 'meter_interval_value' => null, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        });
        $this->audit->tenant($request, 'pm_schedule.created', 'PM_SCHEDULE', $id, null, $data);

        return $this->schedule($request, $id)->setStatusCode(201);
    }

    public function updateSchedule(Request $request, string $schedule): mixed
    {
        $before = $this->scope->pmSchedule($request->attributes->get('tenant_user'), $schedule);
        $data = $this->scheduleData($request, true, $schedule);
        $siteId = $data['site_id'] ?? $before->site_id;
        $this->validateScheduleSite(
            $request->attributes->get('tenant_user'),
            $siteId,
            $data['pm_template_id'] ?? $before->pm_template_id,
            $data['asset_id'] ?? $before->asset_id,
        );
        $triggerData = $data['trigger'] ?? null;
        unset($data['trigger']);
        DB::transaction(function () use ($schedule, $data, $triggerData): void {
            $locked = DB::table('pm_schedules')->where('id', $schedule)->lockForUpdate()->first()
                ?? throw new ApiException('PM_SCHEDULE_NOT_FOUND', 'PM schedule was not found.', 404);
            DB::table('pm_schedules')->where('id', $schedule)->update([...$data, 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now()]);
            if ($triggerData) {
                DB::table('pm_schedule_triggers')->where('pm_schedule_id', $schedule)->where('is_active', true)->update([...$triggerData, 'updated_at' => now()]);
            }
            if ($triggerData || array_intersect_key($data, array_flip(['timezone', 'start_date', 'schedule_mode']))) {
                $updated = DB::table('pm_schedules')->where('id', $schedule)->first();
                $trigger = DB::table('pm_schedule_triggers')->where('pm_schedule_id', $schedule)->where('is_active', true)->where('trigger_type', 'TIME')->first();
                if ($trigger) {
                    $base = array_key_exists('start_date', $data)
                        ? $updated->start_date
                        : ($updated->schedule_mode === 'COMPLETION_BASED'
                            ? ($updated->last_completed_at ?: $updated->start_date)
                            : ($updated->last_generated_at ?: $updated->start_date));
                    DB::table('pm_schedules')->where('id', $schedule)->update([
                        'next_due_at' => $this->pm->calculateNextDue($trigger, $updated->timezone, $base),
                        'updated_at' => now(),
                    ]);
                }
            }
        });
        $this->audit->tenant($request, 'pm_schedule.updated', 'PM_SCHEDULE', $schedule, $before, $data);

        return $this->schedule($request, $schedule);
    }

    public function archiveSchedule(Request $request, string $schedule): mixed
    {
        $this->scope->pmSchedule($request->attributes->get('tenant_user'), $schedule);
        DB::table('pm_schedules')->where('id', $schedule)->update(['status' => 'RETIRED', 'archived_at' => now(), 'updated_at' => now()]);

        return response()->json(null, 204);
    }

    public function pause(Request $request, string $schedule): mixed
    {
        $data = $request->validate(['reason' => ['required', 'string']]);
        $this->scope->pmSchedule($request->attributes->get('tenant_user'), $schedule);
        DB::table('pm_schedules')->where('id', $schedule)->update(['status' => 'PAUSED', 'paused_at' => now(), 'paused_by' => $request->attributes->get('tenant_user')->id, 'pause_reason' => $data['reason'], 'updated_at' => now()]);

        return $this->schedule($request, $schedule);
    }

    public function resume(Request $request, string $schedule): mixed
    {
        $this->scope->pmSchedule($request->attributes->get('tenant_user'), $schedule);
        DB::table('pm_schedules')->where('id', $schedule)->update(['status' => 'ACTIVE', 'paused_at' => null, 'paused_by' => null, 'pause_reason' => null, 'updated_at' => now()]);

        return $this->schedule($request, $schedule);
    }

    public function occurrences(Request $request): mixed
    {
        return ApiData::paginated($this->scope->pmOccurrences($request->attributes->get('tenant_user'))->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))->orderByDesc('due_at')->paginate($request->integer('per_page', 20)));
    }

    private function templateData(Request $request, bool $partial = false, ?string $ignore = null): array
    {
        $mode = $partial ? 'sometimes' : 'required';

        return $request->validate(['site_id' => [$mode, 'ulid', Rule::exists('sites', 'id')], 'code' => [$mode, 'string', 'max:80', Rule::unique('pm_templates', 'code')->ignore($ignore)], 'name' => [$mode, 'string', 'max:255'], 'description' => ['nullable', 'string'], 'priority' => [$mode, Rule::in(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])], 'default_team_id' => ['nullable', 'ulid', Rule::exists('teams', 'id')], 'default_technician_id' => ['nullable', 'ulid', Rule::exists('tenant_users', 'id')], 'estimated_duration_minutes' => ['nullable', 'integer', 'min:1'], 'work_instructions' => ['nullable', 'string'], 'status' => [$mode, Rule::in(['DRAFT', 'ACTIVE', 'RETIRED'])]]);
    }

    private function scheduleData(Request $request, bool $partial = false, ?string $ignore = null): array
    {
        $mode = $partial ? 'sometimes' : 'required';

        return $request->validate(['pm_template_id' => [$mode, 'ulid', Rule::exists('pm_templates', 'id')], 'site_id' => [$mode, 'ulid', Rule::exists('sites', 'id')], 'asset_id' => [$mode, 'ulid', Rule::exists('assets', 'id')], 'code' => [$mode, 'string', 'max:80', Rule::unique('pm_schedules', 'code')->ignore($ignore)], 'name' => [$mode, 'string', 'max:255'], 'schedule_mode' => [$mode, Rule::in(['FIXED', 'COMPLETION_BASED'])], 'generation_lead_minutes' => ['sometimes', 'integer', 'min:0'], 'open_occurrence_policy' => ['sometimes', Rule::in(['HOLD_NEXT', 'ALLOW_NEXT'])], 'timezone' => [$mode, 'timezone:all'], 'start_date' => [$mode, 'date'], 'end_date' => ['nullable', 'date', 'after_or_equal:start_date'], 'status' => [$mode, Rule::in(['DRAFT', 'ACTIVE'])], 'trigger' => [$mode, 'array'], 'trigger.interval_unit' => [$mode, Rule::in(['DAY', 'WEEK', 'MONTH', 'YEAR'])], 'trigger.interval_value' => [$mode, 'integer', 'min:1'], 'trigger.fixed_day_of_week' => ['nullable', 'integer', 'between:1,7'], 'trigger.fixed_day_of_month' => ['nullable', 'integer', 'between:1,31'], 'trigger.fixed_local_time' => ['nullable', 'date_format:H:i']]);
    }

    private function validateTemplateSite(object $actor, string $siteId, ?string $teamId, ?string $technicianId): void
    {
        $this->scope->site($actor, $siteId);
        if ($teamId && ! DB::table('teams')->where('id', $teamId)->where('site_id', $siteId)->where('is_active', true)->exists()) {
            throw new ApiException('PM_TEAM_SITE_MISMATCH', 'Default team must be active in the PM template site.', 422);
        }
        if ($technicianId && ! DB::table('tenant_users')->where('id', $technicianId)->where('primary_site_id', $siteId)
            ->where('role_key', 'TECHNICIAN')->where('status', 'ACTIVE')->exists()) {
            throw new ApiException('PM_TECHNICIAN_SITE_MISMATCH', 'Default technician must be active in the PM template site.', 422);
        }
    }

    private function validateScheduleSite(object $actor, string $siteId, string $templateId, string $assetId): void
    {
        $this->scope->site($actor, $siteId);
        if (! DB::table('pm_templates')->where('id', $templateId)->where('site_id', $siteId)->whereNull('archived_at')->exists()) {
            throw new ApiException('PM_TEMPLATE_SITE_MISMATCH', 'PM template must belong to the schedule site.', 422);
        }
        if (! DB::table('assets')->where('id', $assetId)->where('site_id', $siteId)->whereNull('archived_at')->exists()) {
            throw new ApiException('PM_ASSET_SITE_MISMATCH', 'PM asset must belong to the schedule site.', 422);
        }
    }
}
