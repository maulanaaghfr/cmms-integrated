<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class NotificationService
{
    public function send(array|string|null $recipients, string $event, ?string $entityType, ?string $entityId, string $title, string $message, array $payload = []): void
    {
        foreach (array_unique(array_filter((array) $recipients)) as $recipient) {
            DB::table('notifications')->insert([
                'id' => (string) Str::ulid(), 'tenant_user_id' => $recipient, 'event_type' => $event,
                'entity_type' => $entityType, 'entity_id' => $entityId, 'title' => $title, 'message' => $message,
                'payload' => $payload === [] ? null : json_encode($payload), 'read_at' => null, 'created_at' => now(),
            ]);
        }
    }

    public function supervisorsForAsset(object $asset): array
    {
        return DB::table('tenant_users')->where('status', 'ACTIVE')->whereIn('role_key', ['COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR'])
            ->where(fn ($q) => $q->where('role_key', 'COMPANY_ADMIN')->orWhere('primary_site_id', $asset->site_id))->pluck('id')->all();
    }

    public function maintenanceManagersForAsset(object $asset): array
    {
        return DB::table('tenant_users')
            ->where('status', 'ACTIVE')
            ->where('role_key', 'MANAGER')
            ->where('primary_site_id', $asset->site_id)
            ->pluck('id')
            ->all();
    }
}
