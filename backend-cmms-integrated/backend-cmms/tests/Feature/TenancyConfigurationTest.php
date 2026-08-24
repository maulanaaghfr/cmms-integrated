<?php

namespace Tests\Feature;

use App\Models\CentralPersonalAccessToken;
use App\Models\Tenant;
use App\Tenancy\UlidTenantIdGenerator;
use Database\Seeders\TenantDatabaseSeeder;
use Stancl\Tenancy\TenantDatabaseManagers\PostgreSQLDatabaseManager;
use Tests\TestCase;

class TenancyConfigurationTest extends TestCase
{
    public function test_database_per_tenant_configuration_is_enabled(): void
    {
        $this->assertSame(Tenant::class, config('tenancy.tenant_model'));
        $this->assertSame(UlidTenantIdGenerator::class, config('tenancy.id_generator'));
        $this->assertSame(
            PostgreSQLDatabaseManager::class,
            config('tenancy.database.managers.pgsql')
        );
        $this->assertSame('aitoma_tenant_', config('tenancy.database.prefix'));
        $this->assertSame(
            TenantDatabaseSeeder::class,
            config('tenancy.seeder_parameters.--class')
        );
    }

    public function test_sanctum_tokens_use_the_central_personal_access_tokens_table(): void
    {
        $token = new CentralPersonalAccessToken;

        $this->assertSame('personal_access_tokens', $token->getTable());
        $this->assertSame(config('tenancy.database.central_connection'), $token->getConnectionName());
    }
}
