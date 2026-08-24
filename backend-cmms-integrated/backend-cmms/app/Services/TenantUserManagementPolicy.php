<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use Illuminate\Support\Facades\DB;

class TenantUserManagementPolicy
{
    private const MANAGER_MANAGED_ROLES = ['SUPERVISOR', 'TECHNICIAN'];

    public function authorizeCreation(object $actor, array $data): void
    {
        $this->ensureRoleHasSite($data['role_key'], $data['primary_site_id'] ?? null);

        if ($actor->role_key === 'COMPANY_ADMIN') {
            return;
        }

        if ($actor->role_key !== 'MANAGER') {
            throw new ApiException('USER_MANAGEMENT_FORBIDDEN', 'Your role cannot create company users.', 403);
        }

        $this->ensureManagerCanManageRoleAndSite($actor, $data['role_key'], $data['primary_site_id'] ?? null);
    }

    public function authorizeUpdate(object $actor, object $target, array $data): void
    {
        $resultingRole = $data['role_key'] ?? $target->role_key;
        $resultingStatus = $data['status'] ?? $target->status;
        $resultingSiteId = array_key_exists('primary_site_id', $data) ? $data['primary_site_id'] : $target->primary_site_id;
        $this->ensureRoleHasSite($resultingRole, $resultingSiteId);

        if ($actor->role_key === 'COMPANY_ADMIN') {
            if ($target->role_key === 'COMPANY_ADMIN' && $target->status === 'ACTIVE'
                && ($resultingRole !== 'COMPANY_ADMIN' || $resultingStatus !== 'ACTIVE')
                && DB::table('tenant_users')->where('role_key', 'COMPANY_ADMIN')->where('status', 'ACTIVE')
                    ->orderBy('id')->lockForUpdate()->get()->count() <= 1) {
                throw new ApiException('LAST_COMPANY_ADMIN_REQUIRED', 'The last active Company Admin cannot be demoted or deactivated.', 409);
            }

            return;
        }

        if ($actor->role_key !== 'MANAGER') {
            throw new ApiException('USER_MANAGEMENT_FORBIDDEN', 'Your role cannot update company users.', 403);
        }

        if (! in_array($target->role_key, self::MANAGER_MANAGED_ROLES, true)) {
            throw new ApiException('USER_ROLE_MANAGEMENT_FORBIDDEN', 'A Manager may only manage Supervisors and Technicians.', 403);
        }

        $this->ensureManagerCanManageRoleAndSite($actor, $resultingRole, $resultingSiteId);
        if ($target->primary_site_id !== $actor->primary_site_id) {
            throw new ApiException('USER_SITE_SCOPE_FORBIDDEN', 'A Manager may only manage users in their primary site.', 403);
        }
    }

    private function ensureManagerCanManageRoleAndSite(object $actor, string $role, ?string $siteId): void
    {
        if (! in_array($role, self::MANAGER_MANAGED_ROLES, true)) {
            throw new ApiException('USER_ROLE_MANAGEMENT_FORBIDDEN', 'A Manager may only manage Supervisors and Technicians.', 403);
        }
        if (! $actor->primary_site_id) {
            throw new ApiException('MANAGER_SITE_REQUIRED', 'A Manager needs a primary site before managing users.', 409);
        }
        if ($siteId !== $actor->primary_site_id) {
            throw new ApiException('USER_SITE_SCOPE_FORBIDDEN', 'A Manager may only manage users in their primary site.', 403);
        }
    }

    private function ensureRoleHasSite(string $role, ?string $siteId): void
    {
        if ($role !== 'COMPANY_ADMIN' && ! $siteId) {
            throw new ApiException('USER_SITE_REQUIRED', 'A primary site is required for this company role.', 422);
        }
    }
}
