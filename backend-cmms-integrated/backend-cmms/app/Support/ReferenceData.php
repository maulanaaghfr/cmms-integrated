<?php

declare(strict_types=1);

namespace App\Support;

final class ReferenceData
{
    /** @return array<string, string> */
    public static function roles(): array
    {
        return [
            'COMPANY_ADMIN' => 'Company Admin',
            'MANAGER' => 'Manager',
            'SUPERVISOR' => 'Supervisor',
            'TECHNICIAN' => 'Technician',
            'OPERATOR' => 'Operator',
            'VIEWER' => 'Viewer',
        ];
    }

    /** @return array<string, list<string>> */
    public static function rolePermissions(): array
    {
        $all = [
            'site.view', 'site.manage', 'location.view', 'location.manage',
            'user.view', 'user.invite', 'user.update', 'user.deactivate', 'team.manage',
            'asset.view', 'asset.create', 'asset.update', 'asset.archive', 'asset.assign_operator',
            'request.view_own', 'request.view_scope', 'request.create', 'request.cancel_own', 'request.approve',
            'work_order.view_own', 'work_order.view_scope', 'work_order.create', 'work_order.assign',
            'work_order.approve', 'work_order.start', 'work_order.update_execution',
            'work_order.complete', 'work_order.verify', 'work_order.close',
            'pm.view', 'pm.manage', 'notification.view', 'audit.view',
            'subscription.view', 'subscription.manage',
        ];

        return [
            'COMPANY_ADMIN' => array_values(array_diff($all, ['request.approve', 'work_order.approve'])),
            'MANAGER' => array_values(array_diff($all, ['subscription.manage'])),
            'SUPERVISOR' => [
                'site.view', 'location.view', 'user.view', 'team.manage',
                'asset.view', 'asset.create', 'asset.update', 'asset.assign_operator',
                'request.view_scope', 'request.create',
                'work_order.view_scope', 'work_order.create', 'work_order.assign',
                'work_order.start', 'work_order.update_execution', 'work_order.complete',
                'work_order.verify', 'work_order.close', 'pm.view', 'pm.manage', 'notification.view',
            ],
            'TECHNICIAN' => [
                'site.view', 'location.view', 'asset.view', 'request.view_own', 'request.create',
                'work_order.view_own', 'work_order.view_scope',
                'work_order.start', 'work_order.update_execution', 'work_order.complete',
                'pm.view', 'notification.view',
            ],
            'OPERATOR' => [
                'site.view', 'location.view', 'asset.view', 'request.view_own', 'request.create',
                'request.cancel_own', 'work_order.view_own', 'work_order.create',
                'work_order.assign', 'work_order.verify', 'notification.view',
            ],
            'VIEWER' => [
                'site.view', 'location.view', 'asset.view', 'request.view_scope',
                'work_order.view_scope', 'pm.view', 'notification.view', 'subscription.view',
            ],
        ];
    }

    /** @return array<string, string> */
    public static function workOrderStates(): array
    {
        return [
            'PENDING_APPROVAL' => 'Pending Approval', 'OPEN' => 'Open', 'ASSIGNED' => 'Assigned',
            'IN_PROGRESS' => 'In Progress', 'ON_HOLD' => 'On Hold',
            'COMPLETED' => 'Completed', 'VERIFIED' => 'Verified',
            'CLOSED' => 'Closed', 'REJECTED' => 'Rejected', 'CANCELLED' => 'Cancelled',
        ];
    }

    /** @return array<string, string> */
    public static function requestStates(): array
    {
        return [
            'SUBMITTED' => 'Submitted', 'PENDING_APPROVAL' => 'Pending Approval',
            'CONVERTED' => 'Converted', 'REJECTED' => 'Rejected', 'CANCELLED' => 'Cancelled',
        ];
    }

    /** @return array<string, string> */
    public static function assetStates(): array
    {
        return [
            'OPERATIONAL' => 'Operational', 'UNDER_MAINTENANCE' => 'Under Maintenance',
            'DOWN' => 'Down', 'STANDBY' => 'Standby', 'OUT_OF_SERVICE' => 'Out of Service',
        ];
    }
}
