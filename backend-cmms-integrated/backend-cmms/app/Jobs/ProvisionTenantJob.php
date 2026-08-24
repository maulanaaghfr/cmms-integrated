<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Mail\TenantProvisionedEmail;
use App\Models\OnboardingRegistration;
use App\Models\Tenant;
use App\Models\TenantProvisioningAttempt;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Stancl\Tenancy\Jobs\CreateDatabase;
use Stancl\Tenancy\Jobs\MigrateDatabase;
use Throwable;

class ProvisionTenantJob implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 900;

    public int $uniqueFor = 1800;

    public function __construct(public readonly string $attemptId) {}

    public function uniqueId(): string
    {
        return $this->attemptId;
    }

    public function backoff(): array
    {
        return [30, 120, 600];
    }

    public function handle(): void
    {
        $attempt = TenantProvisioningAttempt::query()->findOrFail($this->attemptId);
        if ($attempt->status === 'SUCCEEDED') {
            return;
        }

        $tenant = Tenant::query()->findOrFail($attempt->tenant_id);
        $this->updateStep($attempt, $tenant, 'CREATING_DATABASE');

        try {
            if (! $tenant->database()->manager()->databaseExists($tenant->database_name)) {
                CreateDatabase::dispatchSync($tenant);
            }

            $this->updateStep($attempt, $tenant, 'MIGRATING_DATABASE');
            MigrateDatabase::dispatchSync($tenant);

            $this->updateStep($attempt, $tenant, 'SEEDING_DATABASE');
            (new SeedTenantDatabase($tenant))->handle();

            $this->updateStep($attempt, $tenant, 'PROJECTING_COMPANY_ADMIN');
            $this->projectCompanyAdmin($tenant);

            $tenant->forceFill(['database_status' => 'READY', 'provisioned_at' => now()])->saveQuietly();
            $attempt->forceFill([
                'status' => 'SUCCEEDED',
                'current_step' => 'COMPLETED',
                'finished_at' => now(),
                'last_error_code' => null,
                'last_error_message' => null,
            ])->save();

            if ($attempt->onboarding_registration_id) {
                $onboarding = OnboardingRegistration::query()->find($attempt->onboarding_registration_id);
                $onboarding?->forceFill([
                    'status' => 'COMPLETED',
                    'completed_at' => now(),
                    'last_error_code' => null,
                ])->save();
                if ($onboarding) {
                    $this->sendReadyEmail($tenant, $onboarding);
                }
            }
        } catch (Throwable $exception) {
            $errorCode = 'TENANT_PROVISIONING_FAILED';
            $tenant->forceFill(['database_status' => 'FAILED'])->saveQuietly();
            $attempt->forceFill([
                'status' => 'FAILED',
                'finished_at' => now(),
                'last_error_code' => $errorCode,
                'last_error_message' => 'Provisioning failed during '.$attempt->current_step.'.',
            ])->save();
            if ($attempt->onboarding_registration_id) {
                OnboardingRegistration::query()->whereKey($attempt->onboarding_registration_id)->update([
                    'status' => 'PROVISIONING_FAILED',
                    'last_error_code' => $errorCode,
                    'updated_at' => now(),
                ]);
            }
            Log::error('Tenant provisioning failed.', [
                'attempt_id' => $attempt->id,
                'tenant_id' => $tenant->id,
                'step' => $attempt->current_step,
                'exception' => $exception,
            ]);

            throw $exception;
        }
    }

    private function updateStep(TenantProvisioningAttempt $attempt, Tenant $tenant, string $step): void
    {
        $attempt->forceFill([
            'status' => 'RUNNING',
            'current_step' => $step,
            'started_at' => $attempt->started_at ?: now(),
            'finished_at' => null,
        ])->save();
        $tenant->forceFill(['database_status' => 'PROVISIONING'])->saveQuietly();
    }

    private function projectCompanyAdmin(Tenant $tenant): void
    {
        $central = DB::connection(config('tenancy.database.central_connection'));
        $membership = $central->table('tenant_memberships')
            ->where('tenant_id', $tenant->id)
            ->where('role_key', 'COMPANY_ADMIN')
            ->where('status', 'ACTIVE')
            ->first();
        $user = $membership ? User::query()->find($membership->user_id) : null;
        if (! $membership || ! $user) {
            throw new \RuntimeException('Active company admin membership is missing.');
        }

        $tenant->run(function () use ($membership, $user): void {
            $existingId = DB::table('tenant_users')->where('central_user_id', $user->id)->value('id');
            DB::table('tenant_users')->updateOrInsert(['central_user_id' => $user->id], [
                'id' => $existingId ?: (string) Str::ulid(),
                'central_membership_id' => $membership->id,
                'email' => $user->email,
                'full_name' => $user->full_name,
                'phone' => $user->phone,
                'employee_code' => null,
                'role_key' => 'COMPANY_ADMIN',
                'status' => 'ACTIVE',
                'primary_site_id' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
    }

    private function sendReadyEmail(Tenant $tenant, OnboardingRegistration $onboarding): void
    {
        $user = User::query()->find($onboarding->user_id);
        $domain = $tenant->domains()->where('is_primary', true)->value('domain');
        if (! $user || ! $domain) {
            return;
        }

        $scheme = config('onboarding.tenant_scheme');
        $port = (string) config('onboarding.tenant_port');
        $loginUrl = $scheme.'://'.$domain.($port !== '' ? ':'.$port : '');
        Mail::mailer(config('onboarding.mailer'))->to($user->email)->queue(
            new TenantProvisionedEmail($user->full_name, $onboarding->company_name, $loginUrl)
        );
    }
}
