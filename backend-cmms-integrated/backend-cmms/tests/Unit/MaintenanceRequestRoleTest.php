<?php

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Http\Controllers\Api\V1\MaintenanceRequestController;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\TenantScope;
use App\Services\WorkOrderService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Mockery;
use Tests\TestCase;

class MaintenanceRequestRoleTest extends TestCase
{
    public function test_technician_is_allowed_to_reach_asset_scope_when_creating_request(): void
    {
        $actor = (object) ['id' => 'technician-1', 'role_key' => 'TECHNICIAN'];
        $assetId = (string) Str::ulid();
        $scope = Mockery::mock(TenantScope::class);
        $scope->shouldReceive('asset')->once()->with($actor, $assetId)
            ->andThrow(new ApiException('ASSET_SCOPE_REACHED', 'Role authorization passed.', 418));
        $controller = new MaintenanceRequestController(
            $scope,
            Mockery::mock(WorkOrderService::class),
            Mockery::mock(NotificationService::class),
            Mockery::mock(AuditService::class),
        );
        $request = Request::create('/api/v1/requests', 'POST', [
            'asset_id' => $assetId,
            'title' => 'Bearing noise',
            'description' => 'Abnormal noise detected.',
            'priority' => 'HIGH',
        ]);
        $request->attributes->set('tenant_user', $actor);

        try {
            $controller->store($request);
            $this->fail('Expected the test scope sentinel.');
        } catch (ApiException $exception) {
            $this->assertSame('ASSET_SCOPE_REACHED', $exception->errorCode);
        }
    }
}
