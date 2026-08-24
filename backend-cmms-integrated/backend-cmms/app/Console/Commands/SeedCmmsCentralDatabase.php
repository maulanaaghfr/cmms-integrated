<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Database\Seeders\DatabaseSeeder;
use Illuminate\Console\Command;

class SeedCmmsCentralDatabase extends Command
{
    protected $signature = 'cmms:seed-central';

    protected $description = 'Seed the CMMS central database reference and product catalogs';

    public function handle(): int
    {
        app(DatabaseSeeder::class)->run();
        $this->components->info('Central CMMS reference data seeded.');

        return self::SUCCESS;
    }
}
