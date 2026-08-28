<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\TenantScope;
use App\Support\ApiData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SupportController extends Controller
{
    public function __construct(private readonly TenantScope $scope) {}

    public function uploadAttachment(Request $request): mixed
    {
        $this->ensureCanWrite($request);
        $data = $request->validate([
            'entity_type' => ['required', Rule::in(['REQUEST', 'WORK_ORDER'])], 'entity_id' => ['required', 'ulid'],
            'media_role' => ['required', Rule::in(['REQUEST', 'BEFORE', 'AFTER', 'OTHER'])],
            'file' => ['required', 'file', 'mimetypes:image/jpeg,image/png,image/webp,video/mp4,video/quicktime', 'max:51200'],
        ]);
        $this->authorizeEntity($request, $data['entity_type'], $data['entity_id']);
        $file = $request->file('file');
        $id = (string) Str::ulid();
        $extension = $file->guessExtension() ?: 'bin';
        $path = $file->storeAs('attachments/'.strtolower($data['entity_type']).'/'.$data['entity_id'], $id.'.'.$extension, 'local');
        try {
            DB::table('attachments')->insert([
                'id' => $id, 'entity_type' => $data['entity_type'], 'entity_id' => $data['entity_id'], 'media_role' => $data['media_role'],
                'storage_disk' => 'local', 'storage_path' => $path, 'original_filename' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType(), 'size_bytes' => $file->getSize(), 'checksum_sha256' => hash_file('sha256', $file->getRealPath()),
                'uploaded_by' => $request->attributes->get('tenant_user')->id, 'created_at' => now(), 'deleted_at' => null,
            ]);
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($path);
            throw $exception;
        }

        return ApiData::item(DB::table('attachments')->where('id', $id)->first(), 201);
    }

    public function downloadAttachment(Request $request, string $attachment): mixed
    {
        $row = DB::table('attachments')->where('id', $attachment)->whereNull('deleted_at')->first();
        if (! $row) {
            throw new ApiException('ATTACHMENT_NOT_FOUND', 'Attachment was not found.', 404);
        }
        $this->authorizeEntity($request, $row->entity_type, $row->entity_id);
        if (! Storage::disk($row->storage_disk)->exists($row->storage_path)) {
            throw new ApiException('ATTACHMENT_FILE_MISSING', 'Attachment file is missing from storage.', 404);
        }

        return Storage::disk($row->storage_disk)->download($row->storage_path, $row->original_filename, ['Content-Type' => $row->mime_type]);
    }

    public function deleteAttachment(Request $request, string $attachment): mixed
    {
        $this->ensureCanWrite($request);
        $row = DB::table('attachments')->where('id', $attachment)->whereNull('deleted_at')->first();
        if (! $row) {
            throw new ApiException('ATTACHMENT_NOT_FOUND', 'Attachment was not found.', 404);
        }
        $this->authorizeEntity($request, $row->entity_type, $row->entity_id);
        if ($row->uploaded_by !== $request->attributes->get('tenant_user')->id && ! in_array($request->attributes->get('tenant_user')->role_key, ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR'], true)) {
            throw new ApiException('ATTACHMENT_DELETE_FORBIDDEN', 'You cannot delete this attachment.', 403);
        }
        DB::table('attachments')->where('id', $attachment)->update(['deleted_at' => now()]);

        return response()->json(null, 204);
    }

    public function comments(Request $request): mixed
    {
        $this->ensureCanWrite($request);
        $data = $request->validate(['entity_type' => ['required', Rule::in(['REQUEST', 'WORK_ORDER'])], 'entity_id' => ['required', 'ulid'], 'body' => ['required', 'string', 'max:5000']]);
        $this->authorizeEntity($request, $data['entity_type'], $data['entity_id']);
        $id = (string) Str::ulid();
        DB::table('comments')->insert(['id' => $id, ...$data, 'author_id' => $request->attributes->get('tenant_user')->id, 'created_at' => now(), 'updated_at' => now(), 'deleted_at' => null]);

        return ApiData::item(DB::table('comments')->where('id', $id)->first(), 201);
    }

    public function notifications(Request $request): mixed
    {
        return ApiData::paginated(DB::table('notifications')->where('tenant_user_id', $request->attributes->get('tenant_user')->id)
            ->when($request->boolean('unread_only'), fn ($q) => $q->whereNull('read_at'))->orderByDesc('created_at')->paginate($request->integer('per_page', 20)));
    }

    public function readNotification(Request $request, string $notification): mixed
    {
        $affected = DB::table('notifications')->where('id', $notification)->where('tenant_user_id', $request->attributes->get('tenant_user')->id)->update(['read_at' => now()]);
        if (! $affected) {
            throw new ApiException('NOTIFICATION_NOT_FOUND', 'Notification was not found.', 404);
        }

        return ApiData::item(DB::table('notifications')->where('id', $notification)->first());
    }

    public function readAllNotifications(Request $request): mixed
    {
        $count = DB::table('notifications')->where('tenant_user_id', $request->attributes->get('tenant_user')->id)->whereNull('read_at')->update(['read_at' => now()]);

        return ApiData::item(['marked_read' => $count]);
    }

    public function dashboard(Request $request): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $assets = $this->scope->assets($actor);
        $workOrders = $this->scope->workOrders($actor);

        return ApiData::item([
            'assets' => ['total' => (clone $assets)->whereNull('archived_at')->count(), 'by_status' => (clone $assets)->whereNull('archived_at')->select('status', DB::raw('count(*) as total'))->groupBy('status')->pluck('total', 'status')],
            'work_orders' => [
                'active' => (clone $workOrders)->whereIn('status', ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'])->count(),
                'overdue' => (clone $workOrders)->whereNotIn('status', ['CLOSED', 'CANCELLED'])->where('due_at', '<', now())->count(),
                'waiting_verification' => (clone $workOrders)->where('status', 'COMPLETED')->count(),
                'closed_this_month' => (clone $workOrders)->where('status', 'CLOSED')->where('closed_at', '>=', now()->startOfMonth())->count(),
                'latest' => (clone $workOrders)->orderByDesc('created_at')->limit(10)->get(),
            ],
            'pending_request_approvals' => $this->scope->maintenanceRequests($actor)->where('status', 'PENDING_APPROVAL')->count(),
            'pending_work_order_approvals' => (clone $workOrders)->where('status', 'PENDING_APPROVAL')->count(),
        ]);
    }


        public function insights(Request $request): mixed
    {
        $actor = $request->attributes->get('tenant_user');
        $since = now()->subDays($request->integer('window_days', 90));

        $rows = DB::table('work_orders')
            ->join('assets', 'assets.id', '=', 'work_orders.asset_id')
            ->where('work_orders.created_at', '>=', $since)
            ->select(
                'work_orders.id', 'work_orders.asset_id', 'work_orders.status', 'work_orders.priority',
                'work_orders.reported_at', 'work_orders.work_started_at', 'work_orders.completed_at', 'work_orders.due_at',
                'assets.name as asset_name', 'assets.code as asset_code', 'assets.criticality',
            )
            ->get();

        $byAsset = $rows->groupBy('asset_id');

        $topFailing = $byAsset->map(function ($group, $assetId) {
            $completed = $group->filter(fn ($r) => $r->completed_at);
            $mttrHours = $completed->isEmpty() ? null : round($completed->avg(
                fn ($r) => \Carbon\Carbon::parse($r->reported_at)->diffInMinutes(\Carbon\Carbon::parse($r->completed_at)) / 60
            ), 1);

            return [
                'asset_id' => $assetId,
                'asset_name' => $group->first()->asset_name,
                'asset_code' => $group->first()->asset_code,
                'criticality' => $group->first()->criticality,
                'work_order_count' => $group->count(),
                'avg_repair_hours' => $mttrHours,
                'overdue_count' => $group->filter(fn ($r) => $r->due_at && \Carbon\Carbon::parse($r->due_at)->isPast() && ! in_array($r->status, ['CLOSED', 'CANCELLED'], true))->count(),
            ];
        })->sortByDesc('work_order_count')->values()->take(10);

        $overdueOpen = $rows->filter(fn ($r) => $r->due_at && \Carbon\Carbon::parse($r->due_at)->isPast() && ! in_array($r->status, ['CLOSED', 'CANCELLED'], true))->count();
        $completed = $rows->filter(fn ($r) => $r->completed_at);
        $fleetMttrHours = $completed->isEmpty() ? null : round($completed->avg(
            fn ($r) => \Carbon\Carbon::parse($r->reported_at)->diffInMinutes(\Carbon\Carbon::parse($r->completed_at)) / 60
        ), 1);

        return ApiData::item([
            'window_days' => $request->integer('window_days', 90),
            'generated_at' => now(),
            'method' => 'rule_based',
            'summary' => [
                'total_work_orders' => $rows->count(),
                'overdue_open_work_orders' => $overdueOpen,
                'fleet_avg_repair_hours' => $fleetMttrHours,
                'assets_with_activity' => $byAsset->count(),
            ],
            'top_problem_assets' => $topFailing,
        ]);
    }



    private function authorizeEntity(Request $request, string $type, string $id): void
    {
        if ($type === 'WORK_ORDER') {
            $this->scope->workOrder($request->attributes->get('tenant_user'), $id);

            return;
        }
        $this->scope->maintenanceRequest($request->attributes->get('tenant_user'), $id);
    }

    private function ensureCanWrite(Request $request): void
    {
        if ($request->attributes->get('tenant_user')?->role_key === 'VIEWER') {
            throw new ApiException('READ_ONLY_ROLE', 'Viewer accounts have read-only access.', 403);
        }
    }
}
