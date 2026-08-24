<?php

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Http\Controllers\Api\V1\WorkOrderController;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\PmService;
use App\Services\TenantScope;
use App\Services\WorkOrderService;
use Illuminate\Http\Request;
use Mockery;
use Tests\TestCase;

class WorkOrderEditPolicyTest extends TestCase
{
    public function test_work_order_is_immutable_after_work_starts(): void
    {
        $actor = (object) ['id' => 'manager-1', 'role_key' => 'MANAGER'];
        $workOrder = (object) ['id' => 'wo-1', 'requester_id' => 'operator-1', 'status' => 'IN_PROGRESS'];

        $exception = $this->captureUpdateException($actor, $workOrder);

        $this->assertSame('WORK_ORDER_IMMUTABLE', $exception->errorCode);
        $this->assertSame(409, $exception->status);
    }

    public function test_non_requester_technician_cannot_edit_before_work_starts(): void
    {
        $actor = (object) ['id' => 'technician-1', 'role_key' => 'TECHNICIAN'];
        $workOrder = (object) ['id' => 'wo-1', 'requester_id' => 'operator-1', 'status' => 'ASSIGNED'];

        $exception = $this->captureUpdateException($actor, $workOrder);

        $this->assertSame('WORK_ORDER_EDIT_FORBIDDEN', $exception->errorCode);
        $this->assertSame(403, $exception->status);
    }

    private function captureUpdateException(object $actor, object $workOrder): ApiException
    {
        $scope = Mockery::mock(TenantScope::class);
        $scope->shouldReceive('workOrder')->once()->with($actor, $workOrder->id)->andReturn($workOrder);
        $controller = new WorkOrderController(
            $scope,
            Mockery::mock(WorkOrderService::class),
            Mockery::mock(NotificationService::class),
            Mockery::mock(AuditService::class),
            Mockery::mock(PmService::class),
        );
        $request = Request::create('/api/v1/work-orders/'.$workOrder->id, 'PATCH', ['title' => 'Changed']);
        $request->attributes->set('tenant_user', $actor);

        try {
            $controller->update($request, $workOrder->id);
            $this->fail('Work order update unexpectedly succeeded.');
        } catch (ApiException $exception) {
            return $exception;
        }
    }
}
