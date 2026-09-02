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
        $row->parts = DB::table('spare_part_stock_movements')
            ->join('spare_parts', 'spare_parts.id', '=', 'spare_part_stock_movements.spare_part_id')
            ->join('warehouses', 'warehouses.id', '=', 'spare_part_stock_movements.warehouse_id')
            ->where('spare_part_stock_movements.reference_type', 'WORK_ORDER')
            ->where('spare_part_stock_movements.reference_id', $workOrder)
            ->select('spare_part_stock_movements.id', 'spare_part_stock_movements.quantity', 'spare_part_stock_movements.created_at', 'spare_parts.code', 'spare_parts.name', 'spare_parts.unit', 'warehouses.name as warehouse_name')
            ->orderBy('spare_part_stock_movements.created_at')
            ->get();
        $row->checklist = DB::table('work_order_checklist_items')->where('work_order_id', $workOrder)->orderBy('sort_order')->get();
        $row->signatures = DB::table('work_order_signatures')->where('work_order_id', $workOrder)->orderByDesc('signed_at')->get();
        $row->comments = DB::table('comments')->where('entity_type', 'WORK_ORDER')->where('entity_id', $workOrder)->whereNull('deleted_at')->orderBy('created_at')->get();
        $row->attachments = DB::table('attachments')->where('entity_type', 'WORK_ORDER')->where('entity_id', $workOrder)->whereNull('deleted_at')->orderBy('created_at')->get();
        $row->evidence = $row->attachments->groupBy('media_role');

        return ApiData::item($row);
    }

    public function store(Request $request): mixed
    {
        $data = $request->validate([
            'asset_id' => ['required', 'ulid'], 'title' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string'],
            'priority' => ['required', Rule::in(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])], 'due_at' => ['nullable', 'date'],
            'checklist' => ['nullable', 'array'], 'checklist.*' => ['required', 'string', 'max:500'],
        ]);
        $actor = $request->attributes->get('tenant_user');
        if (! in_array($actor->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR', 'OPERATOR'], true)) {
            throw new ApiException('WORK_ORDER_CREATE_FORBIDDEN', 'Your role cannot create direct work orders.', 403);
        }
        $asset = $this->scope->asset($actor, $data['asset_id']);
        $row = DB::transaction(function () use ($asset, $actor, $data): object {
            $created = $this->service->create($asset, $actor, $data);
            foreach (array_values($data['checklist'] ?? []) as $index => $label) {
                DB::table('work_order_checklist_items')->insert([
                    'id' => (string) Str::ulid(), 'work_order_id' => $created->id, 'label' => $label,
                    'sort_order' => $index, 'is_required' => true, 'is_completed' => false,
                    'note' => null, 'completed_by' => null, 'completed_at' => null,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            return $created;
        });
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

    public function recommendations(Request $request, string $workOrder): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $row = $this->scope->workOrder($actor, $workOrder);
        $asset = DB::table('assets')->leftJoin('asset_categories', 'asset_categories.id', '=', 'assets.asset_category_id')
            ->where('assets.id', $row->asset_id)->select('assets.*', 'asset_categories.name as category_name')->first();
        $active = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'];
        $load = DB::table('work_orders')->select('current_assignee_id', DB::raw('COUNT(*) as active_count'))
            ->whereIn('status', $active)->whereNotNull('current_assignee_id')->groupBy('current_assignee_id')->pluck('active_count', 'current_assignee_id');
        $teams = DB::table('team_members')->join('teams', 'teams.id', '=', 'team_members.team_id')
            ->where('teams.site_id', $asset->site_id)->where('teams.is_active', true)->where('team_members.is_active', true)
            ->select('team_members.tenant_user_id', 'teams.id as team_id', 'teams.name as team_name', 'teams.specialty')->get()->groupBy('tenant_user_id');
        $candidates = DB::table('tenant_users')->where('primary_site_id', $asset->site_id)->where('role_key', 'TECHNICIAN')->where('status', 'ACTIVE')->get();
        $result = $candidates->map(function (object $technician) use ($load, $teams, $asset): array {
            $memberships = $teams->get($technician->id, collect());
            $specialtyMatch = $memberships->contains(fn (object $team) => $team->specialty && $asset->category_name && str_contains(mb_strtolower($team->specialty), mb_strtolower($asset->category_name)));
            $activeCount = (int) ($load[$technician->id] ?? 0);
            return [
                'technician_id' => $technician->id, 'full_name' => $technician->full_name, 'primary_site_id' => $technician->primary_site_id,
                'active_work_orders' => $activeCount, 'availability' => $activeCount < 3 ? 'AVAILABLE' : 'BUSY',
                'specialty_match' => $specialtyMatch, 'team_ids' => $memberships->pluck('team_id')->values()->all(),
                'team_names' => $memberships->pluck('team_name')->values()->all(),
                'score' => ($specialtyMatch ? 100 : 50) + max(0, 30 - ($activeCount * 10)),
            ];
        })->sortByDesc('score')->values();
        return ApiData::item(['asset_id' => $asset->id, 'asset_category' => $asset->category_name, 'recommendations' => $result]);
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
        $requiredChecklist = DB::table('work_order_checklist_items')->where('work_order_id', $row->id)->where('is_required', true)->where('is_completed', false)->count();
        if ($requiredChecklist > 0) {
            throw new ApiException('WORK_ORDER_CHECKLIST_INCOMPLETE', 'Complete every required checklist item before submitting the work order.', 422);
        }
        if (! DB::table('work_order_signatures')->where('work_order_id', $row->id)->exists()) {
            throw new ApiException('WORK_ORDER_SIGNATURE_REQUIRED', 'A digital signature is required before submitting the work order.', 422);
        }
        foreach (['BEFORE', 'DURING', 'AFTER'] as $mediaRole) {
            if (! DB::table('attachments')->where('entity_type', 'WORK_ORDER')->where('entity_id', $row->id)->where('media_role', $mediaRole)->whereNull('deleted_at')->exists()) {
                throw new ApiException('WORK_ORDER_PHOTO_REQUIRED', "A {$mediaRole} photo is required before submitting the work order.", 422);
            }
        }
        $updated = DB::transaction(function () use ($row, $actor, $data) {
            $this->stopTimers($row->id);

            return $this->service->transition($row, 'COMPLETED', $actor, $data['completion_note'], null, ['completed_at' => now(), 'completed_by' => $actor->id, 'completion_note' => $data['completion_note']]);
        });
        $asset = DB::table('assets')->where('id', $row->asset_id)->first();
        $recipients = array_unique([$row->requester_id, $row->current_assignee_id, ...$this->notifications->stakeholdersForAsset($asset)]);
        $this->notifications->send($recipients, 'work_order.completed', 'WORK_ORDER', $row->id, 'Work order menunggu approval', $row->title);

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
        $asset = DB::table('assets')->where('id', $row->asset_id)->first();
        $this->notifications->send(array_unique([$row->requester_id, $row->current_assignee_id, ...$this->notifications->stakeholdersForAsset($asset)]), 'work_order.closed', 'WORK_ORDER', $row->id, 'Work order closed', $row->title);

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

    public function updateChecklist(Request $request, string $workOrder, string $item): mixed
    {
        $data = $request->validate(['is_completed' => ['required', 'boolean'], 'note' => ['nullable', 'string', 'max:2000']]);
        $actor = $request->attributes->get('tenant_user');
        $row = $this->assignedWorkOrder($request, $workOrder);
        if ($row->status !== 'IN_PROGRESS') throw new ApiException('CHECKLIST_STATUS_INVALID', 'Checklist can only be updated while the work order is in progress.', 409);
        $itemRow = DB::table('work_order_checklist_items')->where('id', $item)->where('work_order_id', $row->id)->first();
        if (! $itemRow) throw new ApiException('CHECKLIST_ITEM_NOT_FOUND', 'Checklist item was not found.', 404);
        DB::table('work_order_checklist_items')->where('id', $item)->update([
            'is_completed' => $data['is_completed'], 'note' => $data['note'] ?? null,
            'completed_by' => $data['is_completed'] ? $actor->id : null,
            'completed_at' => $data['is_completed'] ? now() : null, 'updated_at' => now(),
        ]);
        return ApiData::item(DB::table('work_order_checklist_items')->where('id', $item)->first());
    }

    public function sign(Request $request, string $workOrder): mixed
    {
        $data = $request->validate(['signature_data' => ['required', 'string', 'max:2000000']]);
        $actor = $request->attributes->get('tenant_user');
        $row = $this->assignedWorkOrder($request, $workOrder);
        if ($row->status !== 'IN_PROGRESS') throw new ApiException('SIGNATURE_STATUS_INVALID', 'Signature can only be captured while the work order is in progress.', 409);
        $id = (string) Str::ulid();
        DB::table('work_order_signatures')->insert([
            'id' => $id, 'work_order_id' => $row->id, 'signed_by' => $actor->id,
            'signature_data' => $data['signature_data'], 'signed_at' => now(), 'created_at' => now(),
        ]);
        return ApiData::item(DB::table('work_order_signatures')->where('id', $id)->first(), 201);
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

    /** Record a scanned spare part against an in-progress assigned work order. */
    public function usePart(Request $request, string $workOrder): mixed
    {
        $data = $request->validate([
            'barcode' => ['required', 'string', 'max:128'],
            'warehouse_id' => ['required', 'ulid', Rule::exists('warehouses', 'id')],
            'quantity' => ['required', 'integer', 'min:1'],
        ]);
        $actor = $request->attributes->get('tenant_user');
        $row = $this->assignedWorkOrder($request, $workOrder);
        if ($row->status !== 'IN_PROGRESS') {
            throw new ApiException('WORK_ORDER_PART_USAGE_INVALID', 'Spare parts can only be recorded while the work order is in progress.', 409);
        }

        DB::transaction(function () use ($data, $actor, $row): void {
            $lockedWorkOrder = DB::table('work_orders')->where('id', $row->id)->lockForUpdate()->first()
                ?? throw new ApiException('WORK_ORDER_NOT_FOUND', 'Work order was not found.', 404);
            if ($lockedWorkOrder->status !== 'IN_PROGRESS') {
                throw new ApiException('WORK_ORDER_PART_USAGE_INVALID', 'Spare parts can only be recorded while the work order is in progress.', 409);
            }
            $asset = DB::table('assets')->where('id', $lockedWorkOrder->asset_id)->first()
                ?? throw new ApiException('ASSET_NOT_FOUND', 'The work order asset was not found.', 404);
            $part = $this->scope->spareParts($actor)->where('barcode', $data['barcode'])->where('is_active', true)->lockForUpdate()->first()
                ?? throw new ApiException('SPARE_PART_NOT_FOUND', 'No active spare part matches the scanned barcode in your permitted site.', 404);
            if ($part->site_id !== $asset->site_id) {
                throw new ApiException('SPARE_PART_SITE_MISMATCH', 'The scanned spare part must belong to the work order asset site.', 422);
            }
            $warehouse = $this->scope->warehouse($actor, $data['warehouse_id']);
            if ($warehouse->site_id !== $asset->site_id) {
                throw new ApiException('WAREHOUSE_SITE_MISMATCH', 'The warehouse must belong to the work order asset site.', 422);
            }
            $stock = DB::table('spare_part_stocks')->where('spare_part_id', $part->id)->where('warehouse_id', $warehouse->id)->lockForUpdate()->first();
            if (! $stock || $stock->quantity < $data['quantity']) {
                throw new ApiException('INSUFFICIENT_STOCK', 'Insufficient stock for the scanned spare part.', 422);
            }
            DB::table('spare_part_stocks')->where('id', $stock->id)->update(['quantity' => $stock->quantity - $data['quantity'], 'updated_at' => now()]);
            DB::table('spare_part_stock_movements')->insert([
                'id' => (string) Str::ulid(), 'spare_part_id' => $part->id, 'warehouse_id' => $warehouse->id,
                'type' => 'OUT', 'quantity' => $data['quantity'], 'reason' => 'Work order part usage',
                'reference_type' => 'WORK_ORDER', 'reference_id' => $lockedWorkOrder->id, 'created_by' => $actor->id,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        });
        $this->audit->tenant($request, 'work_order.part_used', 'WORK_ORDER', $row->id, null, ['barcode' => $data['barcode'], 'warehouse_id' => $data['warehouse_id'], 'quantity' => $data['quantity']]);

        return $this->show($request, $row->id);
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
