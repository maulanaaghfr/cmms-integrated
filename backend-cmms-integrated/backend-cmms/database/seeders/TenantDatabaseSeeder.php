<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TenantDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        foreach ([
            'ROTATING_EQUIPMENT' => 'Rotating Equipment',
            'PRODUCTION_EQUIPMENT' => 'Production Equipment',
            'UTILITY_EQUIPMENT' => 'Utility Equipment',
            'GENERAL' => 'General',
        ] as $code => $name) {
            $id = DB::table('asset_categories')->where('code', $code)->value('id') ?: (string) Str::ulid();
            DB::table('asset_categories')->updateOrInsert(['code' => $code], [
                'id' => $id,
                'name' => $name,
                'description' => "Default MVP category: {$name}",
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
}
