<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\PmService;
use App\Services\TenantScope;
use App\Services\WorkOrderService;
use App\Support\ApiData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class WorkOrderController extends Controller
{
    public function __construct(private readonly TenantScope $scope, private readonly WorkOrderService $service, private readonly NotificationService $notifications, private readonly AuditService $audit, private readonly PmService $pm) {}

    public function index(Request $request): mixed
    {
        $query = $this->scope->workOrders($request->attributes->get('tenant_user'))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('priority'), fn ($q) => $q->where('priority', $request->string('priority')))
            ->when($request->filled('assignee_id'), fn ($q) => $q->where('current_assignee_id', $request->string('assignee_id')));

        return ApiData::paginated($query->orderByDesc('created_at')->paginate($request->integer('per_page', 20)));
    }

    public function show(Request $request, string $workOrder): mixed
    {
        $row = $this->scope->workOrder($request->attributes->get('tenant_user'), $workOrder);
        $row->status_history = DB::table('work_order_status_histories')->where('work_order_id', $workOrder)->orderBy('occurred_at')->get();
        $row->assignments = DB::table('work_order_assignments')->where('work_order_id', $workOrder)->orderBy('assigned_at')->get();
        $row->labor_entries = DB::table('work_order_labor_entries')->where('work_order_id', $workOrder)->orderBy('started_at')->get();
        $row->comments = DB::table('comments')->where('entity_type', 'WORK_ORDER')->where('entity_id', $workOrder)->whereNull('deleted_at')->orderBy('created_at')->get();
        $row->attachments = DB::table('attachments')->where('entity_type', 'WORK_ORDER')->where('entity_id', $workOrder)->whereNull('deleted_at')->orderBy('created_at')->get();

        return ApiData::item($row);
    }

    public function store(Request $request): mixed
    {
        $data = $request->validate([
            'asset_id' => ['required', 'ulid'], 'title' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string'],
            'priority' => ['required', Rule::in(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])], 'due_at' => ['nullable', 'date'],
        ]);
        $actor = $request->attributes->get('tenant_user');
        if (! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR', 'OPERATOR'], true)) {
            throw new ApiException('WORK_ORDER_CREATE_FORBIDDEN', 'Your role cannot create direct work orders.', 403);
        }
        $asset = $this->scope->asset($actor, $data['asset_id']);
        $row = DB::transaction(fn () => $this->service->create($asset, $actor, $data));
        $this->notifications->send($this->notifications->maintenanceManagersForAsset($asset), 'work_order.approval_required', 'WORK_ORDER', $row->id, 'Direct work order needs approval', $row->title);
        $this->audit->tenant($request, 'work_order.created', 'WORK_ORDER', $row->id, null, $data);

        return $this->show($request, $row->id)->setStatusCode(201);
    }

    public function approve(Request $request, string $workOrder): mixed
    {
        $data = $request->validate(['note' => ['nullable', 'string']]);
        $actor = $request->attributes->get('tenant_user');
        $row = $this->scope->workOrder($actor, $workOrder);
        $this->ensureMaintenanceManagerApproval($actor, $row->created_by);
        $updated = DB::transaction(function () use ($row, $actor, $data) {
            $locked = DB::table('work_orders')->where('id', $row->id)->lockForUpdate()->first();
            if (! $locked || $locked->source !== 'DIRECT' || $locked->status !== 'PENDING_APPROVAL') {
                throw new ApiException('WORK_ORDER_NOT_PENDING_APPROVAL', 'Only pending direct work orders can be approved.', 409);
            }

            return $this->service->transition($locked, 'OPEN', $actor, $data['note'] ?? null, 'APPROVED', [
                'approved_at' => now(), 'approved_by' => $actor->id,
            ]);
        });
        $this->notifications->send($row->requester_id, 'work_order.approved', 'WORK_ORDER', $row->id, 'Work order approved', $row->title);
        $this->audit->tenant($request, 'work_order.approved', 'WORK_ORDER', $row->id, $row, $updated);

        return ApiData::item($updated);
    }

    public function reject(Request $request, string $workOrder): mixed
    {
        $data = $request->validate(['reason' => ['required', 'string']]);
        $actor = $request->attributes->get('tenant_user');
        $row = $this->scope->workOrder($actor, $workOrder);
        $this->ensureMaintenanceManagerApproval($actor, $row->created_by);
        $updated = DB::transaction(function () use ($row, $actor, $data) {
            $locked = DB::table('work_orders')->where('id', $row->id)->lockForUpdate()->first();
            if (! $locked || $locked->source !== 'DIRECT' || $locked->status !== 'PENDING_APPROVAL') {
                throw new ApiException('WORK_ORDER_NOT_PENDING_APPROVAL', 'Only pending direct work orders can be rejected.', 409);
            }

            return $this->service->transition($locked, 'REJECTED', $actor, $data['reason'], 'REJECTED', [
                'rejected_at' => now(), 'rejected_by' => $actor->id, 'rejection_reason' => $data['reason'],
            ]);
        });
        $this->notifications->send($row->requester_id, 'work_order.rejected', 'WORK_ORDER', $row->id, 'Work order rejected', $data['reason']);
        $this->audit->tenant($request, 'work_order.rejected', 'WORK_ORDER', $row->id, $row, $updated);

        return ApiData::item($updated);
    }

    public function update(Request $request, string $workOrder): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $before = $this->scope->workOrder($actor, $workOrder);
        if ($before->requester_id !== $actor->id && ! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR'], true)) {
            throw new ApiException('WORK_ORDER_EDIT_FORBIDDEN', 'Only the requester or maintenance leadership can edit this work order.', 403);
        }
        $this->ensureWorkOrderIsEditable($before);
        $data = $request->validate(['title' => ['sometimes', 'string', 'max:255'], 'description' => ['nullable', 'string'], 'priority' => ['sometimes', Rule::in(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])], 'due_at' => ['nullable', 'date']]);
        $updated = DB::transaction(function () use ($workOrder, $data): object {
            $locked = DB::table('work_orders')->where('id', $workOrder)->lockForUpdate()->first()
                ?? throw new ApiException('WORK_ORDER_NOT_FOUND', 'Work order was not found.', 404);
            $this->ensureWorkOrderIsEditable($locked);
            DB::table('work_orders')->where('id', $workOrder)->update([...$data, 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now()]);

            return DB::table('work_orders')->where('id', $workOrder)->first();
        });
        $this->audit->tenant($request, 'work_order.updated', 'WORK_ORDER', $workOrder, $before, $updated);

        return $this->show($request, $workOrder);
    }

    public function assign(Request $request, string $workOrder): mixed
    {
        $data = $request->validate(['team_id' => ['nullable', 'ulid', Rule::exists('teams', 'id')], 'assignee_id' => ['nullable', 'ulid', Rule::exists('tenant_users', 'id')]]);
        if (empty($data['team_id']) && empty($data['assignee_id'])) {
            throw new ApiException('ASSIGNMENT_TARGET_REQUIRED', 'A team or technician is required.', 422);
        }
        $actor = $request->attributes->get('tenant_user');
        $row = $this->scope->workOrder($actor, $workOrder);
        if (! in_array($row->status, ['OPEN', 'ASSIGNED'], true)) {
            throw new ApiException('WORK_ORDER_NOT_ASSIGNABLE', 'A work order can only be assigned after approval and before work starts.', 409);
        }
        if (! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR'], true) && $row->requester_id !== $actor->id) {
            throw new ApiException('WORK_ORDER_ASSIGN_FORBIDDEN', 'Only the requester or maintenance leadership can assign this work order.', 403);
        }
        $asset = DB::table('assets')->where('id', $row->asset_id)->first();
        $this->validateAssignment($asset, $data['team_id'] ?? null, $data['assignee_id'] ?? null);
        $updated = DB::transaction(function () use ($row, $actor, $data) {
            $locked = DB::table('work_orders')->where('id', $row->id)->lockForUpdate()->first();
            if (! $locked || ! in_array($locked->status, ['OPEN', 'ASSIGNED'], true)) {
                throw new ApiException('WORK_ORDER_NOT_ASSIGNABLE', 'A work order can only be assigned after approval and before work starts.', 409);
            }
            DB::table('work_orders')->where('id', $locked->id)->update(['status' => 'ASSIGNED', 'current_team_id' => $data['team_id'] ?? null, 'current_assignee_id' => $data['assignee_id'] ?? null, 'is_claimable' => false, 'updated_at' => now()]);
            $this->service->assignment($locked->id, $locked->current_assignee_id || $locked->current_team_id ? 'REASSIGN' : 'ASSIGN', $data['team_id'] ?? null, $data['assignee_id'] ?? null, $actor->id);
            if ($locked->status === 'OPEN') {
                $this->service->history($locked->id, 'OPEN', 'ASSIGNED', $actor->id);
            }

            return DB::table('work_orders')->where('id', $locked->id)->first();
        });
        $this->notifications->send($data['assignee_id'] ?? null, 'work_order.assigned', 'WORK_ORDER', $row->id, 'Work order assigned', $row->title);

        return ApiData::item($updated);
    }

    public function acknowledge(Request $request, string $workOrder): mixed
    {
        $row = $this->assignedWorkOrder($request, $workOrder);
        if ($row->status !== 'ASSIGNED') {
            throw new ApiException('WORK_ORDER_ACKNOWLEDGE_INVALID', 'Only an assigned work order can be acknowledged.', 409);
        }
        DB::table('work_orders')->where('id', $row->id)->update(['acknowledged_at' => now(), 'updated_at' => now()]);

        return ApiData::item(DB::table('work_orders')->where('id', $row->id)->first());
    }

    public function start(Request $request, string $workOrder): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $row = $this->assignedWorkOrder($request, $workOrder);
        $updated = DB::transaction(fn () => $this->service->transition($row, 'IN_PROGRESS', $actor, null, null, ['work_started_at' => $row->work_started_at ?: now()]));

        return ApiData::item($updated);
    }

    public function hold(Request $request, string $workOrder): mixed
    {
        $data = $request->validate(['reason' => ['required', 'string']]);
        $row = $this->assignedWorkOrder($request, $workOrder);
        $actor = $request->attributes->get('tenant_user');

        return ApiData::item(DB::transaction(function () use ($row, $actor, $data): object {
            $locked = DB::table('work_orders')->where('id', $row->id)->lockForUpdate()->first()
                ?? throw new ApiException('WORK_ORDER_NOT_FOUND', 'Work order was not found.', 404);
            $this->stopTimers($locked->id);

            return $this->service->transition($locked, 'ON_HOLD', $actor, $data['reason'], 'ON_HOLD');
        }));
    }

    public function resume(Request $request, string $workOrder): mixed
    {
        $row = $this->assignedWorkOrder($request, $workOrder);

        return ApiData::item(DB::transaction(fn () => $this->service->transition($row, 'IN_PROGRESS', $request->attributes->get('tenant_user'), $request->input('note'))));
    }

    public function complete(Request $request, string $workOrder): mixed
    {
        $data = $request->validate(['completion_note' => ['required', 'string']]);
        $actor = $request->attributes->get('tenant_user');
        $row = $this->assignedWorkOrder($request, $workOrder);
        $updated = DB::transaction(function () use ($row, $actor, $data) {
            $this->stopTimers($row->id);

            return $this->service->transition($row, 'COMPLETED', $actor, $data['completion_note'], null, ['completed_at' => now(), 'completed_by' => $actor->id, 'completion_note' => $data['completion_note']]);
        });
        $recipients = array_unique([$row->requester_id, ...$this->notifications->supervisorsForAsset(DB::table('assets')->where('id', $row->asset_id)->first())]);
        $this->notifications->send($recipients, 'work_order.completed', 'WORK_ORDER', $row->id, 'Work order completed', $row->title);

        return ApiData::item($updated);
    }

    public function verify(Request $request, string $workOrder): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $row = $this->scope->workOrder($actor, $workOrder);
        if ($row->requester_id !== $actor->id && ! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR'], true)) {
            throw new ApiException('WORK_ORDER_VERIFY_FORBIDDEN', 'Only the requester or maintenance leadership can verify this work.', 403);
        }
        $updated = DB::transaction(function () use ($row, $actor) {
            $verified = $this->service->transition($row, 'VERIFIED', $actor, null, null, ['verified_at' => now(), 'verified_by' => $actor->id]);
            $closed = $this->service->transition($verified, 'CLOSED', $actor, null, null, ['closed_at' => now(), 'closed_by' => $actor->id]);
            if ($closed->pm_occurrence_id) {
                $this->pm->completeOccurrence($closed->pm_occurrence_id, now());
            }

            return $closed;
        });
        $this->notifications->send($row->current_assignee_id, 'work_order.closed', 'WORK_ORDER', $row->id, 'Work order closed', $row->title);

        return ApiData::item($updated);
    }

    public function rejectCompletion(Request $request, string $workOrder): mixed
    {
        $data = $request->validate(['reason' => ['required', 'string']]);
        $actor = $request->attributes->get('tenant_user');
        $row = $this->scope->workOrder($actor, $workOrder);
        if ($row->requester_id !== $actor->id && ! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR'], true)) {
            throw new ApiException('WORK_ORDER_VERIFY_FORBIDDEN', 'You cannot reject this completion.', 403);
        }
        $updated = DB::transaction(fn () => $this->service->transition($row, 'IN_PROGRESS', $actor, $data['reason'], 'COMPLETION_REJECTED', ['completed_at' => null, 'completed_by' => null]));
        $this->notifications->send($row->current_assignee_id, 'work_order.completion_rejected', 'WORK_ORDER', $row->id, 'Completion rejected', $data['reason']);

        return ApiData::item($updated);
    }

    public function cancel(Request $request, string $workOrder): mixed
    {
        $data = $request->validate(['reason' => ['required', 'string']]);
        $actor = $request->attributes->get('tenant_user');
        if (! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR'], true)) {
            throw new ApiException('WORK_ORDER_CANCEL_FORBIDDEN', 'Your role cannot cancel work orders.', 403);
        }
        $row = $this->scope->workOrder($actor, $workOrder);
        $updated = DB::transaction(fn () => $this->service->transition($row, 'CANCELLED', $actor, $data['reason'], 'CANCELLATION', ['cancelled_at' => now(), 'cancelled_by' => $actor->id, 'cancellation_reason' => $data['reason']]));

        return ApiData::item($updated);
    }

    public function startTimer(Request $request, string $workOrder): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $row = $this->assignedWorkOrder($request, $workOrder);
        $entry = DB::transaction(function () use ($row, $actor, $request): object {
            $locked = DB::table('work_orders')->where('id', $row->id)->lockForUpdate()->first()
                ?? throw new ApiException('WORK_ORDER_NOT_FOUND', 'Work order was not found.', 404);
            if ($locked->status !== 'IN_PROGRESS') {
                throw new ApiException('TIMER_STATUS_INVALID', 'Timer can only start while the work order is in progress.', 409);
            }
            if (DB::table('work_order_labor_entries')->where('technician_id', $actor->id)->whereNull('ended_at')->exists()) {
                throw new ApiException('ACTIVE_TIMER_EXISTS', 'Stop the current timer before starting another one.', 409);
            }
            $id = (string) Str::ulid();
            DB::table('work_order_labor_entries')->insert(['id' => $id, 'work_order_id' => $locked->id, 'technician_id' => $actor->id, 'started_at' => now(), 'ended_at' => null, 'duration_minutes' => null, 'notes' => $request->input('notes'), 'created_at' => now(), 'updated_at' => now()]);

            return DB::table('work_order_labor_entries')->where('id', $id)->first();
        });

        return ApiData::item($entry, 201);
    }

    public function stopTimer(Request $request, string $workOrder): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $entry = DB::table('work_order_labor_entries')->where('work_order_id', $workOrder)->where('technician_id', $actor->id)->whereNull('ended_at')->first();
        if (! $entry) {
            throw new ApiException('ACTIVE_TIMER_NOT_FOUND', 'No active timer exists for this work order.', 404);
        }
        $minutes = max(0, now()->diffInMinutes($entry->started_at));
        DB::table('work_order_labor_entries')->where('id', $entry->id)->update(['ended_at' => now(), 'duration_minutes' => $minutes, 'notes' => $request->input('notes', $entry->notes), 'updated_at' => now()]);

        return ApiData::item(DB::table('work_order_labor_entries')->where('id', $entry->id)->first());
    }

    private function assignedWorkOrder(Request $request, string $id): object
    {
        $actor = $request->attributes->get('tenant_user');
        $row = $this->scope->workOrder($actor, $id);
        if ($row->current_assignee_id !== $actor->id && ! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR'], true)) {
            throw new ApiException('WORK_ORDER_ASSIGNEE_REQUIRED', 'You are not allowed to execute this work order.', 403);
        }

        return $row;
    }

    private function validateAssignment(object $asset, ?string $teamId, ?string $assigneeId): void
    {
        if ($teamId && ! DB::table('teams')->where('id', $teamId)->where('site_id', $asset->site_id)->where('is_active', true)->exists()) {
            throw new ApiException('TEAM_SITE_MISMATCH', 'Assigned team must be active at the asset site.', 422);
        }
        if ($assigneeId && ! DB::table('tenant_users')->where('id', $assigneeId)->where('primary_site_id', $asset->site_id)
            ->where('role_key', 'TECHNICIAN')->where('status', 'ACTIVE')->exists()) {
            throw new ApiException('TECHNICIAN_SITE_MISMATCH', 'Assignee must be an active technician at the asset site.', 422);
        }
    }

    private function stopTimers(string $workOrderId): void
    {
        foreach (DB::table('work_order_labor_entries')->where('work_order_id', $workOrderId)->whereNull('ended_at')->get() as $entry) {
            DB::table('work_order_labor_entries')->where('id', $entry->id)->update(['ended_at' => now(), 'duration_minutes' => max(0, now()->diffInMinutes($entry->started_at)), 'updated_at' => now()]);
        }
    }

    private function ensureMaintenanceManagerApproval(object $actor, string $creatorId): void
    {
        if (! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER'], true)) {
            throw new ApiException('MAINTENANCE_MANAGER_REQUIRED', 'Only a Company Admin or Maintenance Manager can approve or reject direct work orders.', 403);
        }
        if ($actor->role_key === 'MANAGER' && $actor->id === $creatorId) {
            throw new ApiException('SELF_APPROVAL_FORBIDDEN', 'A Maintenance Manager cannot approve or reject their own work order.', 403);
        }
    }

    private function ensureWorkOrderIsEditable(object $workOrder): void
    {
        if (! in_array($workOrder->status, ['PENDING_APPROVAL', 'OPEN', 'ASSIGNED'], true)) {
            throw new ApiException('WORK_ORDER_IMMUTABLE', 'Work order details cannot be edited after work starts or reaches a terminal state.', 409);
        }
    }
}
