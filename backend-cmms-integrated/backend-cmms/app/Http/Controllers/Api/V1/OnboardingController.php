<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Data\ProvisionTenantData;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Mail\VerifyOnboardingEmail;
use App\Models\OnboardingRegistration;
use App\Models\Tenant;
use App\Models\TenantProvisioningAttempt;
use App\Models\User;
use App\Services\AuditService;
use App\Services\TenantProvisioningService;
use App\Support\ApiData;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class OnboardingController extends Controller
{
    public function __construct(
        private readonly TenantProvisioningService $provisioning,
        private readonly AuditService $audit,
    ) {}

    public function register(Request $request): mixed
    {
        $data = $request->validate([
            'full_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email:rfc', 'max:320'],
            'phone' => ['nullable', 'string', 'max:32'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
            'company' => ['required', 'array'],
            'company.name' => ['required', 'string', 'max:255'],
            'company.email' => ['required', 'email:rfc', 'max:320'],
            'company.phone' => ['nullable', 'string', 'max:32'],
            'company.industry' => ['nullable', 'string', 'max:100'],
            'company.timezone' => ['required', 'timezone:all'],
            'company.requested_slug' => ['required', 'string', 'min:3', 'max:100'],
            'plan_id' => ['required', 'ulid'],
            'billing_period' => ['required', Rule::in(['MONTHLY', 'YEARLY'])],
            'terms_accepted' => ['accepted'],
            'privacy_accepted' => ['accepted'],
        ]);
        $idempotencyKey = $this->idempotencyKey($request);
        $email = mb_strtolower(trim($data['email']));
        $slug = $this->normalizeSlug($data['company']['requested_slug']);
        $payloadHash = $this->registrationPayloadHash($data, $email, $slug);

        if ($existing = OnboardingRegistration::query()->where('registration_idempotency_key', $idempotencyKey)->first()) {
            if (! hash_equals($existing->registration_payload_hash, $payloadHash)) {
                throw new ApiException('IDEMPOTENCY_CONFLICT', 'This idempotency key was used with a different registration payload.', 409);
            }

            return ApiData::item($this->registrationPayload($existing), 202);
        }

        $plan = $this->availablePlan($data['plan_id']);
        $this->ensureBillingPeriod($plan, $data['billing_period']);
        if (User::withTrashed()->where('email', $email)->exists()) {
            throw new ApiException('ACCOUNT_ALREADY_EXISTS', 'An account with this email already exists. Sign in to continue.', 409);
        }
        $this->ensureSlugAvailable($slug);

        $plainToken = Str::random(64);
        try {
            $onboarding = DB::connection(config('tenancy.database.central_connection'))->transaction(function () use ($request, $data, $email, $slug, $plainToken, $idempotencyKey, $payloadHash): OnboardingRegistration {
                $user = User::query()->create([
                    'email' => $email,
                    'password_hash' => Hash::make($data['password']),
                    'full_name' => $data['full_name'],
                    'phone' => $data['phone'] ?? null,
                    'status' => 'ACTIVE',
                    'must_change_password' => false,
                ]);

                return OnboardingRegistration::query()->create([
                    'user_id' => $user->id,
                    'selected_plan_id' => $data['plan_id'],
                    'source' => 'SELF_SERVICE',
                    'status' => 'EMAIL_VERIFICATION_PENDING',
                    'company_name' => $data['company']['name'],
                    'company_email' => mb_strtolower($data['company']['email']),
                    'company_phone' => $data['company']['phone'] ?? null,
                    'industry' => $data['company']['industry'] ?? null,
                    'timezone' => $data['company']['timezone'],
                    'requested_slug' => $slug,
                    'billing_period' => $data['billing_period'],
                    'terms_version' => config('onboarding.terms_version'),
                    'privacy_version' => config('onboarding.privacy_version'),
                    'consented_at' => now(),
                    'email_verification_token_hash' => hash('sha256', $plainToken),
                    'email_verification_expires_at' => now()->addMinutes((int) config('onboarding.verification_ttl_minutes')),
                    'verification_sent_at' => now(),
                    'verification_send_count' => 1,
                    'registration_idempotency_key' => $idempotencyKey,
                    'registration_payload_hash' => $payloadHash,
                    'expires_at' => now()->addHours((int) config('onboarding.registration_ttl_hours')),
                    'metadata' => ['ip' => $request->ip(), 'user_agent' => $request->userAgent()],
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            if ($existing = OnboardingRegistration::query()->where('registration_idempotency_key', $idempotencyKey)->first()) {
                return ApiData::item($this->registrationPayload($existing), 202);
            }
            throw new ApiException('REGISTRATION_CONFLICT', 'The email or company slug is already registered.', 409);
        }

        $this->queueVerification($onboarding, $plainToken);
        $this->audit->platform($request, 'onboarding.registered', 'ONBOARDING', $onboarding->id, null, [
            'status' => $onboarding->status,
            'selected_plan_id' => $onboarding->selected_plan_id,
            'requested_slug' => $onboarding->requested_slug,
        ]);

        return ApiData::item($this->registrationPayload($onboarding), 202);
    }

    public function resendVerification(Request $request): mixed
    {
        $data = $request->validate(['email' => ['required', 'email:rfc', 'max:320']]);
        $user = User::query()->where('email', mb_strtolower(trim($data['email'])))->first();
        $onboarding = $user ? OnboardingRegistration::query()
            ->where('user_id', $user->id)
            ->where('status', 'EMAIL_VERIFICATION_PENDING')
            ->where('expires_at', '>', now())
            ->latest('created_at')
            ->first() : null;

        if ($onboarding && ! $user->email_verified_at) {
            $plainToken = Str::random(64);
            $onboarding->forceFill([
                'email_verification_token_hash' => hash('sha256', $plainToken),
                'email_verification_expires_at' => now()->addMinutes((int) config('onboarding.verification_ttl_minutes')),
                'verification_sent_at' => now(),
                'verification_send_count' => $onboarding->verification_send_count + 1,
            ])->save();
            $this->queueVerification($onboarding, $plainToken);
        }

        return ApiData::item([
            'message' => 'If a pending registration exists, a new verification email has been sent.',
        ], 202);
    }

    public function verifyEmail(Request $request): mixed
    {
        $data = $request->validate(['token' => ['required', 'string', 'min:32', 'max:255']]);
        $hash = hash('sha256', $data['token']);
        $onboarding = DB::connection(config('tenancy.database.central_connection'))->transaction(function () use ($hash): OnboardingRegistration {
            $registration = OnboardingRegistration::query()->where('email_verification_token_hash', $hash)->lockForUpdate()->first();
            if (! $registration) {
                throw new ApiException('EMAIL_VERIFICATION_INVALID', 'The verification token is invalid or has already been used.', 422);
            }
            if (! $registration->email_verification_expires_at || $registration->email_verification_expires_at->isPast()) {
                throw new ApiException('EMAIL_VERIFICATION_EXPIRED', 'The verification token has expired. Request a new email.', 422);
            }
            if ($registration->expires_at->isPast()) {
                $registration->forceFill(['status' => 'EXPIRED'])->save();
                throw new ApiException('ONBOARDING_EXPIRED', 'This onboarding registration has expired.', 409);
            }

            $verifiedAt = now();
            User::query()->whereKey($registration->user_id)->whereNull('email_verified_at')->update([
                'email_verified_at' => $verifiedAt,
                'updated_at' => now(),
            ]);
            $registration->forceFill([
                'status' => 'READY_TO_PROVISION',
                'email_verified_at' => $verifiedAt,
                'email_verification_token_hash' => null,
                'email_verification_expires_at' => null,
            ])->save();

            return $registration;
        });
        $this->audit->platform($request, 'onboarding.email_verified', 'ONBOARDING', $onboarding->id, null, ['status' => $onboarding->status]);

        return ApiData::item([
            'onboarding_id' => $onboarding->id,
            'status' => $onboarding->status,
            'next_step' => 'LOGIN_AND_START_TRIAL',
        ]);
    }

    public function show(Request $request, string $onboarding): mixed
    {
        return ApiData::item($this->details($this->owned($request, $onboarding)));
    }

    public function update(Request $request, string $onboarding): mixed
    {
        $row = $this->owned($request, $onboarding);
        if (! in_array($row->status, ['EMAIL_VERIFICATION_PENDING', 'READY_TO_PROVISION', 'PLAN_SELECTION_REQUIRED'], true)) {
            throw new ApiException('ONBOARDING_IMMUTABLE', 'Onboarding cannot be changed after provisioning starts.', 409);
        }
        $data = $request->validate([
            'company_name' => ['sometimes', 'string', 'max:255'],
            'company_email' => ['sometimes', 'email:rfc', 'max:320'],
            'company_phone' => ['nullable', 'string', 'max:32'],
            'industry' => ['nullable', 'string', 'max:100'],
            'timezone' => ['sometimes', 'timezone:all'],
            'requested_slug' => ['sometimes', 'string', 'min:3', 'max:100'],
            'plan_id' => ['sometimes', 'ulid'],
            'billing_period' => ['sometimes', Rule::in(['MONTHLY', 'YEARLY'])],
        ]);
        $planId = $data['plan_id'] ?? $row->selected_plan_id;
        $billingPeriod = $data['billing_period'] ?? $row->billing_period;
        $plan = $this->availablePlan($planId);
        $this->ensureBillingPeriod($plan, $billingPeriod);
        if (isset($data['requested_slug'])) {
            $slug = $this->normalizeSlug($data['requested_slug']);
            if ($slug !== $row->requested_slug) {
                $this->ensureSlugAvailable($slug);
            }
            $data['requested_slug'] = $slug;
        }
        if (isset($data['company_email'])) {
            $data['company_email'] = mb_strtolower($data['company_email']);
        }
        $data['selected_plan_id'] = $planId;
        unset($data['plan_id']);
        $data['status'] = $row->email_verified_at ? 'READY_TO_PROVISION' : $row->status;
        $row->forceFill($data)->save();
        $this->audit->platform($request, 'onboarding.updated', 'ONBOARDING', $row->id, null, $data);

        return ApiData::item($this->details($row->fresh()));
    }

    public function provision(Request $request, string $onboarding): mixed
    {
        $row = $this->owned($request, $onboarding);
        $key = $this->idempotencyKey($request);
        $payloadHash = hash('sha256', $row->id.'|START_TRIAL');
        if ($row->provision_idempotency_key) {
            if ($row->provision_idempotency_key !== $key || ! hash_equals((string) $row->provision_payload_hash, $payloadHash)) {
                throw new ApiException('IDEMPOTENCY_CONFLICT', 'This onboarding was already provisioned with another idempotency request.', 409);
            }

            return ApiData::item($this->details($row), 202);
        }
        if ($row->status !== 'READY_TO_PROVISION' || ! $request->user()->email_verified_at || ! $row->email_verified_at) {
            throw new ApiException('EMAIL_VERIFICATION_REQUIRED', 'Verify the account email before starting the trial.', 422);
        }
        if ($row->expires_at->isPast()) {
            $row->forceFill(['status' => 'EXPIRED'])->save();
            throw new ApiException('ONBOARDING_EXPIRED', 'This onboarding registration has expired.', 409);
        }
        $plan = $this->availablePlan($row->selected_plan_id);
        $this->ensureBillingPeriod($plan, $row->billing_period);

        $row->forceFill([
            'provision_idempotency_key' => $key,
            'provision_payload_hash' => $payloadHash,
        ])->save();
        $domain = $row->requested_slug.'.'.config('onboarding.tenant_domain_suffix');
        $attempt = $this->provisioning->start(new ProvisionTenantData(
            requestId: 'self-service:'.$key,
            source: 'SELF_SERVICE',
            actorUserId: $request->user()->id,
            ownerUserId: $request->user()->id,
            companyName: $row->company_name,
            companyEmail: $row->company_email,
            companyPhone: $row->company_phone,
            industry: $row->industry,
            timezone: $row->timezone,
            code: $this->tenantCode($row->company_name, $row->id),
            slug: $row->requested_slug,
            domain: $domain,
            planId: $row->selected_plan_id,
            billingPeriod: $row->billing_period,
            trialDays: (int) config('onboarding.trial_days'),
            onboardingId: $row->id,
            context: ['ip' => $request->ip(), 'user_agent' => $request->userAgent()],
        ));
        $this->audit->platform($request, 'onboarding.provisioning_started', 'ONBOARDING', $row->id, null, [
            'tenant_id' => $attempt->tenant_id,
            'attempt_id' => $attempt->id,
        ], $attempt->tenant_id);

        return ApiData::item($this->details($row->fresh()), 202);
    }

    public function status(Request $request, string $onboarding): mixed
    {
        return ApiData::item($this->details($this->owned($request, $onboarding)));
    }

    public function retry(Request $request, string $onboarding): mixed
    {
        $row = $this->owned($request, $onboarding);
        if ($row->status !== 'PROVISIONING_FAILED' || ! $row->tenant_id) {
            throw new ApiException('ONBOARDING_NOT_RETRYABLE', 'Only failed provisioning can be retried.', 409);
        }
        $tenant = Tenant::query()->findOrFail($row->tenant_id);
        $attempt = $this->provisioning->retry(
            $tenant,
            'self-service-retry:'.$this->idempotencyKey($request),
            'SELF_SERVICE',
            $row->id,
        );

        return ApiData::item($this->details($row->fresh()), 202);
    }

    public function cancel(Request $request, string $onboarding): mixed
    {
        $row = $this->owned($request, $onboarding);
        if ($row->tenant_id || ! in_array($row->status, ['EMAIL_VERIFICATION_PENDING', 'READY_TO_PROVISION', 'PLAN_SELECTION_REQUIRED'], true)) {
            throw new ApiException('ONBOARDING_CANCEL_FORBIDDEN', 'Onboarding cannot be cancelled after provisioning starts.', 409);
        }
        $row->forceFill([
            'status' => 'CANCELLED',
            'email_verification_token_hash' => null,
            'email_verification_expires_at' => null,
        ])->save();
        $this->audit->platform($request, 'onboarding.cancelled', 'ONBOARDING', $row->id, null, ['status' => 'CANCELLED']);

        return ApiData::item(['onboarding_id' => $row->id, 'status' => 'CANCELLED']);
    }

    private function owned(Request $request, string $id): OnboardingRegistration
    {
        return OnboardingRegistration::query()->whereKey($id)->where('user_id', $request->user()->id)->first()
            ?? throw new ApiException('ONBOARDING_NOT_FOUND', 'Onboarding registration was not found.', 404);
    }

    private function availablePlan(string $id): object
    {
        return DB::table('plans')
            ->where('id', $id)
            ->where('status', 'PUBLISHED')
            ->where('is_public', true)
            ->where(fn ($query) => $query->whereNull('effective_from')->orWhere('effective_from', '<=', now()))
            ->where(fn ($query) => $query->whereNull('effective_until')->orWhere('effective_until', '>', now()))
            ->first() ?? throw new ApiException('PLAN_NOT_AVAILABLE', 'The selected public plan is not available.', 422);
    }

    private function ensureBillingPeriod(object $plan, string $billingPeriod): void
    {
        if ($billingPeriod === 'YEARLY' && $plan->annual_price === null) {
            throw new ApiException('BILLING_PERIOD_NOT_AVAILABLE', 'Yearly billing is not available for this plan.', 422);
        }
    }

    private function normalizeSlug(string $value): string
    {
        $slug = Str::slug(Str::lower(trim($value)));
        if (strlen($slug) < 3 || in_array($slug, config('onboarding.reserved_slugs'), true)) {
            throw new ApiException('TENANT_SLUG_INVALID', 'Choose another company URL slug.', 422);
        }

        return $slug;
    }

    private function ensureSlugAvailable(string $slug): void
    {
        $domain = $slug.'.'.config('onboarding.tenant_domain_suffix');
        if (DB::table('tenants')->where('slug', $slug)->exists()
            || DB::table('domains')->where('domain', $domain)->exists()
            || OnboardingRegistration::query()->where('requested_slug', $slug)->whereNotIn('status', ['EXPIRED', 'CANCELLED'])->exists()) {
            throw new ApiException('TENANT_SLUG_UNAVAILABLE', 'The requested company URL is not available.', 409);
        }
    }

    private function idempotencyKey(Request $request): string
    {
        $key = trim((string) $request->header('Idempotency-Key'));
        if ($key === '' || strlen($key) > 120) {
            throw new ApiException('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.', 422);
        }

        return $key;
    }

    private function registrationPayloadHash(array $data, string $email, string $slug): string
    {
        return hash('sha256', json_encode([
            'email' => $email,
            'full_name' => $data['full_name'],
            'phone' => $data['phone'] ?? null,
            'password_fingerprint' => hash('sha256', $data['password']),
            'company' => $data['company'],
            'slug' => $slug,
            'plan_id' => $data['plan_id'],
            'billing_period' => $data['billing_period'],
        ], JSON_THROW_ON_ERROR));
    }

    private function queueVerification(OnboardingRegistration $onboarding, string $plainToken): void
    {
        $user = User::query()->findOrFail($onboarding->user_id);
        $url = config('onboarding.frontend_url').'/verify-email?token='.urlencode($plainToken);
        Mail::mailer(config('onboarding.mailer'))->to($user->email)->queue(new VerifyOnboardingEmail(
            $user->full_name,
            $onboarding->company_name,
            $url,
            (int) config('onboarding.verification_ttl_minutes'),
        ));
    }

    private function registrationPayload(OnboardingRegistration $row): array
    {
        return [
            'onboarding_id' => $row->id,
            'status' => $row->status,
            'email_verification_expires_at' => $row->email_verification_expires_at,
            'message' => 'Check your email to verify the registration.',
        ];
    }

    private function details(OnboardingRegistration $row): array
    {
        $tenant = $row->tenant_id ? Tenant::query()->with('domains')->find($row->tenant_id) : null;
        $attempt = $row->tenant_id ? TenantProvisioningAttempt::query()->where('tenant_id', $row->tenant_id)->latest('created_at')->first() : null;
        $subscription = $row->tenant_id ? DB::table('subscriptions')->where('tenant_id', $row->tenant_id)->latest('created_at')->first() : null;

        return [
            'id' => $row->id,
            'status' => $row->status,
            'company_name' => $row->company_name,
            'requested_slug' => $row->requested_slug,
            'selected_plan_id' => $row->selected_plan_id,
            'billing_period' => $row->billing_period,
            'email_verified_at' => $row->email_verified_at,
            'expires_at' => $row->expires_at,
            'tenant_id' => $row->tenant_id,
            'database_status' => $tenant?->database_status,
            'current_step' => $attempt?->current_step,
            'retryable' => $row->status === 'PROVISIONING_FAILED',
            'last_error_code' => $row->last_error_code,
            'tenant_base_url' => $tenant?->domains->first()
                ? $this->tenantBaseUrl($tenant->domains->first()->domain)
                : null,
            'trial_ends_at' => $subscription?->trial_ends_at,
        ];
    }

    private function tenantBaseUrl(string $domain): string
    {
        $port = (string) config('onboarding.tenant_port');

        return config('onboarding.tenant_scheme').'://'.$domain.($port !== '' ? ':'.$port : '').'/api/v1';
    }

    private function tenantCode(string $companyName, string $onboardingId): string
    {
        $base = Str::upper(Str::slug($companyName, '_'));

        return Str::limit($base, 48, '').'_'.Str::upper(substr($onboardingId, -8));
    }
}
