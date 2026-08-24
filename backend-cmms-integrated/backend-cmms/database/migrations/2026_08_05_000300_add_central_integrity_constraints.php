<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        foreach ($this->checks() as $name => [$table, $expression]) {
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK ({$expression})");
        }

        DB::statement('CREATE UNIQUE INDEX domains_one_primary_per_tenant ON domains (tenant_id) WHERE is_primary = true');
        DB::statement("CREATE UNIQUE INDEX subscriptions_one_current_per_tenant ON subscriptions (tenant_id) WHERE status IN ('TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED')");
        DB::statement("CREATE UNIQUE INDEX payments_one_paid_per_invoice ON payments (invoice_id) WHERE status = 'PAID'");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS payments_one_paid_per_invoice');
        DB::statement('DROP INDEX IF EXISTS subscriptions_one_current_per_tenant');
        DB::statement('DROP INDEX IF EXISTS domains_one_primary_per_tenant');

        foreach (array_reverse($this->checks(), true) as $name => [$table]) {
            DB::statement("ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$name}");
        }
    }

    /** @return array<string, array{string, string}> */
    private function checks(): array
    {
        return [
            'users_status_check' => ['users', "status IN ('INVITED', 'ACTIVE', 'LOCKED', 'DISABLED')"],
            'users_platform_role_check' => ['users', "platform_role IS NULL OR platform_role = 'SUPER_ADMIN'"],
            'tenants_status_check' => ['tenants', "status IN ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CLOSED')"],
            'tenants_database_status_check' => ['tenants', "database_status IN ('PENDING', 'PROVISIONING', 'READY', 'FAILED', 'ARCHIVED')"],
            'tenant_memberships_role_check' => ['tenant_memberships', "role_key IN ('COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR', 'TECHNICIAN', 'OPERATOR', 'VIEWER')"],
            'tenant_memberships_status_check' => ['tenant_memberships', "status IN ('INVITED', 'ACTIVE', 'INACTIVE')"],
            'features_type_check' => ['features', "feature_type IN ('BOOLEAN', 'LIMIT')"],
            'plans_status_check' => ['plans', "status IN ('DRAFT', 'PUBLISHED', 'RETIRED')"],
            'plans_price_check' => ['plans', 'monthly_price >= 0 AND (annual_price IS NULL OR annual_price >= 0)'],
            'plans_effective_period_check' => ['plans', 'effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from'],
            'plan_features_limit_check' => ['plan_features', 'numeric_limit IS NULL OR numeric_limit >= 0'],
            'subscriptions_status_check' => ['subscriptions', "status IN ('TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')"],
            'subscriptions_period_check' => ['subscriptions', "billing_period IN ('MONTHLY', 'YEARLY')"],
            'subscriptions_price_check' => ['subscriptions', 'price_snapshot >= 0'],
            'payment_provider_configs_environment_check' => ['payment_provider_configs', "environment IN ('SANDBOX', 'PRODUCTION')"],
            'payment_channels_type_check' => ['payment_channels', "channel_type IN ('VIRTUAL_ACCOUNT', 'EWALLET', 'QRIS', 'RETAIL', 'CARD', 'OTHER')"],
            'payment_channels_amount_check' => ['payment_channels', 'minimum_amount IS NULL OR maximum_amount IS NULL OR maximum_amount >= minimum_amount'],
            'invoices_status_check' => ['invoices', "status IN ('DRAFT', 'ISSUED', 'PENDING', 'PAID', 'VOID', 'OVERDUE', 'FAILED')"],
            'invoices_amount_check' => ['invoices', 'subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0 AND amount_paid >= 0 AND amount_paid <= total_amount'],
            'invoices_period_check' => ['invoices', 'billing_period_end > billing_period_start'],
            'invoice_lines_type_check' => ['invoice_lines', "line_type IN ('SUBSCRIPTION', 'ADD_ON', 'OVERAGE', 'DISCOUNT', 'OTHER')"],
            'invoice_lines_amount_check' => ['invoice_lines', 'quantity > 0 AND tax_amount >= 0'],
            'payments_status_check' => ['payments', "status IN ('CREATED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED')"],
            'payments_amount_check' => ['payments', 'amount > 0 AND provider_fee >= 0'],
            'payment_events_type_check' => ['payment_events', "event_type IN ('CALLBACK', 'STATUS_CHECK', 'MANUAL_CONFIRMATION')"],
            'payment_events_processing_status_check' => ['payment_events', "processing_status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')"],
        ];
    }
};
