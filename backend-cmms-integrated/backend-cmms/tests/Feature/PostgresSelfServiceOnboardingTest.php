<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Jobs\ProvisionTenantJob;
use App\Mail\VerifyOnboardingEmail;
use App\Models\OnboardingRegistration;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class PostgresSelfServiceOnboardingTest extends TestCase
{
    private ?string $planId = null;

    private ?string $userId = null;

    private ?string $onboardingId = null;

    private ?string $tenantId = null;

    protected function setUp(): void
    {
        parent::setUp();
        if (! filter_var(env('RUN_TENANCY_INTEGRATION', false), FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set RUN_TENANCY_INTEGRATION=true against a migrated PostgreSQL central database.');
        }
    }

    protected function tearDown(): void
    {
        tenancy()->end();
        $central = DB::connection(config('tenancy.database.central_connection'));
        if ($this->tenantId) {
            $central->table('tenant_provisioning_attempts')->where('tenant_id', $this->tenantId)->delete();
        }
        if ($this->onboardingId) {
            $central->table('onboarding_registrations')->where('id', $this->onboardingId)->delete();
        }
        if ($this->tenantId) {
            $central->table('subscriptions')->where('tenant_id', $this->tenantId)->delete();
            $central->table('tenant_memberships')->where('tenant_id', $this->tenantId)->delete();
            $central->table('platform_audit_logs')->where('tenant_id', $this->tenantId)->delete();
            if ($tenant = Tenant::query()->find($this->tenantId)) {
                if ($tenant->database()->manager()->databaseExists($tenant->database_name)) {
                    $tenant->delete();
                } else {
                    Tenant::withoutEvents(fn () => $tenant->delete());
                }
            }
        }
        if ($this->userId) {
            $central->table('personal_access_tokens')->where('tokenable_id', $this->userId)->delete();
            $central->table('platform_audit_logs')->where('actor_user_id', $this->userId)->delete();
            User::withTrashed()->find($this->userId)?->forceDelete();
        }
        if ($this->planId) {
            $central->table('plans')->where('id', $this->planId)->delete();
        }

        parent::tearDown();
    }

    public function test_self_service_flow_provisions_a_real_isolated_postgresql_database(): void
    {
        Mail::fake();
        Queue::fake([ProvisionTenantJob::class]);
        $suffix = Str::lower(Str::random(10));
        $email = "self-{$suffix}@example.test";
        $this->planId = (string) Str::ulid();
        DB::table('plans')->insert([
            'id' => $this->planId, 'key' => 'SELF_'.Str::upper($suffix), 'version_number' => 1,
            'name' => 'Self-Service Integration', 'description' => null, 'monthly_price' => 500000,
            'annual_price' => 5000000, 'currency_code' => 'IDR', 'max_users' => 10, 'max_assets' => 100,
            'max_sites' => 1, 'status' => 'PUBLISHED', 'is_public' => true, 'effective_from' => now()->subMinute(),
            'effective_until' => null, 'published_at' => now(), 'published_by' => null, 'lock_version' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $registered = $this->withHeader('Idempotency-Key', "register-{$suffix}")
            ->postJson('http://localhost/api/v1/onboarding/register', [
                'full_name' => 'PostgreSQL Owner', 'email' => $email,
                'password' => 'Password123', 'password_confirmation' => 'Password123',
                'company' => [
                    'name' => 'Integration Factory', 'email' => $email, 'industry' => 'Food & Beverage',
                    'timezone' => 'Asia/Jakarta', 'requested_slug' => "integration-{$suffix}",
                ],
                'plan_id' => $this->planId, 'billing_period' => 'MONTHLY',
                'terms_accepted' => true, 'privacy_accepted' => true,
            ])->assertAccepted();
        $this->onboardingId = $registered->json('data.onboarding_id');
        $this->userId = DB::table('onboarding_registrations')->where('id', $this->onboardingId)->value('user_id');
        $expiresAt = OnboardingRegistration::query()->findOrFail($this->onboardingId)->email_verification_expires_at;
        $this->assertTrue($expiresAt->isFuture(), 'Verification expiry '.$expiresAt->toIso8601String().' is not after '.now()->toIso8601String());

        $verificationToken = null;
        Mail::assertQueued(VerifyOnboardingEmail::class, function (VerifyOnboardingEmail $mail) use (&$verificationToken): bool {
            parse_str((string) parse_url($mail->verificationUrl, PHP_URL_QUERY), $query);
            $verificationToken = $query['token'] ?? null;

            return is_string($verificationToken);
        });
        $this->postJson('http://localhost/api/v1/onboarding/verify-email', ['token' => $verificationToken])->assertOk();
        $token = $this->postJson('http://localhost/api/v1/auth/login', [
            'email' => $email, 'password' => 'Password123', 'device_name' => 'postgres-onboarding-test',
        ])->assertOk()->json('data.token');

        $this->withToken($token)->withHeader('Idempotency-Key', "provision-{$suffix}")
            ->postJson("http://localhost/api/v1/onboarding/{$this->onboardingId}/provision")
            ->assertAccepted();
        $attempt = DB::table('tenant_provisioning_attempts')->where('onboarding_registration_id', $this->onboardingId)->sole();
        $this->tenantId = $attempt->tenant_id;
        (new ProvisionTenantJob($attempt->id))->handle();

        $tenant = Tenant::query()->findOrFail($this->tenantId);
        $this->assertSame('READY', $tenant->database_status);
        $this->assertTrue($tenant->database()->manager()->databaseExists($tenant->database_name));
        $this->assertSame(1, $tenant->run(fn () => DB::table('tenant_users')
            ->where('central_user_id', $this->userId)
            ->where('role_key', 'COMPANY_ADMIN')
            ->where('status', 'ACTIVE')
            ->count()));
        $this->assertSame(4, $tenant->run(fn () => DB::table('asset_categories')->count()));
        $this->withToken($token)
            ->getJson("http://localhost/api/v1/onboarding/{$this->onboardingId}/status")
            ->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.database_status', 'READY');
    }
}
