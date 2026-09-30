<?php

declare(strict_types=1);

namespace App\Services;

use App\Mail\PlanChangedEmail;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Tells the Company Admins of every current subscriber that their plan changed
 * and when it takes effect (end of the subscriber's running period).
 * Uses the existing NotificationService/notifications table (tenant DB) and
 * queues an email through the existing onboarding mailer.
 */
class PlanChangeNotifier
{
    public function __construct(private readonly NotificationService $notifications) {}

    /** @param list<string> $changes human readable change lines */
    public function notify(object $plan, array $changes): int
    {
        if ($changes === []) {
            return 0;
        }
        $central = DB::connection(config('tenancy.database.central_connection'));
        $subscriptions = $central->table('subscriptions')
            ->where('plan_id', $plan->id)
            ->whereIn('status', ['TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED'])
            ->get(['id', 'tenant_id', 'current_period_end']);
        $model = config('tenancy.tenant_model', \App\Models\Tenant::class);
        $notified = 0;

        foreach ($subscriptions as $subscription) {
            try {
                $tenant = $model::query()->find($subscription->tenant_id);
                if (! $tenant || $tenant->database_status !== 'READY') {
                    continue;
                }
                $effective = $subscription->current_period_end
                    ? Carbon::parse($subscription->current_period_end)->locale('id')->translatedFormat('j F Y')
                    : 'periode billing berikutnya';
                $title = 'Perubahan paket '.$plan->name;
                $message = 'Paket '.$plan->name.' yang Anda gunakan diubah: '.implode('; ', $changes)
                    .'. Perubahan mulai berlaku pada '.$effective
                    .'; sampai saat itu langganan Anda tetap memakai harga, layanan, dan limit periode berjalan.';

                $emails = $tenant->run(function () use ($plan, $title, $message, $changes, $effective): array {
                    $admins = DB::table('tenant_users')->where('role_key', 'COMPANY_ADMIN')->where('status', 'ACTIVE')->get(['id', 'email']);
                    $this->notifications->send($admins->pluck('id')->all(), 'PLAN_CHANGED', 'PLAN', $plan->id, $title, $message, [
                        'plan_id' => $plan->id, 'changes' => $changes, 'effective_date' => $effective,
                    ]);

                    return $admins->pluck('email')->filter()->unique()->values()->all();
                });
                $notified++;

                if ($emails !== []) {
                    Mail::mailer(config('onboarding.mailer'))->to($emails)
                        ->queue(new PlanChangedEmail((string) $tenant->name, (string) $plan->name, $changes, $effective));
                }
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $notified;
    }
}
