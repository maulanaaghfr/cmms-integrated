<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\AuditService;
use App\Support\ApiData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ProcurementController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    /* ================================================================
     * VENDORS
     * ============================================================== */

    public function vendors(Request $request): mixed
    {
        $query = DB::table('vendors')
            ->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = '%'.$request->string('search').'%';
                $q->where(fn ($q2) => $q2->where('name', 'ilike', $search)
                    ->orWhere('city', 'ilike', $search));
            });

        return ApiData::paginated($query->orderBy('name')->paginate($request->integer('per_page', 50)));
    }

    public function vendor(string $vendor): mixed
    {
        return ApiData::item($this->findVendor($vendor));
    }

    public function storeVendor(Request $request): mixed
    {
        $data = $this->vendorData($request);
        $id = (string) Str::ulid();
        DB::table('vendors')->insert([
            'id' => $id,
            ...$data,
            'is_active' => true,
            'archived_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->audit->tenant($request, 'vendor.created', 'VENDOR', $id, null, $data);

        return ApiData::item($this->findVendor($id), 201);
    }

    public function updateVendor(Request $request, string $vendor): mixed
    {
        $before = $this->findVendor($vendor);
        $data = $this->vendorData($request, true);
        DB::table('vendors')->where('id', $vendor)->update([...$data, 'updated_at' => now()]);
        $this->audit->tenant($request, 'vendor.updated', 'VENDOR', $vendor, $before, $data);

        return ApiData::item($this->findVendor($vendor));
    }

    public function archiveVendor(Request $request, string $vendor): mixed
    {
        $before = $this->findVendor($vendor);
        DB::table('vendors')->where('id', $vendor)->update([
            'is_active' => false,
            'archived_at' => now(),
            'updated_at' => now(),
        ]);
        $this->audit->tenant($request, 'vendor.archived', 'VENDOR', $vendor, $before);

        return response()->json(null, 204);
    }

    /* ================================================================
     * PURCHASE ORDERS
     * ============================================================== */

    public function purchaseOrders(Request $request): mixed
    {
        $query = DB::table('purchase_orders')
            ->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))
            ->when($request->filled('vendor_id'), fn ($q) => $q->where('vendor_id', $request->string('vendor_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')));

        $paginator = $query->orderByDesc('created_at')->paginate($request->integer('per_page', 50));

        // Attach vendor name and items to each PO
        $items = collect($paginator->items())->map(function ($po) {
            $po->vendor_name = $po->vendor_id
                ? DB::table('vendors')->where('id', $po->vendor_id)->value('name')
                : null;
            $po->items = DB::table('purchase_order_items')
                ->where('purchase_order_id', $po->id)
                ->get();

            return $po;
        })->all();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    public function purchaseOrder(string $po): mixed
    {
        $row = $this->findPO($po);
        $row->vendor_name = $row->vendor_id
            ? DB::table('vendors')->where('id', $row->vendor_id)->value('name')
            : null;
        $row->items = DB::table('purchase_order_items')
            ->where('purchase_order_id', $po)
            ->get();

        return ApiData::item($row);
    }

    public function storePurchaseOrder(Request $request): mixed
    {
        $data = $request->validate([
            'vendor_id'     => ['nullable', 'ulid', Rule::exists('vendors', 'id')],
            'status'        => ['sometimes', Rule::in(['DRAFT', 'SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'INVOICED', 'PAID', 'CANCELLED'])],
            'invoice_status'=> ['sometimes', Rule::in(['PENDING', 'INVOICED', 'PAID'])],
            'expected_date' => ['nullable', 'date'],
            'notes'         => ['nullable', 'string'],
            'items'         => ['required', 'array', 'min:1'],
            'items.*.spare_part_id' => ['nullable', 'ulid'],
            'items.*.part_name'     => ['required', 'string', 'max:255'],
            'items.*.quantity'      => ['required', 'integer', 'min:1'],
            'items.*.unit_price'    => ['required', 'numeric', 'min:0'],
        ]);

        $id = (string) Str::ulid();
        $poNumber = $this->generatePoNumber();
        $totalCost = collect($data['items'])->sum(fn ($i) => $i['quantity'] * $i['unit_price']);

        DB::transaction(function () use ($id, $poNumber, $data, $totalCost, $request) {
            DB::table('purchase_orders')->insert([
                'id'             => $id,
                'po_number'      => $poNumber,
                'vendor_id'      => $data['vendor_id'] ?? null,
                'status'         => $data['status'] ?? 'DRAFT',
                'invoice_status' => $data['invoice_status'] ?? 'PENDING',
                'total_cost'     => $totalCost,
                'expected_date'  => $data['expected_date'] ?? null,
                'received_date'  => null,
                'notes'          => $data['notes'] ?? null,
                'created_by'     => $request->attributes->get('tenant_user')?->id,
                'is_active'      => true,
                'archived_at'    => null,
                'created_at'     => now(),
                'updated_at'     => now(),
            ]);

            foreach ($data['items'] as $item) {
                DB::table('purchase_order_items')->insert([
                    'id'                => (string) Str::ulid(),
                    'purchase_order_id' => $id,
                    'spare_part_id'     => $item['spare_part_id'] ?? null,
                    'part_name'         => $item['part_name'],
                    'quantity'          => $item['quantity'],
                    'unit_price'        => $item['unit_price'],
                    'total_price'       => $item['quantity'] * $item['unit_price'],
                    'created_at'        => now(),
                    'updated_at'        => now(),
                ]);
            }
        });

        $this->audit->tenant($request, 'purchase_order.created', 'PURCHASE_ORDER', $id, null, $data);

        return $this->purchaseOrder($id)->setStatusCode(201);
    }

    public function updatePurchaseOrder(Request $request, string $po): mixed
    {
        $before = $this->findPO($po);
        $data = $request->validate([
            'vendor_id'     => ['nullable', 'ulid', Rule::exists('vendors', 'id')],
            'status'        => ['sometimes', Rule::in(['DRAFT', 'SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'INVOICED', 'PAID', 'CANCELLED'])],
            'invoice_status'=> ['sometimes', Rule::in(['PENDING', 'INVOICED', 'PAID'])],
            'expected_date' => ['nullable', 'date'],
            'received_date' => ['nullable', 'date'],
            'notes'         => ['nullable', 'string'],
            'items'         => ['sometimes', 'array', 'min:1'],
            'items.*.id'            => ['nullable', 'ulid'],
            'items.*.spare_part_id' => ['nullable', 'ulid'],
            'items.*.part_name'     => ['required_with:items', 'string', 'max:255'],
            'items.*.quantity'      => ['required_with:items', 'integer', 'min:1'],
            'items.*.unit_price'    => ['required_with:items', 'numeric', 'min:0'],
        ]);

        if (($data['status'] ?? null) === 'RECEIVED') {
            throw new ApiException('PURCHASE_ORDER_RECEIVE_REQUIRED', 'Use the receiving endpoint to receive stock.', 422);
        }

        DB::transaction(function () use ($po, $data, $before) {
            $updateData = array_filter([
                'vendor_id'      => $data['vendor_id'] ?? $before->vendor_id,
                'status'         => $data['status'] ?? null,
                'invoice_status' => $data['invoice_status'] ?? null,
                'expected_date'  => $data['expected_date'] ?? null,
                'received_date'  => $data['received_date'] ?? null,
                'notes'          => $data['notes'] ?? null,
                'updated_at'     => now(),
            ], fn ($v) => $v !== null);

            if (isset($data['items'])) {
                $totalCost = collect($data['items'])->sum(fn ($i) => $i['quantity'] * $i['unit_price']);
                $updateData['total_cost'] = $totalCost;

                DB::table('purchase_order_items')->where('purchase_order_id', $po)->delete();
                foreach ($data['items'] as $item) {
                    DB::table('purchase_order_items')->insert([
                        'id'                => (string) Str::ulid(),
                        'purchase_order_id' => $po,
                        'spare_part_id'     => $item['spare_part_id'] ?? null,
                        'part_name'         => $item['part_name'],
                        'quantity'          => $item['quantity'],
                        'unit_price'        => $item['unit_price'],
                        'total_price'       => $item['quantity'] * $item['unit_price'],
                        'created_at'        => now(),
                        'updated_at'        => now(),
                    ]);
                }
            }

            DB::table('purchase_orders')->where('id', $po)->update($updateData);
        });

        $this->audit->tenant($request, 'purchase_order.updated', 'PURCHASE_ORDER', $po, $before, $data);

        return $this->purchaseOrder($po);
    }

    public function receivePurchaseOrder(Request $request, string $po): mixed
    {
        $data = $request->validate([
            'warehouse_id' => ['required', 'ulid', Rule::exists('warehouses', 'id')],
            'received_date' => ['nullable', 'date'],
        ]);
        $actor = $request->attributes->get('tenant_user');

        DB::transaction(function () use ($po, $data, $actor): void {
            $order = DB::table('purchase_orders')->where('id', $po)->lockForUpdate()->first()
                ?? throw new ApiException('PURCHASE_ORDER_NOT_FOUND', 'Purchase order was not found.', 404);
            if (in_array($order->status, ['RECEIVED', 'INVOICED', 'PAID'], true)) {
                throw new ApiException('PURCHASE_ORDER_ALREADY_RECEIVED', 'This purchase order has already been received.', 409);
            }
            if ($order->status === 'CANCELLED') {
                throw new ApiException('PURCHASE_ORDER_CANCELLED', 'A cancelled purchase order cannot be received.', 422);
            }

            $items = DB::table('purchase_order_items')->where('purchase_order_id', $po)->lockForUpdate()->get();
            foreach ($items as $item) {
                if (! $item->spare_part_id || ! DB::table('spare_parts')->where('id', $item->spare_part_id)->where('is_active', true)->exists()) {
                    throw new ApiException('PURCHASE_ORDER_ITEM_NOT_STOCKABLE', "Item {$item->part_name} must reference an active spare part before receiving.", 422);
                }
                $stock = DB::table('spare_part_stocks')->where('spare_part_id', $item->spare_part_id)->where('warehouse_id', $data['warehouse_id'])->lockForUpdate()->first();
                if ($stock) {
                    DB::table('spare_part_stocks')->where('id', $stock->id)->update(['quantity' => $stock->quantity + $item->quantity, 'updated_at' => now()]);
                } else {
                    DB::table('spare_part_stocks')->insert(['id' => (string) Str::ulid(), 'spare_part_id' => $item->spare_part_id, 'warehouse_id' => $data['warehouse_id'], 'quantity' => $item->quantity, 'created_at' => now(), 'updated_at' => now()]);
                }
                DB::table('spare_part_stock_movements')->insert([
                    'id' => (string) Str::ulid(), 'spare_part_id' => $item->spare_part_id, 'warehouse_id' => $data['warehouse_id'],
                    'type' => 'IN', 'quantity' => $item->quantity, 'reason' => 'Purchase order receipt',
                    'reference_type' => 'PURCHASE_ORDER', 'reference_id' => $po, 'created_by' => $actor?->id,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            DB::table('purchase_orders')->where('id', $po)->update(['status' => 'RECEIVED', 'received_date' => $data['received_date'] ?? now()->toDateString(), 'updated_at' => now()]);
        });

        $this->audit->tenant($request, 'purchase_order.received', 'PURCHASE_ORDER', $po, null, ['warehouse_id' => $data['warehouse_id']]);

        return $this->purchaseOrder($po);
    }

    public function archivePurchaseOrder(Request $request, string $po): mixed
    {
        $before = $this->findPO($po);
        DB::table('purchase_orders')->where('id', $po)->update([
            'is_active'   => false,
            'archived_at' => now(),
            'updated_at'  => now(),
        ]);
        $this->audit->tenant($request, 'purchase_order.archived', 'PURCHASE_ORDER', $po, $before);

        return response()->json(null, 204);
    }

    /* ================================================================
     * HELPERS
     * ============================================================== */

    private function findVendor(string $id): object
    {
        return DB::table('vendors')->where('id', $id)->first()
            ?? throw new ApiException('VENDOR_NOT_FOUND', 'Vendor was not found.', 404);
    }

    private function findPO(string $id): object
    {
        return DB::table('purchase_orders')->where('id', $id)->first()
            ?? throw new ApiException('PURCHASE_ORDER_NOT_FOUND', 'Purchase order was not found.', 404);
    }

    private function generatePoNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "PO-{$year}-";
        $last = DB::table('purchase_orders')
            ->where('po_number', 'like', "{$prefix}%")
            ->orderByDesc('po_number')
            ->value('po_number');

        $seq = $last ? ((int) substr($last, strlen($prefix))) + 1 : 1;

        return $prefix.str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
    }

    private function vendorData(Request $request, bool $partial = false): array
    {
        $mode = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name'          => [$mode, 'string', 'max:255'],
            'vendor_type'   => ['sometimes', Rule::in(['Sparepart Supplier', 'Contractor', 'Service Provider'])],
            'contact_person'=> ['nullable', 'string', 'max:255'],
            'email'         => ['nullable', 'email', 'max:320'],
            'phone'         => ['nullable', 'string', 'max:64'],
            'address'       => ['nullable', 'string'],
            'city'          => ['nullable', 'string', 'max:100'],
            'country'       => ['sometimes', 'string', 'max:100'],
            'website'       => ['nullable', 'string', 'max:255'],
            'rating'        => ['sometimes', 'numeric', 'min:1', 'max:5'],
            'on_time_rate'  => ['sometimes', 'integer', 'min:0', 'max:100'],
            'quality_rate'  => ['sometimes', 'integer', 'min:0', 'max:100'],
            'price_score'   => ['sometimes', 'integer', 'min:0', 'max:100'],
            'total_spend'   => ['sometimes', 'numeric', 'min:0'],
            'is_active'     => ['sometimes', 'boolean'],
        ]);
    }
}
