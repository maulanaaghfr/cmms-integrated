<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\AuditService;
use App\Services\PlanLimitService;
use App\Services\TenantScope;
use App\Support\ApiData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AssetController extends Controller
{
    public function __construct(private readonly AuditService $audit, private readonly PlanLimitService $limits, private readonly TenantScope $scope) {}

    public function categories(Request $request): mixed
    {
        return ApiData::paginated(DB::table('asset_categories')->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))->orderBy('name')->paginate($request->integer('per_page', 20)));
    }

    public function category(string $category): mixed
    {
        return ApiData::item($this->find('asset_categories', $category, 'ASSET_CATEGORY_NOT_FOUND'));
    }

    public function createCategory(Request $request): mixed
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:80', Rule::unique('asset_categories', 'code')], 'name' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string']]);
        $id = (string) Str::ulid();
        DB::table('asset_categories')->insert(['id' => $id, ...$data, 'is_active' => true, 'archived_at' => null, 'created_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'asset_category.created', 'ASSET_CATEGORY', $id, null, $data);

        return ApiData::item($this->find('asset_categories', $id, 'ASSET_CATEGORY_NOT_FOUND'), 201);
    }

    public function updateCategory(Request $request, string $category): mixed
    {
        $before = $this->find('asset_categories', $category, 'ASSET_CATEGORY_NOT_FOUND');
        $data = $request->validate(['code' => ['sometimes', 'string', 'max:80', Rule::unique('asset_categories', 'code')->ignore($category)], 'name' => ['sometimes', 'string', 'max:255'], 'description' => ['nullable', 'string'], 'is_active' => ['sometimes', 'boolean']]);
        DB::table('asset_categories')->where('id', $category)->update([...$data, 'updated_at' => now()]);
        $this->audit->tenant($request, 'asset_category.updated', 'ASSET_CATEGORY', $category, $before, $data);

        return ApiData::item($this->find('asset_categories', $category, 'ASSET_CATEGORY_NOT_FOUND'));
    }

    public function archiveCategory(Request $request, string $category): mixed
    {
        $before = $this->find('asset_categories', $category, 'ASSET_CATEGORY_NOT_FOUND');
        DB::table('asset_categories')->where('id', $category)->update(['is_active' => false, 'archived_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'asset_category.archived', 'ASSET_CATEGORY', $category, $before);

        return response()->json(null, 204);
    }

    public function index(Request $request): mixed
    {
        $query = $this->scope->assets($request->attributes->get('tenant_user'))
            ->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))
            ->when($request->filled('site_id'), fn ($q) => $q->where('site_id', $request->string('site_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('criticality'), fn ($q) => $q->where('criticality', $request->string('criticality')));
        if ($request->filled('search')) {
            $search = '%'.$request->string('search').'%';
            $query->where(fn ($q) => $q->where('code', 'ilike', $search)->orWhere('name', 'ilike', $search)->orWhere('serial_number', 'ilike', $search)->orWhere('barcode', 'ilike', $search));
        }

        return ApiData::paginated($query->orderBy('name')->paginate($request->integer('per_page', 20)));
    }

    public function show(Request $request, string $asset): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $row = $this->scope->asset($actor, $asset);
        $row->operators = DB::table('asset_operator_assignments')->join('tenant_users', 'tenant_users.id', '=', 'asset_operator_assignments.tenant_user_id')->where('asset_operator_assignments.asset_id', $asset)->where('asset_operator_assignments.is_active', true)->select('asset_operator_assignments.*', 'tenant_users.full_name', 'tenant_users.email')->get();
        $row->work_orders = $this->scope->workOrders($actor)->where('asset_id', $asset)->orderByDesc('created_at')->limit(20)->get();

        return ApiData::item($row);
    }

    public function store(Request $request): mixed
    {
        $this->limits->enforce('assets');
        $data = $this->assetData($request);
        $this->scope->site($request->attributes->get('tenant_user'), $data['site_id']);
        $this->validateSiteLocation($data['site_id'], $data['location_id'] ?? null);
        $id = (string) Str::ulid();
        DB::table('assets')->insert([
            'id' => $id, ...$data, 'description' => $data['description'] ?? null, 'location_id' => $data['location_id'] ?? null,
            'manufacturer' => $data['manufacturer'] ?? null, 'model' => $data['model'] ?? null, 'serial_number' => $data['serial_number'] ?? null,
            'installation_date' => $data['installation_date'] ?? null, 'barcode' => $data['barcode'] ?? null, 'qr_token' => Str::random(64),
            'request_approval_required' => $data['request_approval_required'] ?? false, 'is_active' => true, 'archived_at' => null,
            'created_by' => $request->attributes->get('tenant_user')->id, 'lock_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->audit->tenant($request, 'asset.created', 'ASSET', $id, null, $data);

        return $this->show($request, $id)->setStatusCode(201);
    }

    public function update(Request $request, string $asset): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $before = $this->scope->asset($actor, $asset);
        $data = $this->assetData($request, true, $asset);
        $siteId = $data['site_id'] ?? $before->site_id;
        $this->scope->site($actor, $siteId);
        $this->validateSiteLocation($siteId, array_key_exists('location_id', $data) ? $data['location_id'] : $before->location_id);
        DB::table('assets')->where('id', $asset)->update([...$data, 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now()]);
        $this->audit->tenant($request, 'asset.updated', 'ASSET', $asset, $before, $data);

        return $this->show($request, $asset);
    }

    public function archive(Request $request, string $asset): mixed
    {
        $before = $this->scope->asset($request->attributes->get('tenant_user'), $asset);
        DB::table('assets')->where('id', $asset)->update(['is_active' => false, 'archived_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'asset.archived', 'ASSET', $asset, $before);

        return response()->json(null, 204);
    }

    public function operators(Request $request, string $asset): mixed
    {
        $this->scope->asset($request->attributes->get('tenant_user'), $asset);

        return ApiData::item(DB::table('asset_operator_assignments')->where('asset_id', $asset)->orderByDesc('starts_at')->get());
    }

    public function assignOperator(Request $request, string $asset): mixed
    {
        $assetRow = $this->scope->asset($request->attributes->get('tenant_user'), $asset);
        $data = $request->validate(['tenant_user_id' => ['required', 'ulid', Rule::exists('tenant_users', 'id')], 'assignment_type' => ['required', Rule::in(['PRIMARY', 'SECONDARY', 'TEMPORARY'])], 'starts_at' => ['nullable', 'date'], 'ends_at' => ['nullable', 'date', 'after:starts_at']]);
        if (! DB::table('tenant_users')->where('id', $data['tenant_user_id'])->where('role_key', 'OPERATOR')
            ->where('status', 'ACTIVE')->where('primary_site_id', $assetRow->site_id)->exists()) {
            throw new ApiException('OPERATOR_SITE_MISMATCH', 'The selected user must be an active Operator from the asset site.', 422);
        }
        DB::table('asset_operator_assignments')->where('asset_id', $asset)->where('tenant_user_id', $data['tenant_user_id'])->where('is_active', true)->update(['is_active' => false, 'ends_at' => now()]);
        $id = (string) Str::ulid();
        DB::table('asset_operator_assignments')->insert(['id' => $id, 'asset_id' => $asset, ...$data, 'starts_at' => $data['starts_at'] ?? now(), 'ends_at' => $data['ends_at'] ?? null, 'assigned_by' => $request->attributes->get('tenant_user')->id, 'is_active' => true, 'created_at' => now()]);
        $this->audit->tenant($request, 'asset.operator_assigned', 'ASSET_OPERATOR_ASSIGNMENT', $id, null, $data);

        return ApiData::item(DB::table('asset_operator_assignments')->where('id', $id)->first(), 201);
    }

    public function removeOperator(Request $request, string $asset, string $assignment): mixed
    {
        $this->scope->asset($request->attributes->get('tenant_user'), $asset);
        $row = DB::table('asset_operator_assignments')->where('id', $assignment)->where('asset_id', $asset)->first();
        if (! $row) {
            throw new ApiException('OPERATOR_ASSIGNMENT_NOT_FOUND', 'Operator assignment was not found.', 404);
        }
        DB::table('asset_operator_assignments')->where('id', $assignment)->update(['is_active' => false, 'ends_at' => now()]);
        $this->audit->tenant($request, 'asset.operator_removed', 'ASSET_OPERATOR_ASSIGNMENT', $assignment, $row);

        return response()->json(null, 204);
    }

    private function assetData(Request $request, bool $partial = false, ?string $ignore = null): array
    {
        $mode = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'site_id' => [$mode, 'ulid', Rule::exists('sites', 'id')], 'location_id' => ['nullable', 'ulid', Rule::exists('locations', 'id')], 'asset_category_id' => [$mode, 'ulid', Rule::exists('asset_categories', 'id')],
            'code' => [$mode, 'string', 'max:80', Rule::unique('assets', 'code')->ignore($ignore)], 'name' => [$mode, 'string', 'max:255'], 'description' => ['nullable', 'string'],
            'status' => [$mode, Rule::in(['OPERATIONAL', 'UNDER_MAINTENANCE', 'DOWN', 'STANDBY', 'OUT_OF_SERVICE'])], 'criticality' => [$mode, Rule::in(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])],
            'manufacturer' => ['nullable', 'string', 'max:255'], 'model' => ['nullable', 'string', 'max:255'], 'serial_number' => ['nullable', 'string', 'max:255'],
            'installation_date' => ['nullable', 'date'], 'barcode' => ['nullable', 'string', 'max:128', Rule::unique('assets', 'barcode')->ignore($ignore)], 'request_approval_required' => ['sometimes', 'boolean'], 'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function validateSiteLocation(string $siteId, ?string $locationId): void
    {
        if ($locationId && ! DB::table('locations')->where('id', $locationId)->where('site_id', $siteId)->exists()) {
            throw new ApiException('ASSET_LOCATION_SITE_MISMATCH', 'Location must belong to the selected site.', 422);
        }
    }

    private function find(string $table, string $id, string $code): object
    {
        return DB::table($table)->where('id', $id)->first() ?? throw new ApiException($code, 'Resource was not found.', 404);
    }
}
