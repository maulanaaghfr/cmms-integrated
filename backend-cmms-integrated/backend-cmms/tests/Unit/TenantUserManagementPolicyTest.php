<?php

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\TenantUserManagementPolicy;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class TenantUserManagementPolicyTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('tenant_users', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('role_key');
            $table->string('status');
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('tenant_users');
        parent::tearDown();
    }

    public function test_manager_can_only_create_supervisors_or_technicians_in_their_site(): void
    {
        $policy = new TenantUserManagementPolicy;
        $manager = (object) ['role_key' => 'MANAGER', 'primary_site_id' => 'site-a'];

        $policy->authorizeCreation($manager, ['role_key' => 'SUPERVISOR', 'primary_site_id' => 'site-a']);
        $this->addToAssertionCount(1);

        try {
            $policy->authorizeCreation($manager, ['role_key' => 'COMPANY_ADMIN', 'primary_site_id' => 'site-a']);
            $this->fail('Manager unexpectedly created a Company Admin.');
        } catch (ApiException $exception) {
            $this->assertSame('USER_ROLE_MANAGEMENT_FORBIDDEN', $exception->errorCode);
            $this->assertSame(403, $exception->status);
        }

        try {
            $policy->authorizeCreation($manager, ['role_key' => 'TECHNICIAN', 'primary_site_id' => 'site-b']);
            $this->fail('Manager unexpectedly created a user outside their site.');
        } catch (ApiException $exception) {
            $this->assertSame('USER_SITE_SCOPE_FORBIDDEN', $exception->errorCode);
            $this->assertSame(403, $exception->status);
        }
    }

    public function test_last_active_company_admin_cannot_be_deactivated(): void
    {
        DB::table('tenant_users')->insert(['id' => 'admin-1', 'role_key' => 'COMPANY_ADMIN', 'status' => 'ACTIVE']);
        $policy = new TenantUserManagementPolicy;
        $admin = (object) ['role_key' => 'COMPANY_ADMIN', 'primary_site_id' => null];
        $target = (object) [
            'id' => 'admin-1', 'role_key' => 'COMPANY_ADMIN', 'status' => 'ACTIVE', 'primary_site_id' => null,
        ];

        try {
            $policy->authorizeUpdate($admin, $target, ['status' => 'INACTIVE']);
            $this->fail('The last Company Admin was unexpectedly deactivated.');
        } catch (ApiException $exception) {
            $this->assertSame('LAST_COMPANY_ADMIN_REQUIRED', $exception->errorCode);
            $this->assertSame(409, $exception->status);
        }
    }
}
