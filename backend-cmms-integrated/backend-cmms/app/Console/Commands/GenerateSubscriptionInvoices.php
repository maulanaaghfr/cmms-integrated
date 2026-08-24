<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\CmmsNumber;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GenerateSubscriptionInvoices extends Command
{
    protected $signature = 'cmms:billing:generate-invoices {--tenant=* : Tenant ULIDs; omit to process all current subscriptions}';

    protected $description = 'Idempotently generate subscription invoices for current billing periods';

    public function handle(): int
    {
        $tenantIds = array_filter($this->option('tenant'));
        $query = DB::table('subscriptions')->join('tenants', 'tenants.id', '=', 'subscriptions.tenant_id')
            ->whereIn('subscriptions.status', ['TRIAL', 'ACTIVE', 'GRACE'])
            ->select('subscriptions.*', 'tenants.name as tenant_name', 'tenants.email as tenant_email');
        if ($tenantIds !== []) {
            $query->whereIn('subscriptions.tenant_id', $tenantIds);
        }
        $created = 0;
        foreach ($query->get() as $subscription) {
            $start = $subscription->current_period_start ?: $subscription->starts_at;
            $end = $subscription->current_period_end ?: ($subscription->billing_period === 'YEARLY' ? now()->addYear() : now()->addMonth());
            if (DB::table('invoices')->where('subscription_id', $subscription->id)->where('billing_period_start', $start)->where('billing_period_end', $end)->exists()) {
                continue;
            }
            DB::transaction(function () use ($subscription, $start, $end): void {
                $invoiceId = (string) Str::ulid();
                DB::table('invoices')->insert([
                    'id' => $invoiceId, 'tenant_id' => $subscription->tenant_id, 'subscription_id' => $subscription->id,
                    'invoice_number' => CmmsNumber::make('INV'), 'status' => 'ISSUED', 'billing_period_start' => $start,
                    'billing_period_end' => $end, 'issued_at' => now(), 'due_at' => now()->addDays(7), 'paid_at' => null,
                    'currency_code' => $subscription->currency_code, 'subtotal' => $subscription->price_snapshot,
                    'tax_amount' => 0, 'total_amount' => $subscription->price_snapshot, 'amount_paid' => 0,
                    'customer_name_snapshot' => $subscription->tenant_name, 'customer_email_snapshot' => $subscription->tenant_email,
                    'customer_tax_id_snapshot' => null, 'billing_address_snapshot' => null, 'notes' => null,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
                DB::table('invoice_lines')->insert([
                    'id' => (string) Str::ulid(), 'invoice_id' => $invoiceId, 'line_type' => 'SUBSCRIPTION',
                    'description' => 'CMMS subscription '.$subscription->billing_period, 'quantity' => 1,
                    'unit_price' => $subscription->price_snapshot, 'tax_amount' => 0, 'line_total' => $subscription->price_snapshot,
                    'metadata' => json_encode(['plan_id' => $subscription->plan_id]), 'sort_order' => 1, 'created_at' => now(),
                ]);
            });
            $created++;
        }
        $this->components->info("Generated {$created} invoice(s).");

        return self::SUCCESS;
    }
}
