<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\PmService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PostgresApiWorkflowTest extends TestCase
{
    private ?Tenant $tenant = null;

    private ?User $user = null;

    private ?User $manager = null;

    private ?User $technician = null;

    private ?User $operator = null;

    private ?User $viewer = null;

    private ?User $otherSiteUser = null;

    private string $domain;

    protected function setUp(): void
    {
        parent::setUp();
        if (! filter_var(env('RUN_TENANCY_INTEGRATION', false), FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set RUN_TENANCY_INTEGRATION=true against a disposable migrated PostgreSQL central database.');
        }
        $suffix = Str::lower(Str::random(8));
        $this->domain = "api-{$suffix}.localhost";
        $this->tenant = Tenant::create([
            'code' => 'API_'.Str::upper($suffix), 'name' => 'API Test', 'slug' => 'api-'.$suffix,
            'email' => "api-{$suffix}@example.test", 'timezone' => 'Asia/Jakarta', 'status' => 'TRIAL', 'database_status' => 'PROVISIONING',
        ]);
        $this->tenant->domains()->create(['domain' => $this->domain, 'is_primary' => true]);
        $this->user = User::create(['email' => "admin-{$suffix}@example.test", 'password_hash' => Hash::make('Password123'), 'full_name' => 'API Admin', 'status' => 'ACTIVE', 'must_change_password' => false]);
        $membershipId = (string) Str::ulid();
        DB::connection(config('tenancy.database.central_connection'))->table('tenant_memberships')->insert([
            'id' => $membershipId, 'tenant_id' => $this->tenant->id, 'user_id' => $this->user->id, 'role_key' => 'COMPANY_ADMIN', 'status' => 'ACTIVE',
            'joined_at' => now(), 'deactivated_at' => null, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $plan = DB::table('plans')->where('key', 'PROFESSIONAL')->first();
        DB::table('subscriptions')->insert([
            'id' => (string) Str::ulid(), 'tenant_id' => $this->tenant->id, 'plan_id' => $plan->id, 'status' => 'TRIAL', 'billing_period' => 'MONTHLY',
            'price_snapshot' => $plan->monthly_price, 'currency_code' => 'IDR', 'starts_at' => now(), 'trial_ends_at' => now()->addMonth(),
            'current_period_start' => now(), 'current_period_end' => now()->addMonth(), 'grace_ends_at' => null, 'auto_renew' => true,
            'cancelled_at' => null, 'cancellation_reason' => null, 'notes' => null, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->tenant->run(function () use ($membershipId): void {
            DB::table('tenant_users')->insert([
                'id' => (string) Str::ulid(), 'central_user_id' => $this->user->id, 'central_membership_id' => $membershipId,
                'email' => $this->user->email, 'full_name' => $this->user->full_name, 'phone' => null, 'employee_code' => null,
                'role_key' => 'COMPANY_ADMIN', 'status' => 'ACTIVE', 'primary_site_id' => null, 'created_at' => now(), 'updated_at' => now(),
            ]);
        });
        Sanctum::actingAs($this->user);
        $this->withServerVariables([
            'HTTP_HOST' => $this->domain,
            'SERVER_NAME' => $this->domain,
            'SERVER_PORT' => 80,
        ]);
    }

    protected function tearDown(): void
    {
        tenancy()->end();
        if ($this->tenant) {
            $central = DB::connection(config('tenancy.database.central_connection'));
            $invoiceIds = $central->table('invoices')->where('tenant_id', $this->tenant->id)->pluck('id');
            $paymentIds = $central->table('payments')->whereIn('invoice_id', $invoiceIds)->pluck('id');
            $central->table('payment_events')->whereIn('payment_id', $paymentIds)->delete();
            $central->table('payments')->whereIn('id', $paymentIds)->delete();
            $central->table('invoice_lines')->whereIn('invoice_id', $invoiceIds)->delete();
            $central->table('invoices')->whereIn('id', $invoiceIds)->delete();
            $central->table('subscriptions')->where('tenant_id', $this->tenant->id)->delete();
            $central->table('tenant_memberships')->where('tenant_id', $this->tenant->id)->delete();
            $this->tenant->delete();
        }
        $this->otherSiteUser?->forceDelete();
        $this->viewer?->forceDelete();
        $this->operator?->forceDelete();
        $this->technician?->forceDelete();
        $this->manager?->forceDelete();
        $this->user?->forceDelete();
        parent::tearDown();
    }

    public function test_asset_request_and_work_order_api_workflow(): void
    {
        $baseUrl = "http://{$this->domain}";
        $site = $this->postJson($baseUrl.'/api/v1/sites', ['code' => 'SITE-1', 'name' => 'Factory', 'timezone' => 'Asia/Jakarta'])->assertCreated()->json('data');
        $managerEmail = 'maintenance-manager-'.Str::lower(Str::random(8)).'@example.test';
        $this->postJson($baseUrl.'/api/v1/users', [
            'email' => $managerEmail, 'full_name' => 'Maintenance Manager', 'employee_code' => 'MGR-001',
            'role_key' => 'MANAGER', 'primary_site_id' => $site['id'], 'temporary_password' => 'Password123',
        ])->assertCreated();
        $this->manager = User::query()->where('email', $managerEmail)->sole();
        $this->manager->forceFill(['must_change_password' => false, 'status' => 'ACTIVE'])->save();
        $otherSite = $this->postJson($baseUrl.'/api/v1/sites', ['code' => 'SITE-2', 'name' => 'Other Factory', 'timezone' => 'Asia/Jakarta'])->assertCreated()->json('data');
        $otherSiteEmail = 'other-supervisor-'.Str::lower(Str::random(8)).'@example.test';
        $otherSiteTenantUser = $this->postJson($baseUrl.'/api/v1/users', [
            'email' => $otherSiteEmail, 'full_name' => 'Other Site Supervisor', 'employee_code' => 'SUP-OTHER',
            'role_key' => 'SUPERVISOR', 'primary_site_id' => $otherSite['id'], 'temporary_password' => 'Password123',
        ])->assertCreated()->json('data');
        $this->otherSiteUser = User::query()->where('email', $otherSiteEmail)->sole();
        $category = $this->postJson($baseUrl.'/api/v1/asset-categories', ['code' => 'PUMP', 'name' => 'Pump'])->assertCreated()->json('data');
        $asset = $this->postJson($baseUrl.'/api/v1/assets', [
            'site_id' => $site['id'], 'asset_category_id' => $category['id'], 'code' => 'P-001', 'name' => 'Pump 1',
            'status' => 'OPERATIONAL', 'criticality' => 'MEDIUM', 'request_approval_required' => false,
        ])->assertCreated()->json('data');

        Sanctum::actingAs($this->manager);
        $this->postJson($baseUrl.'/api/v1/sites', ['code' => 'FORBIDDEN', 'name' => 'Forbidden', 'timezone' => 'Asia/Jakarta'])
            ->assertForbidden()->assertJsonPath('error.code', 'ROLE_FORBIDDEN');
        $this->patchJson($baseUrl.'/api/v1/sites/'.$otherSite['id'], ['name' => 'Cross-site edit'])
            ->assertNotFound()->assertJsonPath('error.code', 'SITE_NOT_FOUND');
        $this->postJson($baseUrl.'/api/v1/teams', ['site_id' => $otherSite['id'], 'code' => 'CROSS', 'name' => 'Cross-site team'])
            ->assertNotFound()->assertJsonPath('error.code', 'SITE_NOT_FOUND');
        $this->patchJson($baseUrl.'/api/v1/assets/'.$asset['id'], ['site_id' => $otherSite['id']])
            ->assertNotFound()->assertJsonPath('error.code', 'SITE_NOT_FOUND');
        $this->patchJson($baseUrl.'/api/v1/users/'.$otherSiteTenantUser['id'], ['full_name' => 'Cross-site user edit'])
            ->assertNotFound()->assertJsonPath('error.code', 'TENANT_USER_NOT_FOUND');

        Sanctum::actingAs($this->user);
        $request = $this->postJson($baseUrl.'/api/v1/requests', ['asset_id' => $asset['id'], 'title' => 'Seal leak', 'description' => 'Visible leakage', 'priority' => 'HIGH'])->assertCreated();
        $request->assertJsonPath('data.request.status', 'PENDING_APPROVAL')->assertJsonPath('data.work_order', null);
        $requestId = $request->json('data.request.id');
        $this->postJson($baseUrl.'/api/v1/requests/'.$requestId.'/approve')->assertForbidden();
        Sanctum::actingAs($this->manager);
        $approved = $this->postJson($baseUrl.'/api/v1/requests/'.$requestId.'/approve')->assertOk()
            ->assertJsonPath('data.request.status', 'CONVERTED')->assertJsonPath('data.work_order.status', 'OPEN');
        $workOrderId = $approved->json('data.work_order.id');
        $this->postJson($baseUrl.'/api/v1/requests/'.$requestId.'/approve')
            ->assertStatus(409)->assertJsonPath('error.code', 'REQUEST_NOT_PENDING_APPROVAL');
        $this->postJson("{$baseUrl}/api/v1/work-orders/{$workOrderId}/complete", ['completion_note' => 'Done'])->assertStatus(409)->assertJsonPath('error.code', 'INVALID_WORK_ORDER_TRANSITION');

        Sanctum::actingAs($this->user);
        $direct = $this->postJson($baseUrl.'/api/v1/work-orders', [
            'asset_id' => $asset['id'], 'title' => 'Direct inspection', 'description' => 'Inspect the seal.', 'priority' => 'MEDIUM',
        ])->assertCreated()->assertJsonPath('data.status', 'PENDING_APPROVAL');
        $directId = $direct->json('data.id');
        $this->postJson($baseUrl.'/api/v1/work-orders/'.$directId.'/assign', ['team_id' => (string) Str::ulid()])
            ->assertStatus(422);
        Sanctum::actingAs($this->manager);
        $this->postJson($baseUrl.'/api/v1/work-orders/'.$directId.'/approve', ['note' => 'Approved'])
            ->assertOk()->assertJsonPath('data.status', 'OPEN');
        $this->postJson($baseUrl.'/api/v1/work-orders/'.$directId.'/approve')
            ->assertStatus(409)->assertJsonPath('error.code', 'WORK_ORDER_NOT_PENDING_APPROVAL');

        Sanctum::actingAs($this->user);
        $technicianEmail = 'technician-'.Str::lower(Str::random(8)).'@example.test';
        $technicianTenantUser = $this->postJson($baseUrl.'/api/v1/users', [
            'email' => $technicianEmail, 'full_name' => 'WO Technician', 'employee_code' => 'TECH-001',
            'role_key' => 'TECHNICIAN', 'primary_site_id' => $site['id'], 'temporary_password' => 'Password123',
        ])->assertCreated()->json('data');
        $this->technician = User::query()->where('email', $technicianEmail)->sole();
        $this->technician->forceFill(['must_change_password' => false, 'status' => 'ACTIVE'])->save();
        $team = $this->postJson($baseUrl.'/api/v1/teams', [
            'site_id' => $site['id'], 'code' => 'WO-TEAM', 'name' => 'WO Team',
        ])->assertCreated()->json('data');
        $this->postJson($baseUrl.'/api/v1/teams/'.$team['id'].'/members', [
            'tenant_user_id' => $technicianTenantUser['id'], 'member_type' => 'MEMBER',
        ])->assertCreated();
        $this->postJson($baseUrl.'/api/v1/work-orders/'.$directId.'/assign', [
            'team_id' => $team['id'], 'assignee_id' => $technicianTenantUser['id'],
        ])->assertOk()->assertJsonPath('data.status', 'ASSIGNED');

        Sanctum::actingAs($this->technician);
        $technicianRequest = $this->postJson($baseUrl.'/api/v1/requests', [
            'asset_id' => $asset['id'], 'title' => 'Technician finding',
            'description' => 'Technician found abnormal bearing noise.', 'priority' => 'HIGH',
        ])->assertCreated()->json('data.request');
        $technicianWorkOrders = $this->getJson($baseUrl.'/api/v1/work-orders')->assertOk();
        $this->assertSame([$directId], collect($technicianWorkOrders->json('data'))->pluck('id')->all());
        $technicianAsset = $this->getJson($baseUrl.'/api/v1/assets/'.$asset['id'])->assertOk();
        $this->assertSame([$directId], collect($technicianAsset->json('data.work_orders'))->pluck('id')->all());
        $this->getJson($baseUrl.'/api/v1/work-orders/'.$workOrderId)
            ->assertNotFound()->assertJsonPath('error.code', 'WORK_ORDER_NOT_FOUND');
        $this->patchJson($baseUrl.'/api/v1/work-orders/'.$directId, ['title' => 'Technician tampering'])
            ->assertForbidden()->assertJsonPath('error.code', 'WORK_ORDER_EDIT_FORBIDDEN');
        $this->postJson($baseUrl.'/api/v1/work-orders/'.$directId.'/start')
            ->assertOk()->assertJsonPath('data.status', 'IN_PROGRESS');
        $timer = $this->postJson($baseUrl.'/api/v1/work-orders/'.$directId.'/timer/start')
            ->assertCreated()->json('data');
        $this->postJson($baseUrl.'/api/v1/work-orders/'.$directId.'/hold', ['reason' => 'Waiting for spare part'])
            ->assertOk()->assertJsonPath('data.status', 'ON_HOLD');
        $this->tenant->run(fn () => $this->assertNotNull(
            DB::table('work_order_labor_entries')->where('id', $timer['id'])->value('ended_at')
        ));
        $this->postJson($baseUrl.'/api/v1/work-orders/'.$directId.'/timer/start')
            ->assertStatus(409)->assertJsonPath('error.code', 'TIMER_STATUS_INVALID');
        Sanctum::actingAs($this->user);
        $this->patchJson($baseUrl.'/api/v1/work-orders/'.$directId, ['title' => 'Admin edit after start'])
            ->assertStatus(409)->assertJsonPath('error.code', 'WORK_ORDER_IMMUTABLE');
        $operatorEmail = 'operator-'.Str::lower(Str::random(8)).'@example.test';
        $operatorTenantUser = $this->postJson($baseUrl.'/api/v1/users', [
            'email' => $operatorEmail, 'full_name' => 'Machine Operator', 'employee_code' => 'OP-001',
            'role_key' => 'OPERATOR', 'primary_site_id' => $site['id'], 'temporary_password' => 'Password123',
        ])->assertCreated()->json('data');
        $this->operator = User::query()->where('email', $operatorEmail)->sole();
        $this->operator->forceFill(['must_change_password' => false, 'status' => 'ACTIVE'])->save();
        $this->postJson($baseUrl.'/api/v1/assets/'.$asset['id'].'/operators', [
            'tenant_user_id' => $operatorTenantUser['id'], 'assignment_type' => 'PRIMARY',
        ])->assertCreated();

        Sanctum::actingAs($this->operator);
        $operatorRequest = $this->postJson($baseUrl.'/api/v1/requests', [
            'asset_id' => $asset['id'], 'title' => 'Operator finding',
            'description' => 'Operator found a seal leak.', 'priority' => 'MEDIUM',
        ])->assertCreated()->json('data.request');
        $operatorRequests = $this->getJson($baseUrl.'/api/v1/requests')->assertOk();
        $this->assertSame([$operatorRequest['id']], collect($operatorRequests->json('data'))->pluck('id')->all());
        $this->getJson($baseUrl.'/api/v1/requests/'.$technicianRequest['id'])
            ->assertNotFound()->assertJsonPath('error.code', 'REQUEST_NOT_FOUND');
        $this->getJson($baseUrl.'/api/v1/work-orders')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson($baseUrl.'/api/v1/assets/'.$asset['id'])->assertOk()->assertJsonCount(0, 'data.work_orders');
        $this->getJson($baseUrl.'/api/v1/work-orders/'.$directId)
            ->assertNotFound()->assertJsonPath('error.code', 'WORK_ORDER_NOT_FOUND');

        Sanctum::actingAs($this->user);
        $viewerEmail = 'viewer-'.Str::lower(Str::random(8)).'@example.test';
        $this->postJson($baseUrl.'/api/v1/users', [
            'email' => $viewerEmail, 'full_name' => 'Read Only Viewer', 'employee_code' => 'VIEW-001',
            'role_key' => 'VIEWER', 'primary_site_id' => $site['id'], 'temporary_password' => 'Password123',
        ])->assertCreated();
        $this->viewer = User::query()->where('email', $viewerEmail)->sole();
        $this->viewer->forceFill(['must_change_password' => false, 'status' => 'ACTIVE'])->save();

        Sanctum::actingAs($this->viewer);
        $this->postJson($baseUrl.'/api/v1/comments', [
            'entity_type' => 'WORK_ORDER', 'entity_id' => $directId, 'body' => 'Viewer mutation.',
        ])->assertForbidden()->assertJsonPath('error.code', 'ROLE_FORBIDDEN');
        $this->postJson($baseUrl.'/api/v1/attachments', [
            'entity_type' => 'WORK_ORDER', 'entity_id' => $directId, 'media_role' => 'OTHER',
        ])->assertForbidden()->assertJsonPath('error.code', 'ROLE_FORBIDDEN');

        Sanctum::actingAs($this->manager);
        $ownDirect = $this->postJson($baseUrl.'/api/v1/work-orders', [
            'asset_id' => $asset['id'], 'title' => 'Manager own request', 'priority' => 'LOW',
        ])->assertCreated();
        $this->postJson($baseUrl.'/api/v1/work-orders/'.$ownDirect->json('data.id').'/approve')
            ->assertForbidden()->assertJsonPath('error.code', 'SELF_APPROVAL_FORBIDDEN');

        Sanctum::actingAs($this->user);
        $important = $this->postJson($baseUrl.'/api/v1/assets', [
            'site_id' => $site['id'], 'asset_category_id' => $category['id'], 'code' => 'P-002', 'name' => 'Critical Pump',
            'status' => 'OPERATIONAL', 'criticality' => 'CRITICAL', 'request_approval_required' => true,
        ])->assertCreated()->json('data');
        $pending = $this->postJson($baseUrl.'/api/v1/requests', ['asset_id' => $important['id'], 'title' => 'High vibration', 'description' => 'Abnormal vibration', 'priority' => 'CRITICAL'])->assertCreated();
        $pending->assertJsonPath('data.request.status', 'PENDING_APPROVAL')->assertJsonPath('data.work_order', null);
        Sanctum::actingAs($this->manager);
        $this->postJson($baseUrl.'/api/v1/requests/'.$pending->json('data.request.id').'/approve', [])->assertOk()->assertJsonPath('data.request.status', 'CONVERTED');
    }

    public function test_completion_based_pm_generation_is_idempotent_and_recalculates_next_due(): void
    {
        $baseUrl = "http://{$this->domain}";
        $site = $this->postJson($baseUrl.'/api/v1/sites', ['code' => 'PM-SITE', 'name' => 'PM Factory', 'timezone' => 'Asia/Jakarta'])->assertCreated()->json('data');
        $category = $this->postJson($baseUrl.'/api/v1/asset-categories', ['code' => 'MOTOR', 'name' => 'Motor'])->assertCreated()->json('data');
        $asset = $this->postJson($baseUrl.'/api/v1/assets', [
            'site_id' => $site['id'], 'asset_category_id' => $category['id'], 'code' => 'M-001', 'name' => 'Motor 1',
            'status' => 'OPERATIONAL', 'criticality' => 'HIGH', 'request_approval_required' => false,
        ])->assertCreated()->json('data');
        $template = $this->postJson($baseUrl.'/api/v1/pm/templates', [
            'site_id' => $site['id'], 'code' => 'PM-MOTOR', 'name' => 'Motor inspection', 'priority' => 'MEDIUM',
            'status' => 'ACTIVE', 'work_instructions' => 'Inspect and lubricate.',
        ])->assertCreated()->json('data');
        $schedule = $this->postJson($baseUrl.'/api/v1/pm/schedules', [
            'pm_template_id' => $template['id'], 'site_id' => $site['id'], 'asset_id' => $asset['id'],
            'code' => 'SCH-MOTOR', 'name' => 'Daily motor PM', 'schedule_mode' => 'COMPLETION_BASED',
            'timezone' => 'Asia/Jakarta', 'start_date' => now()->subDays(3)->toIso8601String(), 'status' => 'ACTIVE',
            'trigger' => ['interval_unit' => 'DAY', 'interval_value' => 1, 'fixed_local_time' => now('Asia/Jakarta')->format('H:i')],
        ])->assertCreated()->json('data');
        $recalculated = $this->patchJson($baseUrl.'/api/v1/pm/schedules/'.$schedule['id'], [
            'trigger' => ['interval_unit' => 'DAY', 'interval_value' => 2, 'fixed_local_time' => now('Asia/Jakarta')->format('H:i')],
        ])->assertOk()->json('data');
        $this->assertNotSame($schedule['next_due_at'], $recalculated['next_due_at']);
        $schedule = $recalculated;

        $this->tenant->run(function () use ($schedule): void {
            $service = app(PmService::class);
            $this->assertSame(1, $service->generateDue());
            $this->assertSame(0, $service->generateDue());
            $occurrence = DB::table('pm_occurrences')->where('pm_schedule_id', $schedule['id'])->sole();
            $this->assertSame(1, DB::table('work_orders')->where('pm_occurrence_id', $occurrence->id)->count());

            $service->completeOccurrence($occurrence->id, now());
            $updatedSchedule = DB::table('pm_schedules')->where('id', $schedule['id'])->sole();
            $this->assertNotNull($updatedSchedule->last_completed_at);
            $this->assertNotNull($updatedSchedule->next_due_at);
            $this->assertTrue(now()->lt($updatedSchedule->next_due_at));
        });
    }

    public function test_pm_templates_schedules_and_occurrences_follow_manager_site_scope(): void
    {
        $baseUrl = "http://{$this->domain}";
        $siteA = $this->postJson($baseUrl.'/api/v1/sites', ['code' => 'PM-A', 'name' => 'PM Site A', 'timezone' => 'Asia/Jakarta'])->assertCreated()->json('data');
        $siteB = $this->postJson($baseUrl.'/api/v1/sites', ['code' => 'PM-B', 'name' => 'PM Site B', 'timezone' => 'Asia/Jakarta'])->assertCreated()->json('data');
        $managerEmail = 'pm-manager-'.Str::lower(Str::random(8)).'@example.test';
        $this->postJson($baseUrl.'/api/v1/users', [
            'email' => $managerEmail, 'full_name' => 'PM Manager', 'employee_code' => 'PM-MGR',
            'role_key' => 'MANAGER', 'primary_site_id' => $siteA['id'], 'temporary_password' => 'Password123',
        ])->assertCreated();
        $this->manager = User::query()->where('email', $managerEmail)->sole();
        $this->manager->forceFill(['must_change_password' => false, 'status' => 'ACTIVE'])->save();
        $category = $this->postJson($baseUrl.'/api/v1/asset-categories', ['code' => 'PM-EQUIPMENT', 'name' => 'PM Equipment'])->assertCreated()->json('data');
        $assetA = $this->postJson($baseUrl.'/api/v1/assets', [
            'site_id' => $siteA['id'], 'asset_category_id' => $category['id'], 'code' => 'PM-ASSET-A', 'name' => 'PM Asset A',
            'status' => 'OPERATIONAL', 'criticality' => 'MEDIUM',
        ])->assertCreated()->json('data');
        $assetB = $this->postJson($baseUrl.'/api/v1/assets', [
            'site_id' => $siteB['id'], 'asset_category_id' => $category['id'], 'code' => 'PM-ASSET-B', 'name' => 'PM Asset B',
            'status' => 'OPERATIONAL', 'criticality' => 'MEDIUM',
        ])->assertCreated()->json('data');
        $templateA = $this->postJson($baseUrl.'/api/v1/pm/templates', [
            'site_id' => $siteA['id'], 'code' => 'PM-TPL-A', 'name' => 'Template A', 'priority' => 'MEDIUM', 'status' => 'ACTIVE',
        ])->assertCreated()->json('data');
        $templateB = $this->postJson($baseUrl.'/api/v1/pm/templates', [
            'site_id' => $siteB['id'], 'code' => 'PM-TPL-B', 'name' => 'Template B', 'priority' => 'MEDIUM', 'status' => 'ACTIVE',
        ])->assertCreated()->json('data');
        $scheduleA = $this->postJson($baseUrl.'/api/v1/pm/schedules', [
            'pm_template_id' => $templateA['id'], 'site_id' => $siteA['id'], 'asset_id' => $assetA['id'],
            'code' => 'PM-SCH-A', 'name' => 'Schedule A', 'schedule_mode' => 'FIXED', 'timezone' => 'Asia/Jakarta',
            'start_date' => now()->subDays(2)->toIso8601String(), 'status' => 'ACTIVE',
            'trigger' => ['interval_unit' => 'DAY', 'interval_value' => 1],
        ])->assertCreated()->json('data');
        $scheduleB = $this->postJson($baseUrl.'/api/v1/pm/schedules', [
            'pm_template_id' => $templateB['id'], 'site_id' => $siteB['id'], 'asset_id' => $assetB['id'],
            'code' => 'PM-SCH-B', 'name' => 'Schedule B', 'schedule_mode' => 'FIXED', 'timezone' => 'Asia/Jakarta',
            'start_date' => now()->subDays(2)->toIso8601String(), 'status' => 'ACTIVE',
            'trigger' => ['interval_unit' => 'DAY', 'interval_value' => 1],
        ])->assertCreated()->json('data');
        $this->tenant->run(fn () => $this->assertSame(2, app(PmService::class)->generateDue()));

        Sanctum::actingAs($this->manager);
        $templates = $this->getJson($baseUrl.'/api/v1/pm/templates')->assertOk();
        $this->assertSame([$templateA['id']], collect($templates->json('data'))->pluck('id')->all());
        $this->getJson($baseUrl.'/api/v1/pm/templates/'.$templateB['id'])
            ->assertNotFound()->assertJsonPath('error.code', 'PM_TEMPLATE_NOT_FOUND');
        $schedules = $this->getJson($baseUrl.'/api/v1/pm/schedules')->assertOk();
        $this->assertSame([$scheduleA['id']], collect($schedules->json('data'))->pluck('id')->all());
        $this->getJson($baseUrl.'/api/v1/pm/schedules/'.$scheduleB['id'])
            ->assertNotFound()->assertJsonPath('error.code', 'PM_SCHEDULE_NOT_FOUND');
        $occurrences = $this->getJson($baseUrl.'/api/v1/pm/occurrences')->assertOk();
        $this->assertCount(1, $occurrences->json('data'));
        $this->assertSame($scheduleA['id'], $occurrences->json('data.0.pm_schedule_id'));
    }

    public function test_duitku_payment_status_callback_and_idempotency_workflow(): void
    {
        config()->set('payments.secrets.DUITKU_API_KEY', 'integration-secret');
        $central = DB::connection(config('tenancy.database.central_connection'));
        $provider = $central->table('payment_providers')->where('key', 'DUITKU')->first();
        $configId = (string) Str::ulid();
        $channelId = (string) Str::ulid();
        $central->table('payment_provider_configs')->insert([
            'id' => $configId, 'payment_provider_id' => $provider->id, 'environment' => 'SANDBOX',
            'merchant_identifier' => 'DTEST', 'secret_reference' => 'env:DUITKU_API_KEY',
            'callback_base_url' => 'http://localhost', 'return_base_url' => 'http://localhost/billing',
            'settings' => json_encode(['transaction_url' => 'https://duitku.test/transaction', 'status_url' => 'https://duitku.test/status']),
            'is_active' => true, 'created_by' => null, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $central->table('payment_channels')->insert([
            'id' => $channelId, 'payment_provider_id' => $provider->id, 'channel_key' => 'VC', 'name' => 'Test Card',
            'channel_type' => 'CARD', 'bank_code' => null, 'fee_config' => null, 'minimum_amount' => 10000,
            'maximum_amount' => null, 'is_active' => true, 'synced_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $subscription = $central->table('subscriptions')->where('tenant_id', $this->tenant->id)->first();
        $invoiceId = (string) Str::ulid();
        $central->table('invoices')->insert([
            'id' => $invoiceId, 'tenant_id' => $this->tenant->id, 'subscription_id' => $subscription->id,
            'invoice_number' => 'INV-'.Str::upper(Str::random(12)), 'status' => 'ISSUED',
            'billing_period_start' => now(), 'billing_period_end' => now()->addMonth(), 'issued_at' => now(),
            'due_at' => now()->addDays(7), 'paid_at' => null, 'currency_code' => 'IDR', 'subtotal' => 500000,
            'tax_amount' => 0, 'total_amount' => 500000, 'amount_paid' => 0, 'customer_name_snapshot' => 'API Test',
            'customer_email_snapshot' => $this->tenant->email, 'customer_tax_id_snapshot' => null,
            'billing_address_snapshot' => null, 'notes' => null, 'created_at' => now(), 'updated_at' => now(),
        ]);
        Http::fake(function ($httpRequest) {
            if ($httpRequest->url() === 'https://duitku.test/status') {
                return Http::response([
                    'merchantOrderId' => $httpRequest['merchantOrderId'], 'reference' => 'DUITKU-REF',
                    'amount' => '500000', 'fee' => '0', 'statusCode' => '01', 'statusMessage' => 'PROCESS',
                ]);
            }

            return Http::response(['reference' => 'DUITKU-REF', 'paymentUrl' => 'https://pay.test/redirect']);
        });

        $baseUrl = "http://{$this->domain}";
        $payment = $this->postJson($baseUrl."/api/v1/billing/invoices/{$invoiceId}/payments", [
            'payment_channel_id' => $channelId, 'idempotency_key' => 'integration-payment-'.Str::random(12),
        ])->assertCreated()->assertJsonPath('data.status', 'PENDING')->json('data');
        $this->postJson($baseUrl.'/api/v1/billing/payments/'.$payment['id'].'/check-status')
            ->assertOk()->assertJsonPath('data.payment.status', 'PENDING');

        $callback = [
            'merchantOrderId' => $payment['payment_reference'], 'amount' => '500000', 'resultCode' => '00',
            'reference' => 'DUITKU-REF',
        ];
        $callback['signature'] = hash_hmac('sha256', 'DTEST500000'.$payment['payment_reference'], 'integration-secret');
        $callbackUrl = 'http://localhost/api/v1/billing/providers/DUITKU/callback';
        $this->postJson($callbackUrl, $callback)->assertOk()->assertJsonPath('data.received', true);
        $this->postJson($callbackUrl, $callback)->assertOk()->assertJsonPath('data.duplicate', true);

        $this->assertSame('PAID', $central->table('payments')->where('id', $payment['id'])->value('status'));
        $this->assertSame('PAID', $central->table('invoices')->where('id', $invoiceId)->value('status'));
        $this->assertSame('ACTIVE', $central->table('subscriptions')->where('id', $subscription->id)->value('status'));
        $this->assertSame(2, $central->table('payment_events')->where('payment_id', $payment['id'])->count());

    }
}
