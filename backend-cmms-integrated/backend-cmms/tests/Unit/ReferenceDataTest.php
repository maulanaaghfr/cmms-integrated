<?php

namespace Tests\Unit;

use App\Support\ReferenceData;
use PHPUnit\Framework\TestCase;

class ReferenceDataTest extends TestCase
{
    public function test_v1_roles_and_work_order_states_are_complete(): void
    {
        $this->assertSame([
            'COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR',
            'TECHNICIAN', 'OPERATOR', 'VIEWER',
        ], array_keys(ReferenceData::roles()));

        $this->assertSame([
            'PENDING_APPROVAL', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD',
            'COMPLETED', 'VERIFIED', 'CLOSED', 'REJECTED', 'CANCELLED',
        ], array_keys(ReferenceData::workOrderStates()));
    }

    public function test_only_manager_template_has_maintenance_approval_permissions(): void
    {
        foreach (ReferenceData::rolePermissions() as $role => $permissions) {
            $expected = $role === 'MANAGER';
            $this->assertSame($expected, in_array('request.approve', $permissions, true), "Unexpected Request approval permission for {$role}.");
            $this->assertSame($expected, in_array('work_order.approve', $permissions, true), "Unexpected WO approval permission for {$role}.");
            $this->assertNotContains('work_order.claim', $permissions);
            $this->assertNotContains('work_order.release', $permissions);
        }
    }

    public function test_operator_can_create_assign_and_verify_but_not_close_work_orders(): void
    {
        $operatorPermissions = ReferenceData::rolePermissions()['OPERATOR'];

        $this->assertContains('work_order.create', $operatorPermissions);
        $this->assertContains('work_order.assign', $operatorPermissions);
        $this->assertContains('work_order.verify', $operatorPermissions);
        $this->assertNotContains('work_order.close', $operatorPermissions);
    }
}
