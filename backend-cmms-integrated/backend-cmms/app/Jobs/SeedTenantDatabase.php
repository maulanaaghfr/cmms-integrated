<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\Tenant;
use Database\Seeders\TenantDatabaseSeeder;
use Stancl\Tenancy\Contracts\TenantWithDatabase;
use Stancl\Tenancy\Events\DatabaseSeeded;
use Stancl\Tenancy\Events\SeedingDatabase;

class SeedTenantDatabase
{
    public function __construct(private readonly TenantWithDatabase $tenant) {}

    public function handle(): void
    {
        event(new SeedingDatabase($this->tenant));

        $this->tenant->run(function (): void {
            app(TenantDatabaseSeeder::class)->run();
        });

        if ($this->tenant instanceof Tenant) {
            $this->tenant->forceFill([
                'database_status' => 'READY',
                'provisioned_at' => now(),
            ])->saveQuietly();
        }

        event(new DatabaseSeeded($this->tenant));
    }
}
