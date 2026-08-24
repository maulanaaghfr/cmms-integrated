<?php

declare(strict_types=1);

namespace App\Models;

use Stancl\Tenancy\Contracts\TenantWithDatabase;
use Stancl\Tenancy\Database\Concerns\HasDatabase;
use Stancl\Tenancy\Database\Concerns\HasDomains;
use Stancl\Tenancy\Database\Models\Tenant as BaseTenant;

class Tenant extends BaseTenant implements TenantWithDatabase
{
    use HasDatabase, HasDomains;

    protected static function booted(): void
    {
        static::creating(function (Tenant $tenant): void {
            if (! $tenant->database_name) {
                $tenant->database_name = config('tenancy.database.prefix')
                    .$tenant->getTenantKey()
                    .config('tenancy.database.suffix');
            }
        });
    }

    public static function getCustomColumns(): array
    {
        return [
            'id',
            'code',
            'name',
            'slug',
            'email',
            'phone',
            'industry',
            'timezone',
            'status',
            'database_name',
            'database_status',
            'settings',
            'provisioned_at',
            'created_by',
            'lock_version',
            'archived_at',
            'created_at',
            'updated_at',
        ];
    }

    protected function casts(): array
    {
        return [
            'settings' => 'array',
            'data' => 'array',
            'provisioned_at' => 'datetime',
            'archived_at' => 'datetime',
        ];
    }
}
