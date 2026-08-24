<?php

namespace Tests\Unit;

use App\Services\TenantScope;
use Tests\TestCase;

class TenantScopeRoleTest extends TestCase
{
    public function test_technician_work_orders_are_scoped_to_current_assignment(): void
    {
        $query = (new TenantScope)->workOrders((object) [
            'id' => 'technician-1',
            'role_key' => 'TECHNICIAN',
            'primary_site_id' => 'site-1',
        ]);

        $this->assertStringContainsString('"current_assignee_id" = ?', $query->toSql());
        $this->assertSame(['technician-1'], $query->getBindings());
    }

    public function test_operator_requests_and_work_orders_are_scoped_to_ownership(): void
    {
        $operator = (object) ['id' => 'operator-1', 'role_key' => 'OPERATOR', 'primary_site_id' => 'site-1'];
        $scope = new TenantScope;

        $requests = $scope->maintenanceRequests($operator);
        $workOrders = $scope->workOrders($operator);

        $this->assertStringContainsString('"requester_id" = ?', $requests->toSql());
        $this->assertSame(['operator-1'], $requests->getBindings());
        $this->assertStringContainsString('"requester_id" = ?', $workOrders->toSql());
        $this->assertSame(['operator-1'], $workOrders->getBindings());
    }

    public function test_manager_organization_and_pm_queries_are_scoped_to_primary_site(): void
    {
        $manager = (object) ['id' => 'manager-1', 'role_key' => 'MANAGER', 'primary_site_id' => 'site-1'];
        $scope = new TenantScope;

        foreach ([
            $scope->sites($manager),
            $scope->locations($manager),
            $scope->tenantUsers($manager),
            $scope->teams($manager),
            $scope->pmTemplates($manager),
            $scope->pmSchedules($manager),
            $scope->pmOccurrences($manager),
        ] as $query) {
            $this->assertContains('site-1', $query->getBindings());
        }
    }
}
