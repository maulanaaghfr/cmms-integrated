<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Stancl\Tenancy\Commands\Seed;
use Symfony\Component\Console\Attribute\AsCommand;

/** Laravel 13-compatible registration of Stancl's tenant seeder command. */
#[AsCommand(name: 'tenants:seed')]
class TenantSeedCommand extends Seed
{
    protected $signature = 'tenants:seed
        {class? : The tenant root seeder class}
        {--class=Database\\Seeders\\TenantDatabaseSeeder : The tenant root seeder class}
        {--database= : The database connection to seed}
        {--force : Force the operation to run in production}
        {--tenants=* : Tenant ULIDs; omit to seed all tenants}';
}
