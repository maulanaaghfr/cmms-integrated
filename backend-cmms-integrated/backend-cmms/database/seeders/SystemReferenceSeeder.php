<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SystemReferenceSeeder extends Seeder
{
    public function run(): void
    {
        $id = DB::table('payment_providers')->where('key', 'DUITKU')->value('id') ?: (string) Str::ulid();

        DB::table('payment_providers')->updateOrInsert(['key' => 'DUITKU'], [
            'id' => $id,
            'name' => 'Duitku',
            'supports_redirect' => true,
            'supports_webhook' => true,
            'supports_status_check' => true,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
