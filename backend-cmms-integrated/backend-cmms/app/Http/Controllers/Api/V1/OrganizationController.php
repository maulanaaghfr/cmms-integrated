<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditService;
use App\Services\PlanLimitService;
use App\Services\TenantScope;
use App\Services\TenantUserManagementPolicy;
use App\Support\ApiData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class OrganizationController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly PlanLimitService $limits,
        private readonly TenantUserManagementPolicy $userPolicy,
        private readonly TenantScope $scope,
    ) {}

    public function sites(Request $request): mixed
    {
        return ApiData::paginated($this->scope->sites($request->attributes->get('tenant_user'))->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))
            ->orderBy('name')->paginate($request->integer('per_page', 20)));
    }

    public function site(Request $request, string $site): mixed
    {
        return ApiData::item($this->scope->site($request->attributes->get('tenant_user'), $site));
    }

    public function createSite(Request $request): mixed
    {
        if ($request->attributes->get('tenant_user')->role_key !== 'COMPANY_ADMIN') {
            throw new ApiException('SITE_CREATE_FORBIDDEN', 'Only a Company Admin can create sites.', 403);
        }
        $this->limits->enforce('sites');
        $data = $request->validate([
            'code' => ['required', 'string', 'max:60', Rule::unique('sites', 'code')], 'name' => ['required', 'string', 'max:255'],
            'address' => ['nullable', 'string'], 'timezone' => ['required', 'timezone:all'],
        ]);
        $id = (string) Str::ulid();
        DB::table('sites')->insert(['id' => $id, ...$data, 'is_active' => true, 'archived_at' => null, 'created_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'site.created', 'SITE', $id, null, $data);

        return ApiData::item($this->find('sites', $id, 'SITE_NOT_FOUND'), 201);
    }

    public function updateSite(Request $request, string $site): mixed
    {
        $before = $this->scope->site($request->attributes->get('tenant_user'), $site);
        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:60', Rule::unique('sites', 'code')->ignore($site)], 'name' => ['sometimes', 'string', 'max:255'],
            'address' => ['nullable', 'string'], 'timezone' => ['sometimes', 'timezone:all'], 'is_active' => ['sometimes', 'boolean'],
        ]);
        DB::table('sites')->where('id', $site)->update([...$data, 'updated_at' => now()]);
        $this->audit->tenant($request, 'site.updated', 'SITE', $site, $before, $data);

        return ApiData::item($this->scope->site($request->attributes->get('tenant_user'), $site));
    }

    public function archiveSite(Request $request, string $site): mixed
    {
        $before = $this->scope->site($request->attributes->get('tenant_user'), $site);
        DB::table('sites')->where('id', $site)->update(['is_active' => false, 'archived_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'site.archived', 'SITE', $site, $before);

        return response()->json(null, 204);
    }

    public function locations(Request $request): mixed
    {
        $query = $this->scope->locations($request->attributes->get('tenant_user'))->when($request->filled('site_id'), fn ($q) => $q->where('site_id', $request->string('site_id')))
            ->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))->orderBy('name');

        return ApiData::paginated($query->paginate($request->integer('per_page', 20)));
    }

    public function location(Request $request, string $location): mixed
    {
        return ApiData::item($this->scope->location($request->attributes->get('tenant_user'), $location));
    }

    public function createLocation(Request $request): mixed
    {
        $data = $this->locationData($request);
        $this->scope->site($request->attributes->get('tenant_user'), $data['site_id']);
        $this->validateLocationParent($data['site_id'], $data['parent_location_id'] ?? null);
        $id = (string) Str::ulid();
        DB::table('locations')->insert(['id' => $id, ...$data, 'is_active' => true, 'archived_at' => null, 'created_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'location.created', 'LOCATION', $id, null, $data);

        return ApiData::item($this->find('locations', $id, 'LOCATION_NOT_FOUND'), 201);
    }

    public function updateLocation(Request $request, string $location): mixed
    {
        $before = $this->scope->location($request->attributes->get('tenant_user'), $location);
        $data = $this->locationData($request, true, $location);
        $siteId = $data['site_id'] ?? $before->site_id;
        $this->scope->site($request->attributes->get('tenant_user'), $siteId);
        $parentId = array_key_exists('parent_location_id', $data) ? $data['parent_location_id'] : $before->parent_location_id;
        if ($parentId === $location) {
            throw new ApiException('LOCATION_PARENT_CYCLE', 'A location cannot be its own parent.', 422);
        }
        $this->validateLocationParent($siteId, $parentId);
        DB::table('locations')->where('id', $location)->update([...$data, 'updated_at' => now()]);
        $this->audit->tenant($request, 'location.updated', 'LOCATION', $location, $before, $data);

        return ApiData::item($this->find('locations', $location, 'LOCATION_NOT_FOUND'));
    }

    public function archiveLocation(Request $request, string $location): mixed
    {
        $before = $this->scope->location($request->attributes->get('tenant_user'), $location);
        DB::table('locations')->where('id', $location)->update(['is_active' => false, 'archived_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'location.archived', 'LOCATION', $location, $before);

        return response()->json(null, 204);
    }

    public function users(Request $request): mixed
    {
        $query = $this->scope->tenantUsers($request->attributes->get('tenant_user'))->when($request->filled('role'), fn ($q) => $q->where('role_key', $request->string('role')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderBy('full_name');

        return ApiData::paginated($query->paginate($request->integer('per_page', 20)));
    }

    /**
     * Return the caller's own tenant_user record.
     *
     * FIX (2026-09-04): This intentionally does NOT go through
     * TenantScope::tenantUsers(). For role TECHNICIAN, that scope filters
     * users by team membership (team_members -> teams.site_id), not by
     * primary_site_id. A technician who has been assigned work orders but
     * has not yet been added to any team gets an EMPTY result from
     * GET /users — meaning they can't even find their own record in the
     * list the frontend uses to resolve "who am I" (tenantUserId).
     *
     * That, in turn, silently breaks every `current_assignee_id ===
     * user.tenantUserId` check across the technician UI (dashboard counts,
     * "assigned to me" filters, action buttons on a work order) even
     * though the work order is correctly assigned to them in the database.
     *
     * A user must always be able to resolve their own identity regardless
     * of team/site scoping, so this reads directly from the already
     * middleware-resolved `tenant_user` on the request instead of
     * re-querying through the scoped list.
     */
    public function me(Request $request): mixed
    {
        return ApiData::item($request->attributes->get('tenant_user'));
    }

    public function user(Request $request, string $user): mixed
    {
        return ApiData::item($this->scope->tenantUser($request->attributes->get('tenant_user'), $user));
    }

    public function createUser(Request $request): mixed
    {
        $this->limits->enforce('users');
        $data = $request->validate([
            'email' => ['required', 'email', 'max:320'], 'full_name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'], 'employee_code' => ['nullable', 'string', 'max:80', Rule::unique('tenant_users', 'employee_code')],
            'role_key' => ['required', Rule::in(['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR', 'TECHNICIAN', 'OPERATOR', 'VIEWER'])],
            'primary_site_id' => ['nullable', 'ulid', Rule::exists('sites', 'id')], 'temporary_password' => ['nullable', 'string', 'min:8'],
        ]);
        $this->userPolicy->authorizeCreation($request->attributes->get('tenant_user'), $data);
        $central = config('tenancy.database.central_connection');
        $email = mb_strtolower($data['email']);
        $centralUser = User::query()->where('email', $email)->first();
        if (! $centralUser && empty($data['temporary_password'])) {
            throw new ApiException('TEMPORARY_PASSWORD_REQUIRED', 'A temporary password is required for a new global user.', 422);
        }
        if (! $centralUser) {
            $centralUser = User::create([
                'email' => $email, 'password_hash' => Hash::make($data['temporary_password']), 'full_name' => $data['full_name'],
                'phone' => $data['phone'] ?? null, 'status' => 'ACTIVE', 'must_change_password' => true,
            ]);
        }
        if (DB::connection($central)->table('tenant_memberships')->where('tenant_id', tenant('id'))->where('user_id', $centralUser->id)->exists()) {
            throw new ApiException('MEMBERSHIP_ALREADY_EXISTS', 'This user already belongs to the tenant.', 409);
        }
        $membershipId = (string) Str::ulid();
        $tenantUserId = (string) Str::ulid();
        try {
            DB::connection($central)->table('tenant_memberships')->insert([
                'id' => $membershipId, 'tenant_id' => tenant('id'), 'user_id' => $centralUser->id,
                'role_key' => $data['role_key'], 'status' => 'ACTIVE', 'joined_at' => now(), 'deactivated_at' => null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('tenant_users')->insert([
                'id' => $tenantUserId, 'central_user_id' => $centralUser->id, 'central_membership_id' => $membershipId,
                'email' => $email, 'full_name' => $data['full_name'], 'phone' => $data['phone'] ?? null,
                'employee_code' => $data['employee_code'] ?? null, 'role_key' => $data['role_key'], 'status' => 'ACTIVE',
                'primary_site_id' => $data['primary_site_id'] ?? null, 'created_at' => now(), 'updated_at' => now(),
            ]);
        } catch (\Throwable $exception) {
            DB::connection($central)->table('tenant_memberships')->where('id', $membershipId)->delete();
            throw $exception;
        }
        $this->audit->tenant($request, 'user.created', 'TENANT_USER', $tenantUserId, null, $data);

        return ApiData::item($this->scope->tenantUser($request->attributes->get('tenant_user'), $tenantUserId), 201);
    }

    public function updateUser(Request $request, string $user): mixed
    {
        $before = $this->scope->tenantUser($request->attributes->get('tenant_user'), $user);
        $data = $request->validate([
            'full_name' => ['sometimes', 'string', 'max:255'], 'phone' => ['nullable', 'string', 'max:32'],
            'employee_code' => ['nullable', 'string', 'max:80', Rule::unique('tenant_users', 'employee_code')->ignore($user)],
            'role_key' => ['sometimes', Rule::in(['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR', 'TECHNICIAN', 'OPERATOR', 'VIEWER'])],
            'status' => ['sometimes', Rule::in(['INVITED', 'ACTIVE', 'INACTIVE'])], 'primary_site_id' => ['nullable', 'ulid', Rule::exists('sites', 'id')],
        ]);
        $before = DB::transaction(function () use ($request, $user, $data): object {
            $locked = DB::table('tenant_users')->where('id', $user)->lockForUpdate()->first()
                ?? throw new ApiException('TENANT_USER_NOT_FOUND', 'Resource was not found.', 404);
            $this->userPolicy->authorizeUpdate($request->attributes->get('tenant_user'), $locked, $data);
            DB::table('tenant_users')->where('id', $user)->update([...$data, 'updated_at' => now()]);

            return $locked;
        });
        DB::connection(config('tenancy.database.central_connection'))->table('tenant_memberships')->where('id', $before->central_membership_id)->update([
            'role_key' => $data['role_key'] ?? $before->role_key, 'status' => $data['status'] ?? $before->status,
            'deactivated_at' => ($data['status'] ?? null) === 'INACTIVE' ? now() : null, 'updated_at' => now(),
        ]);
        $this->audit->tenant($request, 'user.updated', 'TENANT_USER', $user, $before, $data);

        return ApiData::item($this->scope->tenantUser($request->attributes->get('tenant_user'), $user));
    }

    public function teams(Request $request): mixed
    {
        return ApiData::paginated($this->scope->teams($request->attributes->get('tenant_user'))->when($request->filled('site_id'), fn ($q) => $q->where('site_id', $request->string('site_id')))
            ->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))->orderBy('name')->paginate($request->integer('per_page', 20)));
    }

    public function team(Request $request, string $team): mixed
    {
        $row = $this->scope->team($request->attributes->get('tenant_user'), $team);
        $row->members = DB::table('team_members')->join('tenant_users', 'tenant_users.id', '=', 'team_members.tenant_user_id')
            ->where('team_members.team_id', $team)->where('team_members.is_active', true)
            ->select('team_members.*', 'tenant_users.full_name', 'tenant_users.role_key')->get();

        return ApiData::item($row);
    }

    public function createTeam(Request $request): mixed
    {
        $data = $this->teamData($request);
        $this->scope->site($request->attributes->get('tenant_user'), $data['site_id']);
        $this->validateTeamSupervisor($data['site_id'], $data['supervisor_user_id'] ?? null);
        $id = (string) Str::ulid();
        DB::table('teams')->insert(['id' => $id, ...$data, 'is_active' => true, 'archived_at' => null, 'created_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'team.created', 'TEAM', $id, null, $data);

        return $this->team($request, $id)->setStatusCode(201);
    }

    public function updateTeam(Request $request, string $team): mixed
    {
        $before = $this->scope->team($request->attributes->get('tenant_user'), $team);
        $data = $this->teamData($request, true, $team);
        $siteId = $data['site_id'] ?? $before->site_id;
        $this->scope->site($request->attributes->get('tenant_user'), $siteId);
        $this->validateTeamSupervisor($siteId, array_key_exists('supervisor_user_id', $data) ? $data['supervisor_user_id'] : $before->supervisor_user_id);
        DB::table('teams')->where('id', $team)->update([...$data, 'updated_at' => now()]);
        $this->audit->tenant($request, 'team.updated', 'TEAM', $team, $before, $data);

        return $this->team($request, $team);
    }

    public function archiveTeam(Request $request, string $team): mixed
    {
        $before = $this->scope->team($request->attributes->get('tenant_user'), $team);
        DB::table('teams')->where('id', $team)->update(['is_active' => false, 'archived_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'team.archived', 'TEAM', $team, $before);

        return response()->json(null, 204);
    }

    public function addTeamMember(Request $request, string $team): mixed
    {
        $teamRow = $this->scope->team($request->attributes->get('tenant_user'), $team);
        $data = $request->validate(['tenant_user_id' => ['required', 'ulid', Rule::exists('tenant_users', 'id')], 'member_type' => ['required', Rule::in(['LEAD', 'MEMBER'])]]);
        if (! DB::table('tenant_users')->where('id', $data['tenant_user_id'])->where('primary_site_id', $teamRow->site_id)->where('status', 'ACTIVE')->exists()) {
            throw new ApiException('TEAM_MEMBER_SITE_MISMATCH', 'Team members must be active users from the same site.', 422);
        }
        DB::table('team_members')->where('team_id', $team)->where('tenant_user_id', $data['tenant_user_id'])->where('is_active', true)->update([
            'is_active' => false, 'left_at' => now(), 'updated_at' => now(),
        ]);
        $id = (string) Str::ulid();
        DB::table('team_members')->insert(['id' => $id, 'team_id' => $team, ...$data, 'joined_at' => now(), 'left_at' => null, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'team.member_added', 'TEAM_MEMBER', $id, null, $data);

        return ApiData::item(DB::table('team_members')->where('id', $id)->first(), 201);
    }

    public function removeTeamMember(Request $request, string $team, string $tenantUser): mixed
    {
        $this->scope->team($request->attributes->get('tenant_user'), $team);
        $affected = DB::table('team_members')->where('team_id', $team)->where('tenant_user_id', $tenantUser)->where('is_active', true)->update([
            'is_active' => false, 'left_at' => now(), 'updated_at' => now(),
        ]);
        if (! $affected) {
            throw new ApiException('TEAM_MEMBER_NOT_FOUND', 'Active team membership was not found.', 404);
        }
        $this->audit->tenant($request, 'team.member_removed', 'TEAM', $team, null, ['tenant_user_id' => $tenantUser]);

        return response()->json(null, 204);
    }

    private function find(string $table, string $id, string $code): object
    {
        return DB::table($table)->where('id', $id)->first() ?? throw new ApiException($code, 'Resource was not found.', 404);
    }

    private function locationData(Request $request, bool $partial = false, ?string $ignore = null): array
    {
        $mode = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'site_id' => [$mode, 'ulid', Rule::exists('sites', 'id')], 'parent_location_id' => ['nullable', 'ulid', Rule::exists('locations', 'id')],
            'code' => [$mode, 'string', 'max:60'], 'name' => [$mode, 'string', 'max:255'],
            'location_type' => [$mode, Rule::in(['AREA', 'BUILDING', 'FLOOR', 'ROOM', 'LINE', 'ZONE', 'OTHER'])],
            'description' => ['nullable', 'string'], 'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function validateLocationParent(string $siteId, ?string $parentId): void
    {
        if ($parentId && ! DB::table('locations')->where('id', $parentId)->where('site_id', $siteId)->exists()) {
            throw new ApiException('LOCATION_PARENT_SITE_MISMATCH', 'Parent location must belong to the same site.', 422);
        }
    }

    private function validateTeamSupervisor(string $siteId, ?string $supervisorId): void
    {
        if ($supervisorId && ! DB::table('tenant_users')->where('id', $supervisorId)->where('primary_site_id', $siteId)
            ->where('role_key', 'SUPERVISOR')->where('status', 'ACTIVE')->exists()) {
            throw new ApiException('TEAM_SUPERVISOR_SITE_MISMATCH', 'Team supervisor must be an active Supervisor from the same site.', 422);
        }
    }

    private function teamData(Request $request, bool $partial = false, ?string $ignore = null): array
    {
        $mode = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'site_id' => [$mode, 'ulid', Rule::exists('sites', 'id')], 'code' => [$mode, 'string', 'max:60'],
            'name' => [$mode, 'string', 'max:255'], 'specialty' => ['nullable', 'string', 'max:255'],
            'supervisor_user_id' => ['nullable', 'ulid', Rule::exists('tenant_users', 'id')],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}