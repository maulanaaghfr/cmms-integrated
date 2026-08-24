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
