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

class InventoryController extends Controller
{
    public function __construct(private readonly AuditService $audit, private readonly PlanLimitService $limits, private readonly TenantScope $scope) {}

    public function warehouses(Request $request): mixed
    {
        $query = $this->scope->warehouses($request->attributes->get('tenant_user'))
            ->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))
            ->when($request->filled('site_id'), fn ($q) => $q->where('site_id', $request->string('site_id')));

        return ApiData::paginated($query->orderBy('name')->paginate($request->integer('per_page', 20)));
    }

    public function warehouse(Request $request, string $warehouse): mixed
    {
        return ApiData::item($this->scope->warehouse($request->attributes->get('tenant_user'), $warehouse));
    }

    public function storeWarehouse(Request $request): mixed
    {
        $data = $request->validate([
            'site_id' => ['required', 'ulid', Rule::exists('sites', 'id')],
            'code' => ['required', 'string', 'max:80', Rule::unique('warehouses', 'code')],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
        ]);
        $this->scope->site($request->attributes->get('tenant_user'), $data['site_id']);
        $id = (string) Str::ulid();
        DB::table('warehouses')->insert(['id' => $id, ...$data, 'is_active' => true, 'archived_at' => null, 'created_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'warehouse.created', 'WAREHOUSE', $id, null, $data);

        return ApiData::item($this->scope->warehouse($request->attributes->get('tenant_user'), $id), 201);
    }

    public function updateWarehouse(Request $request, string $warehouse): mixed
    {
        $before = $this->scope->warehouse($request->attributes->get('tenant_user'), $warehouse);
        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:80', Rule::unique('warehouses', 'code')->ignore($warehouse)],
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        DB::table('warehouses')->where('id', $warehouse)->update([...$data, 'updated_at' => now()]);
        $this->audit->tenant($request, 'warehouse.updated', 'WAREHOUSE', $warehouse, $before, $data);

        return ApiData::item($this->scope->warehouse($request->attributes->get('tenant_user'), $warehouse));
    }

    public function archiveWarehouse(Request $request, string $warehouse): mixed
    {
        $before = $this->scope->warehouse($request->attributes->get('tenant_user'), $warehouse);
        DB::table('warehouses')->where('id', $warehouse)->update(['is_active' => false, 'archived_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'warehouse.archived', 'WAREHOUSE', $warehouse, $before);

        return response()->json(null, 204);
    }

    public function categories(Request $request): mixed
    {
        return ApiData::paginated(DB::table('spare_part_categories')->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))->orderBy('name')->paginate($request->integer('per_page', 20)));
    }

    public function createCategory(Request $request): mixed
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:80', Rule::unique('spare_part_categories', 'code')], 'name' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string']]);
        $id = (string) Str::ulid();
        DB::table('spare_part_categories')->insert(['id' => $id, ...$data, 'is_active' => true, 'archived_at' => null, 'created_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'spare_part_category.created', 'SPARE_PART_CATEGORY', $id, null, $data);

        return ApiData::item($this->findCategory($id), 201);
    }

    private function findCategory(string $id): object
    {
        return DB::table('spare_part_categories')->where('id', $id)->first() ?? throw new ApiException('SPARE_PART_CATEGORY_NOT_FOUND', 'Resource was not found.', 404);
    }

    public function index(Request $request): mixed
    {
        $query = $this->scope->spareParts($request->attributes->get('tenant_user'))
            ->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))
            ->when($request->filled('site_id'), fn ($q) => $q->where('site_id', $request->string('site_id')))
            ->when($request->filled('spare_part_category_id'), fn ($q) => $q->where('spare_part_category_id', $request->string('spare_part_category_id')))
            ->when($request->boolean('low_stock'), fn ($q) => $q->whereIn('id', DB::table('spare_part_stocks')
                ->select('spare_part_id')
                ->groupBy('spare_part_id')
                ->havingRaw('SUM(quantity) <= (select min_stock from spare_parts where spare_parts.id = spare_part_stocks.spare_part_id)')));
        if ($request->filled('search')) {
            $search = '%'.$request->string('search').'%';
            $query->where(fn ($q) => $q->where('code', 'ilike', $search)->orWhere('name', 'ilike', $search)->orWhere('barcode', 'ilike', $search));
        }

        // Add total_quantity as a subquery so the listing already includes stock info.
        $query->addSelect([
            'total_quantity' => DB::table('spare_part_stocks')
                ->selectRaw('COALESCE(SUM(quantity), 0)')
                ->whereColumn('spare_part_id', 'spare_parts.id'),
        ]);

        return ApiData::paginated($query->orderBy('name')->paginate($request->integer('per_page', 20)));
    }

    public function show(Request $request, string $sparePart): mixed
    {
        $row = $this->scope->sparePart($request->attributes->get('tenant_user'), $sparePart);
        $row->stocks = DB::table('spare_part_stocks')->join('warehouses', 'warehouses.id', '=', 'spare_part_stocks.warehouse_id')
            ->where('spare_part_stocks.spare_part_id', $sparePart)
            ->select('spare_part_stocks.*', 'warehouses.name as warehouse_name', 'warehouses.code as warehouse_code')
            ->get();
        $row->total_quantity = $row->stocks->sum('quantity');

        return ApiData::item($row);
    }

    public function store(Request $request): mixed
    {
        $this->limits->enforce('spare_parts');
        $data = $this->sparePartData($request);
        $this->scope->site($request->attributes->get('tenant_user'), $data['site_id']);
        $id = (string) Str::ulid();
        DB::table('spare_parts')->insert([
            'id' => $id, ...$data,
            'spare_part_category_id' => $data['spare_part_category_id'] ?? null,
            'description' => $data['description'] ?? null,
            'unit' => $data['unit'] ?? 'pcs',
            'barcode' => $data['barcode'] ?? null,
            'min_stock' => $data['min_stock'] ?? 0,
            'reorder_point' => $data['reorder_point'] ?? 0,
            'unit_cost' => $data['unit_cost'] ?? null,
            'is_active' => true, 'archived_at' => null,
            'created_by' => $request->attributes->get('tenant_user')->id,
            'lock_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->audit->tenant($request, 'spare_part.created', 'SPARE_PART', $id, null, $data);

        return $this->show($request, $id)->setStatusCode(201);
    }

    public function update(Request $request, string $sparePart): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $before = $this->scope->sparePart($actor, $sparePart);
        $data = $this->sparePartData($request, true, $sparePart);
        if (isset($data['site_id'])) {
            $this->scope->site($actor, $data['site_id']);
        }
        DB::table('spare_parts')->where('id', $sparePart)->update([...$data, 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now()]);
        $this->audit->tenant($request, 'spare_part.updated', 'SPARE_PART', $sparePart, $before, $data);

        return $this->show($request, $sparePart);
    }

    public function archive(Request $request, string $sparePart): mixed
    {
        $before = $this->scope->sparePart($request->attributes->get('tenant_user'), $sparePart);
        DB::table('spare_parts')->where('id', $sparePart)->update(['is_active' => false, 'archived_at' => now(), 'updated_at' => now()]);
        $this->audit->tenant($request, 'spare_part.archived', 'SPARE_PART', $sparePart, $before);

        return response()->json(null, 204);
    }

    public function adjustStock(Request $request, string $sparePart): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $part = $this->scope->sparePart($actor, $sparePart);
        $data = $request->validate([
            'warehouse_id' => ['required', 'ulid', Rule::exists('warehouses', 'id')],
            'type' => ['required', Rule::in(['IN', 'OUT', 'ADJUSTMENT'])],
            'quantity' => ['required', 'integer', 'min:1'],
            'reason' => ['nullable', 'string', 'max:255'],
            'reference_type' => ['nullable', 'string', 'max:80'],
            'reference_id' => ['nullable', 'ulid'],
        ]);
        $this->scope->warehouse($actor, $data['warehouse_id']);

        $delta = match ($data['type']) {
            'IN' => $data['quantity'],
            'OUT' => -$data['quantity'],
            'ADJUSTMENT' => $data['quantity'],
        };

        DB::transaction(function () use ($part, $data, $delta, $actor, $request) {
            $stock = DB::table('spare_part_stocks')->where('spare_part_id', $part->id)->where('warehouse_id', $data['warehouse_id'])->lockForUpdate()->first();
            $currentQty = $stock->quantity ?? 0;
            $newQty = $data['type'] === 'ADJUSTMENT' ? $delta : $currentQty + $delta;

            if ($newQty < 0) {
                throw new ApiException('INSUFFICIENT_STOCK', 'Stock quantity cannot go below zero.', 422);
            }

            if ($stock) {
                DB::table('spare_part_stocks')->where('id', $stock->id)->update(['quantity' => $newQty, 'updated_at' => now()]);
            } else {
                DB::table('spare_part_stocks')->insert(['id' => (string) Str::ulid(), 'spare_part_id' => $part->id, 'warehouse_id' => $data['warehouse_id'], 'quantity' => $newQty, 'created_at' => now(), 'updated_at' => now()]);
            }

            DB::table('spare_part_stock_movements')->insert([
                'id' => (string) Str::ulid(), 'spare_part_id' => $part->id, 'warehouse_id' => $data['warehouse_id'],
                'type' => $data['type'], 'quantity' => $data['quantity'], 'reason' => $data['reason'] ?? null,
                'reference_type' => $data['reference_type'] ?? null, 'reference_id' => $data['reference_id'] ?? null,
                'created_by' => $actor->id, 'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->audit->tenant($request, 'spare_part.stock_adjusted', 'SPARE_PART', $part->id, null, $data);
        });

        return $this->show($request, $part->id);
    }

    public function movements(Request $request, string $sparePart): mixed
    {
        $this->scope->sparePart($request->attributes->get('tenant_user'), $sparePart);
        $query = DB::table('spare_part_stock_movements')->where('spare_part_id', $sparePart)->orderByDesc('created_at');

        return ApiData::paginated($query->paginate($request->integer('per_page', 20)));
    }

    private function sparePartData(Request $request, bool $partial = false, ?string $ignore = null): array
    {
        $mode = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'site_id' => [$mode, 'ulid', Rule::exists('sites', 'id')],
            'spare_part_category_id' => ['nullable', 'ulid', Rule::exists('spare_part_categories', 'id')],
            'code' => [$mode, 'string', 'max:80', Rule::unique('spare_parts', 'code')->ignore($ignore)],
            'name' => [$mode, 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'unit' => ['sometimes', 'string', 'max:32'],
            'barcode' => ['nullable', 'string', 'max:128', Rule::unique('spare_parts', 'barcode')->ignore($ignore)],
            'min_stock' => ['sometimes', 'integer', 'min:0'],
            'reorder_point' => ['sometimes', 'integer', 'min:0'],
            'unit_cost' => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
