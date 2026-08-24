<?php

namespace Tests\Feature;

use App\Models\Tenant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class PostgresTenantIsolationTest extends TestCase
{
    /** @var list<Tenant> */
    private array $createdTenants = [];

    protected function tearDown(): void
    {
        tenancy()->end();

        foreach (array_reverse($this->createdTenants) as $tenant) {
            $tenant->delete();
        }

        parent::tearDown();
    }

    public function test_two_clients_use_different_databases_with_independent_data(): void
    {
        if (! filter_var(env('RUN_TENANCY_INTEGRATION', false), FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set RUN_TENANCY_INTEGRATION=true against the migrated PostgreSQL central database.');
        }

        $suffix = Str::lower(Str::random(8));
        $first = $this->createTenant('TEST_A_'.$suffix, 'test-a-'.$suffix.'.localhost');
        $second = $this->createTenant('TEST_B_'.$suffix, 'test-b-'.$suffix.'.localhost');

        $this->assertNotSame($first->database()->getName(), $second->database()->getName());

        foreach ([$first, $second] as $tenant) {
            $tenant->run(function (): void {
                DB::table('sites')->insert([
                    'id' => (string) Str::ulid(),
                    'code' => 'SHARED-CODE',
                    'name' => 'Independent Site',
                    'timezone' => 'Asia/Jakarta',
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $this->assertSame(1, DB::table('sites')->where('code', 'SHARED-CODE')->count());
                $this->assertSame(4, DB::table('asset_categories')->count());
            });
        }
    }

    private function createTenant(string $code, string $domain): Tenant
    {
        $tenant = Tenant::create([
            'code' => Str::upper($code),
            'name' => $code,
            'slug' => Str::slug($code),
            'email' => Str::lower($code).'@example.test',
            'timezone' => 'Asia/Jakarta',
            'status' => 'TRIAL',
            'database_status' => 'PROVISIONING',
        ]);
        $tenant->domains()->create(['domain' => $domain, 'is_primary' => true]);
        $this->createdTenants[] = $tenant;

        return $tenant;
    }
}
