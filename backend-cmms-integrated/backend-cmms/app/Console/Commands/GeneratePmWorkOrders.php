<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Services\PmService;
use Illuminate\Console\Command;

class GeneratePmWorkOrders extends Command
{
    protected $signature = 'cmms:pm:generate {--tenant=* : Tenant ULIDs; omit to process all ready tenants}';

    protected $description = 'Idempotently generate due PM occurrences and work orders';

    public function handle(PmService $service): int
    {
        $ids = array_filter($this->option('tenant'));
        $query = Tenant::query()->where('database_status', 'READY');
        if ($ids !== []) {
            $query->whereIn('id', $ids);
        }
        $total = 0;
        foreach ($query->cursor() as $tenant) {
            $count = $tenant->run(fn () => $service->generateDue());
            $total += $count;
            $this->line("{$tenant->code}: {$count} generated");
        }
        $this->components->info("Generated {$total} PM work order(s).");

        return self::SUCCESS;
    }
}
