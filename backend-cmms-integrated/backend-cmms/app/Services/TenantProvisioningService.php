<?php

declare(strict_types=1);

namespace App\Services;

use App\Data\ProvisionTenantData;
use App\Exceptions\ApiException;
use App\Jobs\ProvisionTenantJob;
use App\Models\OnboardingRegistration;
use App\Models\Tenant;
use App\Models\TenantProvisioningAttempt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TenantProvisioningService
{
    public function start(ProvisionTenantData $data, bool $synchronous = false): TenantProvisioningAttempt
    {
        $central = DB::connection(config('tenancy.database.central_connection'));
        $attempt = $central->transaction(function () use ($central, $data): TenantProvisioningAttempt {
            $existingAttempt = TenantProvisioningAttempt::query()->where('request_id', $data->requestId)->first();
            if ($existingAttempt) {
                return $existingAttempt;
            }

            $onboarding = $data->onboardingId
                ? OnboardingRegistration::query()->whereKey($data->onboardingId)->lockForUpdate()->firstOrFail()
                : null;
            if ($onboarding?->tenant_id) {
                return TenantProvisioningAttempt::query()
                    ->where('onboarding_registration_id', $onboarding->id)
                    ->latest('created_at')
                    ->firstOrFail();
            }

            $plan = $central->table('plans')->where('id', $data->planId)->where('status', 'PUBLISHED')->lockForUpdate()->first();
            if (! $plan) {
                throw new ApiException('PLAN_NOT_AVAILABLE', 'The selected plan is no longer available.', 422);
            }
            if ($data->billingPeriod === 'YEARLY' && $plan->annual_price === null) {
                throw new ApiException('BILLING_PERIOD_NOT_AVAILABLE', 'Yearly billing is not available for this plan.', 422);
            }

            $tenantId = (string) Str::ulid();
            // The shared provisioner owns the database pipeline. Suppress the legacy
            // TenantCreated listener here so it cannot provision before commit.
            $tenant = Tenant::withoutEvents(fn () => Tenant::create([
                'id' => $tenantId,
                'code' => Str::upper($data->code),
                'name' => $data->companyName,
                'slug' => $data->slug,
                'email' => mb_strtolower($data->companyEmail),
                'phone' => $data->companyPhone,
                'industry' => $data->industry,
                'timezone' => $data->timezone,
                'status' => 'TRIAL',
                'database_name' => config('tenancy.database.prefix').$tenantId.config('tenancy.database.suffix'),
                'database_status' => 'PENDING',
                'created_by' => $data->actorUserId,
            ]));
            $tenant->domains()->create(['domain' => Str::lower($data->domain), 'is_primary' => true]);

            $membershipId = (string) Str::ulid();
            $central->table('tenant_memberships')->insert([
                'id' => $membershipId,
                'tenant_id' => $tenantId,
                'user_id' => $data->ownerUserId,
                'role_key' => 'COMPANY_ADMIN',
                'status' => 'ACTIVE',
                'joined_at' => now(),
                'deactivated_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $trialEndsAt = now()->addDays($data->trialDays);
            $central->table('subscriptions')->insert([
                'id' => (string) Str::ulid(),
                'tenant_id' => $tenantId,
                'plan_id' => $plan->id,
                'status' => 'TRIAL',
                'billing_period' => $data->billingPeriod,
                'price_snapshot' => $data->billingPeriod === 'YEARLY' ? $plan->annual_price : $plan->monthly_price,
                'currency_code' => $plan->currency_code,
                'starts_at' => now(),
                'trial_ends_at' => $trialEndsAt,
                'current_period_start' => now(),
                'current_period_end' => $trialEndsAt,
                'grace_ends_at' => null,
                'auto_renew' => true,
                'cancelled_at' => null,
                'cancellation_reason' => null,
                'notes' => 'Created during '.$data->source.' tenant onboarding.',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $attempt = TenantProvisioningAttempt::query()->create([
                'tenant_id' => $tenantId,
                'onboarding_registration_id' => $onboarding?->id,
                'request_id' => $data->requestId,
                'source' => $data->source,
                'status' => 'QUEUED',
                'current_step' => 'QUEUED',
                'attempt_number' => 1,
                'context' => $data->context,
            ]);

            if ($onboarding) {
                $onboarding->forceFill([
                    'tenant_id' => $tenantId,
                    'status' => 'PROVISIONING',
                    'last_error_code' => null,
                ])->save();
            }

            return $attempt;
        });

        if ($attempt->status === 'QUEUED') {
            $synchronous
                ? ProvisionTenantJob::dispatchSync($attempt->id)
                : ProvisionTenantJob::dispatch($attempt->id);
        }

        return $attempt->fresh();
    }

    public function retry(Tenant $tenant, string $requestId, string $source, ?string $onboardingId = null, bool $synchronous = false): TenantProvisioningAttempt
    {
        if ($tenant->database_status === 'READY') {
            throw new ApiException('TENANT_ALREADY_READY', 'Tenant database is already ready.', 409);
        }

        $central = DB::connection(config('tenancy.database.central_connection'));
        $attempt = $central->transaction(function () use ($tenant, $requestId, $source, $onboardingId): TenantProvisioningAttempt {
            if ($existing = TenantProvisioningAttempt::query()->where('request_id', $requestId)->first()) {
                return $existing;
            }

            $attemptNumber = (int) TenantProvisioningAttempt::query()->where('tenant_id', $tenant->id)->max('attempt_number') + 1;
            $attempt = TenantProvisioningAttempt::query()->create([
                'tenant_id' => $tenant->id,
                'onboarding_registration_id' => $onboardingId,
                'request_id' => $requestId,
                'source' => $source,
                'status' => 'QUEUED',
                'current_step' => 'QUEUED',
                'attempt_number' => max(1, $attemptNumber),
                'context' => ['retry' => true],
            ]);
            $tenant->forceFill(['database_status' => 'PENDING'])->saveQuietly();
            if ($onboardingId) {
                OnboardingRegistration::query()->whereKey($onboardingId)->update([
                    'status' => 'PROVISIONING',
                    'last_error_code' => null,
                    'updated_at' => now(),
                ]);
            }

            return $attempt;
        });

        if ($attempt->status === 'QUEUED') {
            $synchronous
                ? ProvisionTenantJob::dispatchSync($attempt->id)
                : ProvisionTenantJob::dispatch($attempt->id);
        }

        return $attempt->fresh();
    }
}
