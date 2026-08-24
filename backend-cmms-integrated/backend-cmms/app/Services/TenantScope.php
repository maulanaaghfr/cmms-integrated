<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class TenantScope
{
    public function sites(object $tenantUser): Builder
    {
        $query = DB::table('sites');

        return match ($tenantUser->role_key) {
            'COMPANY_ADMIN' => $query,
            'MANAGER', 'SUPERVISOR', 'VIEWER' => $query->where('id', $tenantUser->primary_site_id),
            'TECHNICIAN' => $query->whereIn('id', DB::table('teams')
                ->join('team_members', 'team_members.team_id', '=', 'teams.id')
                ->where('team_members.tenant_user_id', $tenantUser->id)
                ->where('team_members.is_active', true)
                ->select('teams.site_id')),
            'OPERATOR' => $query->whereIn('id', DB::table('assets')
                ->join('asset_operator_assignments', 'asset_operator_assignments.asset_id', '=', 'assets.id')
                ->where('asset_operator_assignments.tenant_user_id', $tenantUser->id)
                ->where('asset_operator_assignments.is_active', true)
                ->where(fn (Builder $q) => $q->whereNull('asset_operator_assignments.ends_at')->orWhere('asset_operator_assignments.ends_at', '>', now()))
                ->select('assets.site_id')),
            default => $query->whereRaw('1 = 0'),
        };
    }

    public function site(object $tenantUser, string $siteId): object
    {
        return $this->sites($tenantUser)->where('id', $siteId)->first()
            ?? throw new ApiException('SITE_NOT_FOUND', 'Site was not found in your permitted scope.', 404);
    }

    public function assets(object $tenantUser): Builder
    {
        $query = DB::table('assets');

        return match ($tenantUser->role_key) {
            'COMPANY_ADMIN' => $query,
            'MANAGER', 'SUPERVISOR', 'VIEWER' => $query->where('site_id', $tenantUser->primary_site_id),
            'TECHNICIAN' => $query->whereIn('site_id', DB::table('teams')
                ->join('team_members', 'team_members.team_id', '=', 'teams.id')
                ->where('team_members.tenant_user_id', $tenantUser->id)
                ->where('team_members.is_active', true)
                ->select('teams.site_id')),
            'OPERATOR' => $query->whereIn('id', DB::table('asset_operator_assignments')
                ->where('tenant_user_id', $tenantUser->id)
                ->where('is_active', true)
                ->where(fn (Builder $q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()))
                ->select('asset_id')),
            default => $query->whereRaw('1 = 0'),
        };
    }

    public function asset(object $tenantUser, string $assetId): object
    {
        $asset = $this->assets($tenantUser)->where('id', $assetId)->first();
        if (! $asset) {
            throw new ApiException('ASSET_NOT_FOUND', 'Asset was not found in your permitted scope.', 404);
        }

        return $asset;
    }

    public function warehouses(object $tenantUser): Builder
    {
        $query = DB::table('warehouses');

        return $tenantUser->role_key === 'COMPANY_ADMIN'
            ? $query
            : $query->whereIn('site_id', $this->sites($tenantUser)->select('id'));
    }

    public function warehouse(object $tenantUser, string $warehouseId): object
    {
        return $this->warehouses($tenantUser)->where('id', $warehouseId)->first()
            ?? throw new ApiException('WAREHOUSE_NOT_FOUND', 'Warehouse was not found in your permitted scope.', 404);
    }

    public function spareParts(object $tenantUser): Builder
    {
        $query = DB::table('spare_parts');

        return $tenantUser->role_key === 'COMPANY_ADMIN'
            ? $query
            : $query->whereIn('site_id', $this->sites($tenantUser)->select('id'));
    }

    public function sparePart(object $tenantUser, string $sparePartId): object
    {
        return $this->spareParts($tenantUser)->where('id', $sparePartId)->first()
            ?? throw new ApiException('SPARE_PART_NOT_FOUND', 'Spare part was not found in your permitted scope.', 404);
    }

    public function workOrders(object $tenantUser): Builder
    {
        $query = DB::table('work_orders');

        return match ($tenantUser->role_key) {
            'TECHNICIAN' => $query->where('current_assignee_id', $tenantUser->id),
            'OPERATOR' => $query->where('requester_id', $tenantUser->id),
            default => $query->whereIn('asset_id', $this->assets($tenantUser)->select('id')),
        };
    }

    public function workOrder(object $tenantUser, string $workOrderId): object
    {
        $workOrder = $this->workOrders($tenantUser)->where('id', $workOrderId)->first();
        if (! $workOrder) {
            throw new ApiException('WORK_ORDER_NOT_FOUND', 'Work order was not found in your permitted scope.', 404);
        }

        return $workOrder;
    }

    public function maintenanceRequests(object $tenantUser): Builder
    {
        $query = DB::table('maintenance_requests');

        return match ($tenantUser->role_key) {
            'OPERATOR' => $query->where('requester_id', $tenantUser->id),
            default => $query->whereIn('asset_id', $this->assets($tenantUser)->select('id')),
        };
    }

    public function maintenanceRequest(object $tenantUser, string $requestId): object
    {
        $maintenanceRequest = $this->maintenanceRequests($tenantUser)->where('id', $requestId)->first();
        if (! $maintenanceRequest) {
            throw new ApiException('REQUEST_NOT_FOUND', 'Maintenance request was not found.', 404);
        }

        return $maintenanceRequest;
    }

    public function locations(object $tenantUser): Builder
    {
        return DB::table('locations')->whereIn('site_id', $this->sites($tenantUser)->select('id'));
    }

    public function location(object $tenantUser, string $locationId): object
    {
        return $this->locations($tenantUser)->where('id', $locationId)->first()
            ?? throw new ApiException('LOCATION_NOT_FOUND', 'Location was not found in your permitted scope.', 404);
    }

    public function tenantUsers(object $tenantUser): Builder
    {
        $query = DB::table('tenant_users');

        return $tenantUser->role_key === 'COMPANY_ADMIN'
            ? $query
            : $query->whereIn('primary_site_id', $this->sites($tenantUser)->select('id'));
    }

    public function tenantUser(object $actor, string $tenantUserId): object
    {
        return $this->tenantUsers($actor)->where('id', $tenantUserId)->first()
            ?? throw new ApiException('TENANT_USER_NOT_FOUND', 'User was not found in your permitted scope.', 404);
    }

    public function teams(object $tenantUser): Builder
    {
        return DB::table('teams')->whereIn('site_id', $this->sites($tenantUser)->select('id'));
    }

    public function team(object $tenantUser, string $teamId): object
    {
        return $this->teams($tenantUser)->where('id', $teamId)->first()
            ?? throw new ApiException('TEAM_NOT_FOUND', 'Team was not found in your permitted scope.', 404);
    }

    public function pmTemplates(object $tenantUser): Builder
    {
        return DB::table('pm_templates')->whereIn('site_id', $this->sites($tenantUser)->select('id'));
    }

    public function pmTemplate(object $tenantUser, string $templateId): object
    {
        return $this->pmTemplates($tenantUser)->where('id', $templateId)->first()
            ?? throw new ApiException('PM_TEMPLATE_NOT_FOUND', 'PM template was not found in your permitted scope.', 404);
    }

    public function pmSchedules(object $tenantUser): Builder
    {
        return DB::table('pm_schedules')->whereIn('site_id', $this->sites($tenantUser)->select('id'));
    }

    public function pmSchedule(object $tenantUser, string $scheduleId): object
    {
        return $this->pmSchedules($tenantUser)->where('id', $scheduleId)->first()
            ?? throw new ApiException('PM_SCHEDULE_NOT_FOUND', 'PM schedule was not found in your permitted scope.', 404);
    }

    public function pmOccurrences(object $tenantUser): Builder
    {
        return DB::table('pm_occurrences')->whereIn('pm_schedule_id', $this->pmSchedules($tenantUser)->select('id'));
    }
}
