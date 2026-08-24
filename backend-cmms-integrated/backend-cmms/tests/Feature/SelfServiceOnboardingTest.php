<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Jobs\ProvisionTenantJob;
use App\Mail\VerifyOnboardingEmail;
use App\Models\OnboardingRegistration;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class SelfServiceOnboardingTest extends TestCase
{
    use RefreshDatabase;

    private string $planId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->planId = (string) Str::ulid();
        DB::table('plans')->insert([
            'id' => $this->planId,
            'key' => 'SELF_SERVICE_TEST',
            'version_number' => 1,
            'name' => 'Self Service Test',
            'description' => 'Published plan for onboarding tests.',
            'monthly_price' => 500000,
            'annual_price' => 5000000,
            'currency_code' => 'IDR',
            'max_users' => 10,
            'max_assets' => 100,
            'max_sites' => 1,
            'status' => 'PUBLISHED',
            'is_public' => true,
            'effective_from' => now()->subMinute(),
            'effective_until' => null,
            'published_at' => now(),
            'published_by' => null,
            'lock_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_new_user_can_verify_email_and_start_trial_without_super_admin(): void
    {
        Mail::fake();
        $email = 'owner-'.Str::lower(Str::random(8)).'@example.test';
        $idempotency = 'register-'.Str::ulid();
        $register = $this->withHeader('Idempotency-Key', $idempotency)
            ->postJson('http://localhost/api/v1/onboarding/register', $this->registrationPayload($email))
            ->assertAccepted()
            ->assertJsonPath('data.status', 'EMAIL_VERIFICATION_PENDING');

        $onboardingId = $register->json('data.onboarding_id');
        $this->assertDatabaseCount('tenants', 0);
        $this->assertDatabaseHas('onboarding_registrations', [
            'id' => $onboardingId,
            'requested_slug' => 'factory-'.Str::lower(substr($email, 6, 8)),
        ]);

        $verificationToken = null;
        Mail::assertQueued(VerifyOnboardingEmail::class, function (VerifyOnboardingEmail $mail) use ($email, &$verificationToken): bool {
            parse_str((string) parse_url($mail->verificationUrl, PHP_URL_QUERY), $query);
            $verificationToken = $query['token'] ?? null;

            return $mail->hasTo($email)
                && $mail->envelope()->from->address === config('mail.from.address')
                && is_string($verificationToken);
        });
        $this->assertNotNull($verificationToken);

        $this->postJson('http://localhost/api/v1/onboarding/verify-email', ['token' => $verificationToken])
            ->assertOk()
            ->assertJsonPath('data.status', 'READY_TO_PROVISION');
        $this->postJson('http://localhost/api/v1/onboarding/verify-email', ['token' => $verificationToken])
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'EMAIL_VERIFICATION_INVALID');

        $login = $this->postJson('http://localhost/api/v1/auth/login', [
            'email' => $email,
            'password' => 'Password123',
            'device_name' => 'onboarding-test',
        ])->assertOk();
        $token = $login->json('data.token');

        Queue::fake([ProvisionTenantJob::class]);
        $provisionKey = 'provision-'.Str::ulid();
        $this->withToken($token)->withHeader('Idempotency-Key', $provisionKey)
            ->postJson("http://localhost/api/v1/onboarding/{$onboardingId}/provision")
            ->assertAccepted()
            ->assertJsonPath('data.status', 'PROVISIONING')
            ->assertJsonPath('data.database_status', 'PENDING');

        Queue::assertPushed(ProvisionTenantJob::class, 1);
        $this->assertDatabaseCount('tenants', 1);
        $this->assertDatabaseCount('subscriptions', 1);
        $this->assertDatabaseCount('tenant_memberships', 1);
        $this->assertDatabaseCount('tenant_provisioning_attempts', 1);
        $this->assertDatabaseHas('tenant_memberships', ['role_key' => 'COMPANY_ADMIN', 'status' => 'ACTIVE']);
        $this->assertDatabaseHas('subscriptions', ['plan_id' => $this->planId, 'status' => 'TRIAL']);

        $this->withToken($token)->withHeader('Idempotency-Key', $provisionKey)
            ->postJson("http://localhost/api/v1/onboarding/{$onboardingId}/provision")
            ->assertAccepted();
        $this->assertDatabaseCount('tenants', 1);
        Queue::assertPushed(ProvisionTenantJob::class, 1);

        $this->withToken($token)->withHeader('Idempotency-Key', 'different-key')
            ->postJson("http://localhost/api/v1/onboarding/{$onboardingId}/provision")
            ->assertConflict()
            ->assertJsonPath('error.code', 'IDEMPOTENCY_CONFLICT');
    }

    public function test_unverified_self_service_user_cannot_login_and_resend_rotates_token(): void
    {
        Mail::fake();
        $email = 'owner-'.Str::lower(Str::random(8)).'@example.test';
        $this->withHeader('Idempotency-Key', 'register-'.Str::ulid())
            ->postJson('http://localhost/api/v1/onboarding/register', $this->registrationPayload($email))
            ->assertAccepted();
        $before = OnboardingRegistration::query()->sole();
        $oldHash = $before->email_verification_token_hash;

        $this->postJson('http://localhost/api/v1/auth/login', [
            'email' => $email,
            'password' => 'Password123',
        ])->assertForbidden()->assertJsonPath('error.code', 'EMAIL_VERIFICATION_REQUIRED');

        $this->postJson('http://localhost/api/v1/onboarding/resend-verification', ['email' => $email])
            ->assertAccepted();
        $after = $before->fresh();
        $this->assertNotSame($oldHash, $after->email_verification_token_hash);
        $this->assertSame(2, $after->verification_send_count);
        Mail::assertQueuedCount(2);

        $this->postJson('http://localhost/api/v1/onboarding/resend-verification', ['email' => 'unknown@example.test'])
            ->assertAccepted()
            ->assertJsonMissing(['onboarding_id']);
    }

    public function test_public_plan_filter_and_owner_scope_are_enforced(): void
    {
        $privatePlanId = (string) Str::ulid();
        DB::table('plans')->insert([
            'id' => $privatePlanId, 'key' => 'PRIVATE', 'version_number' => 1, 'name' => 'Private',
            'description' => null, 'monthly_price' => 1, 'annual_price' => null, 'currency_code' => 'IDR',
            'max_users' => null, 'max_assets' => null, 'max_sites' => null, 'status' => 'PUBLISHED', 'is_public' => false,
            'effective_from' => now(), 'effective_until' => null, 'published_at' => now(), 'published_by' => null,
            'lock_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->getJson('http://localhost/api/v1/public/plans')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->planId);
        $this->getJson("http://localhost/api/v1/public/plans/{$privatePlanId}")
            ->assertNotFound();

        $first = User::query()->create([
            'email' => 'first@example.test', 'password_hash' => 'unused', 'full_name' => 'First',
            'status' => 'ACTIVE', 'email_verified_at' => now(),
        ]);
        $second = User::query()->create([
            'email' => 'second@example.test', 'password_hash' => 'unused', 'full_name' => 'Second',
            'status' => 'ACTIVE', 'email_verified_at' => now(),
        ]);
        $row = OnboardingRegistration::query()->create([
            'user_id' => $first->id, 'selected_plan_id' => $this->planId, 'source' => 'SELF_SERVICE',
            'status' => 'READY_TO_PROVISION', 'company_name' => 'Scoped Company', 'company_email' => 'company@example.test',
            'timezone' => 'Asia/Jakarta', 'requested_slug' => 'scoped-company', 'billing_period' => 'MONTHLY',
            'terms_version' => 'test', 'privacy_version' => 'test', 'consented_at' => now(), 'email_verified_at' => now(),
            'registration_idempotency_key' => 'scope-test', 'registration_payload_hash' => hash('sha256', 'scope'),
            'expires_at' => now()->addDay(),
        ]);

        $this->actingAs($second)
            ->getJson("http://localhost/api/v1/onboarding/{$row->id}")
            ->assertNotFound()
            ->assertJsonPath('error.code', 'ONBOARDING_NOT_FOUND');
    }

    private function registrationPayload(string $email): array
    {
        $suffix = Str::lower(substr($email, 6, 8));

        return [
            'full_name' => 'Factory Owner',
            'email' => $email,
            'phone' => '+628123456789',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
            'company' => [
                'name' => 'Factory '.$suffix,
                'email' => 'maintenance-'.$suffix.'@example.test',
                'phone' => '+6231123456',
                'industry' => 'Food & Beverage',
                'timezone' => 'Asia/Jakarta',
                'requested_slug' => 'factory-'.$suffix,
            ],
            'plan_id' => $this->planId,
            'billing_period' => 'MONTHLY',
            'terms_accepted' => true,
            'privacy_accepted' => true,
        ];
    }
}
