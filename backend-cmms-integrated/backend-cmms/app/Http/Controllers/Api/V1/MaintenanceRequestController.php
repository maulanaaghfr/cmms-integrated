<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\TenantScope;
use App\Services\WorkOrderService;
use App\Support\ApiData;
use App\Support\CmmsNumber;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class MaintenanceRequestController extends Controller
{
    public function __construct(private readonly TenantScope $scope, private readonly WorkOrderService $workOrders, private readonly NotificationService $notifications, private readonly AuditService $audit) {}

    public function index(Request $request): mixed
    {
        $query = $this->scope->maintenanceRequests($request->attributes->get('tenant_user'))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))->orderByDesc('reported_at');

        return ApiData::paginated($query->paginate($request->integer('per_page', 20)));
    }

    public function show(Request $request, string $maintenanceRequest): mixed
    {
        $row = $this->request($request, $maintenanceRequest);
        $row->history = DB::table('maintenance_request_status_histories')->where('maintenance_request_id', $maintenanceRequest)->orderBy('occurred_at')->get();
        $row->work_order = $this->scope->workOrders($request->attributes->get('tenant_user'))
            ->where('maintenance_request_id', $maintenanceRequest)->first();

        return ApiData::item($row);
    }

    public function store(Request $request): mixed
    {
        $data = $request->validate(['asset_id' => ['required', 'ulid'], 'title' => ['required', 'string', 'max:255'], 'description' => ['required', 'string'], 'priority' => ['required', Rule::in(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])], 'due_at' => ['nullable', 'date', 'after:now']]);
        $actor = $request->attributes->get('tenant_user');
        if (! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR', 'TECHNICIAN', 'OPERATOR'], true)) {
            throw new ApiException('REQUEST_CREATE_FORBIDDEN', 'Your role cannot create maintenance requests.', 403);
        }
        $asset = $this->scope->asset($actor, $data['asset_id']);
        $id = (string) Str::ulid();
        $result = DB::transaction(function () use ($id, $data, $actor, $asset) {
            DB::table('maintenance_requests')->insert([
                'id' => $id, 'request_number' => CmmsNumber::make('REQ'), 'asset_id' => $asset->id, 'requester_id' => $actor->id,
                'title' => $data['title'], 'description' => $data['description'], 'priority' => $data['priority'], 'status' => 'PENDING_APPROVAL',
                'approval_required' => true, 'reported_at' => now(), 'approved_at' => null, 'approved_by' => null,
                'rejected_at' => null, 'rejected_by' => null, 'rejection_reason' => null, 'cancelled_at' => null, 'cancelled_by' => null,
                'lock_version' => 1, 'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->history($id, null, 'SUBMITTED', $actor->id);
            $this->history($id, 'SUBMITTED', 'PENDING_APPROVAL', $actor->id);

            return ['request' => DB::table('maintenance_requests')->where('id', $id)->first(), 'work_order' => null];
        });
        $this->notifications->send($this->notifications->maintenanceManagersForAsset($asset), 'request.approval_required', 'REQUEST', $id, 'Maintenance request needs approval', $data['title']);
        $this->audit->tenant($request, 'request.created', 'REQUEST', $id, null, $data);

        return ApiData::item($result, 201);
    }

    public function approve(Request $request, string $maintenanceRequest): mixed
    {
        $data = $request->validate(['note' => ['nullable', 'string'], 'due_at' => ['nullable', 'date']]);
        $actor = $request->attributes->get('tenant_user');
        $row = $this->request($request, $maintenanceRequest);
        $this->ensureMaintenanceManagerApproval($actor, $row->requester_id);
        $asset = $this->scope->asset($actor, $row->asset_id);
        $workOrder = DB::transaction(function () use ($row, $actor, $asset, $data) {
            $locked = DB::table('maintenance_requests')->where('id', $row->id)->lockForUpdate()->first();
            if (! $locked || $locked->status !== 'PENDING_APPROVAL') {
                throw new ApiException('REQUEST_NOT_PENDING_APPROVAL', 'Only pending requests can be approved.', 409);
            }
            DB::table('maintenance_requests')->where('id', $locked->id)->update(['status' => 'CONVERTED', 'approved_at' => now(), 'approved_by' => $actor->id, 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now()]);
            $this->history($locked->id, 'PENDING_APPROVAL', 'CONVERTED', $actor->id, $data['note'] ?? null);

            return $this->workOrders->create($asset, $actor, ['title' => $locked->title, 'description' => $locked->description, 'priority' => $locked->priority, 'requester_id' => $locked->requester_id, ...$data], 'REQUEST', $locked->id);
        });
        $this->notifications->send($row->requester_id, 'request.approved', 'REQUEST', $row->id, 'Request approved', $row->title);
        $this->audit->tenant($request, 'request.approved', 'REQUEST', $row->id, $row, ['work_order_id' => $workOrder->id]);

        return ApiData::item(['request' => DB::table('maintenance_requests')->where('id', $row->id)->first(), 'work_order' => $workOrder]);
    }

    public function update(Request $request, string $maintenanceRequest): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $before = $this->request($request, $maintenanceRequest);
        if ($before->requester_id !== $actor->id && ! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR'], true)) {
            throw new ApiException('REQUEST_EDIT_FORBIDDEN', 'Only the requester or maintenance leadership can edit this request.', 403);
        }
        if (! in_array($before->status, ['SUBMITTED', 'PENDING_APPROVAL'], true)) {
            throw new ApiException('REQUEST_IMMUTABLE', 'A request cannot be edited after it is processed.', 409);
        }
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'], 'description' => ['sometimes', 'string'],
            'priority' => ['sometimes', Rule::in(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])],
        ]);
        $updated = DB::transaction(function () use ($maintenanceRequest, $data): object {
            DB::table('maintenance_requests')->where('id', $maintenanceRequest)->update([
                ...$data, 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now(),
            ]);

            return DB::table('maintenance_requests')->where('id', $maintenanceRequest)->first();
        });
        $this->audit->tenant($request, 'request.updated', 'REQUEST', $maintenanceRequest, $before, $updated);

        return $this->show($request, $maintenanceRequest);
    }

    public function reject(Request $request, string $maintenanceRequest): mixed
    {
        $data = $request->validate(['reason' => ['required', 'string']]);
        $actor = $request->attributes->get('tenant_user');
        $row = $this->request($request, $maintenanceRequest);
        $this->ensureMaintenanceManagerApproval($actor, $row->requester_id);
        DB::transaction(function () use ($row, $actor, $data): void {
            $locked = DB::table('maintenance_requests')->where('id', $row->id)->lockForUpdate()->first();
            if (! $locked || $locked->status !== 'PENDING_APPROVAL') {
                throw new ApiException('REQUEST_NOT_PENDING_APPROVAL', 'Only pending requests can be rejected.', 409);
            }
            DB::table('maintenance_requests')->where('id', $locked->id)->update(['status' => 'REJECTED', 'rejected_at' => now(), 'rejected_by' => $actor->id, 'rejection_reason' => $data['reason'], 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now()]);
            $this->history($locked->id, 'PENDING_APPROVAL', 'REJECTED', $actor->id, $data['reason']);
        });
        $this->notifications->send($row->requester_id, 'request.rejected', 'REQUEST', $row->id, 'Request rejected', $row->title);
        $this->audit->tenant($request, 'request.rejected', 'REQUEST', $row->id, $row, $data);

        return ApiData::item(DB::table('maintenance_requests')->where('id', $row->id)->first());
    }

    public function cancel(Request $request, string $maintenanceRequest): mixed
    {
        $data = $request->validate(['reason' => ['required', 'string']]);
        $actor = $request->attributes->get('tenant_user');
        $row = $this->request($request, $maintenanceRequest);
        if (! in_array($row->status, ['SUBMITTED', 'PENDING_APPROVAL'], true) || ($row->requester_id !== $actor->id && ! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR'], true))) {
            throw new ApiException('REQUEST_CANNOT_CANCEL', 'This request cannot be cancelled by the current user.', 409);
        }
        DB::transaction(function () use ($row, $actor, $data): void {
            DB::table('maintenance_requests')->where('id', $row->id)->update(['status' => 'CANCELLED', 'cancelled_at' => now(), 'cancelled_by' => $actor->id, 'updated_at' => now()]);
            $this->history($row->id, $row->status, 'CANCELLED', $actor->id, $data['reason']);
        });

        return ApiData::item(DB::table('maintenance_requests')->where('id', $row->id)->first());
    }

    private function request(Request $request, string $id): object
    {
        return $this->scope->maintenanceRequest($request->attributes->get('tenant_user'), $id);
    }

    private function history(string $id, ?string $from, string $to, string $actor, ?string $note = null): void
    {
        DB::table('maintenance_request_status_histories')->insert(['id' => (string) Str::ulid(), 'maintenance_request_id' => $id, 'from_status' => $from, 'to_status' => $to, 'actor_id' => $actor, 'note' => $note, 'occurred_at' => now()]);
    }

    private function ensureMaintenanceManagerApproval(object $actor, string $requesterId): void
    {
        if ($actor->role_key !== 'MANAGER') {
            throw new ApiException('MAINTENANCE_MANAGER_REQUIRED', 'Only a Maintenance Manager can approve or reject maintenance requests.', 403);
        }
        if ($actor->id === $requesterId) {
            throw new ApiException('SELF_APPROVAL_FORBIDDEN', 'A Maintenance Manager cannot approve or reject their own request.', 403);
        }
    }
}
