<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Tenant;
use Database\Seeders\TenantDatabaseSeeder;
use Illuminate\Console\Command;

class SeedCmmsTenants extends Command
{
    protected $signature = 'cmms:tenant:seed {--tenant=* : Tenant ULID(s); omit to seed all tenants}';

    protected $description = 'Idempotently seed one or all CMMS tenant databases';

    public function handle(): int
    {
        $tenantIds = array_filter($this->option('tenant'));
        $query = Tenant::query();
        if ($tenantIds !== []) {
            $query->whereIn('id', $tenantIds);
        }

        $tenants = $query->get();
        if ($tenants->isEmpty()) {
            $this->components->warn('No matching tenant found.');

            return self::SUCCESS;
        }

        foreach ($tenants as $tenant) {
            $tenant->run(fn () => app(TenantDatabaseSeeder::class)->run());
            $this->components->info("Seeded {$tenant->id} ({$tenant->database()->getName()}).");
        }

        return self::SUCCESS;
    }
}
