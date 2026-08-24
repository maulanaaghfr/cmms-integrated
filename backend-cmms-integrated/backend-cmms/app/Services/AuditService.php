<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AuditService
{
    public function platform(Request $request, string $action, string $entityType, ?string $entityId, mixed $before = null, mixed $after = null, ?string $tenantId = null): void
    {
        DB::connection(config('tenancy.database.central_connection'))->table('platform_audit_logs')->insert([
            'id' => (string) Str::ulid(),
            'actor_user_id' => $request->user()?->id,
            'tenant_id' => $tenantId,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'before_values' => $before === null ? null : json_encode($before),
            'after_values' => $after === null ? null : json_encode($after),
            'context' => null,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'occurred_at' => now(),
        ]);
    }

    public function tenant(Request $request, string $action, string $entityType, ?string $entityId, mixed $before = null, mixed $after = null): void
    {
        DB::table('audit_logs')->insert([
            'id' => (string) Str::ulid(),
            'actor_id' => $request->attributes->get('tenant_user')?->id,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'before_values' => $before === null ? null : json_encode($before),
            'after_values' => $after === null ? null : json_encode($after),
            'context' => null,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'occurred_at' => now(),
        ]);
    }
}
