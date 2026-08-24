<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use App\Support\CmmsNumber;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class WorkOrderService
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function create(object $asset, object $actor, array $data, string $source = 'DIRECT', ?string $requestId = null, ?string $occurrenceId = null): object
    {
        $id = (string) Str::ulid();
        $requiresApproval = $source === 'DIRECT';
        $status = $requiresApproval
            ? 'PENDING_APPROVAL'
            : (! empty($data['assignee_id']) || ! empty($data['team_id']) ? 'ASSIGNED' : 'OPEN');
        DB::table('work_orders')->insert([
            'id' => $id, 'work_order_number' => CmmsNumber::make('WO'), 'source' => $source,
            'maintenance_request_id' => $requestId, 'pm_occurrence_id' => $occurrenceId,
            'site_id' => $asset->site_id, 'location_id' => $asset->location_id, 'asset_id' => $asset->id,
            'title' => $data['title'], 'description' => $data['description'] ?? null, 'priority' => $data['priority'] ?? 'MEDIUM',
            'status' => $status, 'requester_id' => array_key_exists('requester_id', $data) ? $data['requester_id'] : $actor->id, 'created_by' => $actor->id,
            'current_team_id' => $requiresApproval ? null : ($data['team_id'] ?? null), 'current_assignee_id' => $requiresApproval ? null : ($data['assignee_id'] ?? null),
            'is_claimable' => false, 'approval_required' => $requiresApproval, 'approved_at' => null, 'approved_by' => null,
            'rejected_at' => null, 'rejected_by' => null, 'rejection_reason' => null,
            'reported_at' => now(), 'due_at' => $data['due_at'] ?? null,
            'acknowledged_at' => null, 'work_started_at' => null, 'completed_at' => null, 'completed_by' => null,
            'completion_note' => null, 'verified_at' => null, 'verified_by' => null, 'closed_at' => null, 'closed_by' => null,
            'cancelled_at' => null, 'cancelled_by' => null, 'cancellation_reason' => null, 'lock_version' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->history($id, null, $requiresApproval ? 'PENDING_APPROVAL' : 'OPEN', $actor->id);
        if (! $requiresApproval && $status === 'ASSIGNED') {
            $this->history($id, 'OPEN', 'ASSIGNED', $actor->id);
            $this->assignment($id, 'ASSIGN', $data['team_id'] ?? null, $data['assignee_id'] ?? null, $actor->id);
            $this->notifications->send($data['assignee_id'] ?? null, 'work_order.assigned', 'WORK_ORDER', $id, 'Work order assigned', $data['title']);
        }

        return DB::table('work_orders')->where('id', $id)->first();
    }

    public function transition(object $workOrder, string $to, object $actor, ?string $note = null, ?string $reason = null, array $changes = []): object
    {
        $allowed = [
            'PENDING_APPROVAL' => ['OPEN', 'REJECTED', 'CANCELLED'],
            'OPEN' => ['ASSIGNED', 'CANCELLED'], 'ASSIGNED' => ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
            'IN_PROGRESS' => ['ON_HOLD', 'COMPLETED', 'CANCELLED'], 'ON_HOLD' => ['IN_PROGRESS', 'CANCELLED'],
            'COMPLETED' => ['VERIFIED', 'IN_PROGRESS'], 'VERIFIED' => ['CLOSED'], 'CLOSED' => [], 'REJECTED' => [], 'CANCELLED' => [],
        ];
        if (! in_array($to, $allowed[$workOrder->status] ?? [], true)) {
            throw new ApiException('INVALID_WORK_ORDER_TRANSITION', "Cannot transition from {$workOrder->status} to {$to}.", 409);
        }
        DB::table('work_orders')->where('id', $workOrder->id)->update([
            'status' => $to, ...$changes, 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now(),
        ]);
        $this->history($workOrder->id, $workOrder->status, $to, $actor->id, $note, $reason);

        return DB::table('work_orders')->where('id', $workOrder->id)->first();
    }

    public function history(string $workOrderId, ?string $from, string $to, string $actorId, ?string $note = null, ?string $reason = null): void
    {
        DB::table('work_order_status_histories')->insert([
            'id' => (string) Str::ulid(), 'work_order_id' => $workOrderId, 'from_status' => $from, 'to_status' => $to,
            'actor_id' => $actorId, 'reason_code' => $reason, 'note' => $note, 'occurred_at' => now(),
        ]);
    }

    public function assignment(string $workOrderId, string $action, ?string $teamId, ?string $technicianId, string $actorId): string
    {
        DB::table('work_order_assignments')->where('work_order_id', $workOrderId)->where('is_current', true)->update(['is_current' => false, 'released_at' => now(), 'released_by' => $actorId]);
        $id = (string) Str::ulid();
        DB::table('work_order_assignments')->insert([
            'id' => $id, 'work_order_id' => $workOrderId, 'action' => $action, 'team_id' => $teamId,
            'technician_id' => $technicianId, 'assigned_by' => $actorId, 'assigned_at' => now(),
            'released_at' => null, 'released_by' => null, 'release_reason' => null, 'is_current' => true, 'created_at' => now(),
        ]);

        return $id;
    }
}
