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

    /**
     * Guard against a hard delete that would silently take master/physical
     * data down with it.
     *
     * A real DELETE FROM tenant_users now cascades through work orders, PM
     * templates/schedules/occurrences, comments, attachments, signatures,
     * labor entries, and audit-trail actor links — that is intentional (see
     * the 2026_09_08 migration). What it deliberately does NOT cascade
     * through is `assets.created_by`, which is still ON DELETE RESTRICT.
     *
     * An asset is equipment, not a piece of this user's activity history —
     * deleting it would also cascade-wipe every work order, PM schedule,
     * and maintenance request ever logged against that asset, regardless of
     * who touched them. That is a company-wide data-loss blast radius the
     * "delete this one user" action should never trigger implicitly, so we
     * fail loudly and specifically instead of letting a raw FK violation
     * bubble up from Postgres.
     */
    public function assertHardDeletable(string $tenantUserId): void
    {
        $ownedAssetCount = DB::table('assets')->where('created_by', $tenantUserId)->count();
        if ($ownedAssetCount > 0) {
            throw new ApiException(
                'USER_OWNS_ASSET_RECORDS',
                "This user is recorded as the creator of {$ownedAssetCount} asset(s). Deleting them would cascade-delete those assets and everything ever logged against them (work orders, PM schedules, maintenance requests) for every user involved. Reassign or archive those assets first.",
                409,
            );
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