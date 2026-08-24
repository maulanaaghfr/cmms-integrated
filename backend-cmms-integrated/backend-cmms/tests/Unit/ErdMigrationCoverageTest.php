<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class ErdMigrationCoverageTest extends TestCase
{
    public function test_all_erd_domain_tables_have_matching_migrations(): void
    {
        $root = dirname(__DIR__, 2);
        $dbml = file_get_contents(dirname($root).'/cmms-aitoma/docs/erd_new.dbml');

        preg_match_all('/^Table central\.([a-z_]+) \{/m', $dbml, $centralMatches);
        preg_match_all('/^Table tenant\.([a-z_]+) \{/m', $dbml, $tenantMatches);

        $centralMigrations = $this->createdTables(glob($root.'/database/migrations/*.php'));
        $tenantMigrations = $this->createdTables(glob($root.'/database/migrations/tenant/*.php'));

        $centralDomainTables = array_values(array_intersect($centralMigrations, $centralMatches[1]));
        sort($centralDomainTables);
        sort($centralMatches[1]);
        sort($tenantMigrations);
        sort($tenantMatches[1]);

        $this->assertSame($centralMatches[1], $centralDomainTables);
        $this->assertSame($tenantMatches[1], $tenantMigrations);
        $this->assertCount(16, $centralDomainTables);
        $this->assertCount(22, $tenantMigrations);
    }

    /** @param list<string> $files
     * @return list<string>
     */
    private function createdTables(array $files): array
    {
        $tables = [];
        foreach ($files as $file) {
            preg_match_all("/Schema::create\('([a-z_]+)'/", file_get_contents($file), $matches);
            array_push($tables, ...$matches[1]);
        }

        return array_values(array_unique($tables));
    }
}
