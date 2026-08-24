<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_providers', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('key', 40)->unique();
            $table->string('name', 100);
            $table->boolean('supports_redirect')->default(true);
            $table->boolean('supports_webhook')->default(true);
            $table->boolean('supports_status_check')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
        });

        Schema::create('payment_provider_configs', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('payment_provider_id')->constrained('payment_providers')->restrictOnDelete();
            $table->string('environment', 16);
            $table->string('merchant_identifier')->nullable();
            $table->string('secret_reference', 512);
            $table->string('callback_base_url', 1024);
            $table->string('return_base_url', 1024);
            $table->jsonb('settings')->nullable();
            $table->boolean('is_active')->default(false);
            $table->foreignUlid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['payment_provider_id', 'environment', 'is_active']);
        });

        Schema::create('payment_channels', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('payment_provider_id')->constrained('payment_providers')->restrictOnDelete();
            $table->string('channel_key', 80);
            $table->string('name', 100);
            $table->string('channel_type', 30);
            $table->string('bank_code', 30)->nullable();
            $table->jsonb('fee_config')->nullable();
            $table->decimal('minimum_amount', 19, 4)->nullable();
            $table->decimal('maximum_amount', 19, 4)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('synced_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->unique(['payment_provider_id', 'channel_key']);
        });

        Schema::create('invoices', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('tenant_id')->constrained('tenants')->restrictOnDelete();
            $table->foreignUlid('subscription_id')->constrained('subscriptions')->restrictOnDelete();
            $table->string('invoice_number', 80)->unique();
            $table->string('status', 20)->default('DRAFT');
            $table->timestampTz('billing_period_start');
            $table->timestampTz('billing_period_end');
            $table->timestampTz('issued_at')->nullable();
            $table->timestampTz('due_at')->nullable();
            $table->timestampTz('paid_at')->nullable();
            $table->char('currency_code', 3);
            $table->decimal('subtotal', 19, 4);
            $table->decimal('tax_amount', 19, 4)->default(0);
            $table->decimal('total_amount', 19, 4);
            $table->decimal('amount_paid', 19, 4)->default(0);
            $table->string('customer_name_snapshot');
            $table->string('customer_email_snapshot', 320);
            $table->string('customer_tax_id_snapshot', 100)->nullable();
            $table->jsonb('billing_address_snapshot')->nullable();
            $table->text('notes')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['tenant_id', 'status', 'due_at']);
        });

        Schema::create('invoice_lines', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->string('line_type', 30);
            $table->string('description', 500);
            $table->decimal('quantity', 19, 4)->default(1);
            $table->decimal('unit_price', 19, 4);
            $table->decimal('tax_amount', 19, 4)->default(0);
            $table->decimal('line_total', 19, 4);
            $table->jsonb('metadata')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestampTz('created_at');
        });

        Schema::create('payments', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('invoice_id')->constrained('invoices')->restrictOnDelete();
            $table->foreignUlid('payment_provider_id')->constrained('payment_providers')->restrictOnDelete();
            $table->foreignUlid('payment_channel_id')->constrained('payment_channels')->restrictOnDelete();
            $table->string('payment_reference', 120)->unique();
            $table->string('provider_transaction_id')->nullable()->index();
            $table->string('status', 30)->default('CREATED');
            $table->char('currency_code', 3);
            $table->decimal('amount', 19, 4);
            $table->decimal('provider_fee', 19, 4)->default(0);
            $table->text('redirect_url')->nullable();
            $table->timestampTz('expires_at')->nullable();
            $table->timestampTz('paid_at')->nullable();
            $table->timestampTz('manually_confirmed_at')->nullable();
            $table->foreignUlid('manually_confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('idempotency_key', 160)->unique();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['invoice_id', 'status']);
        });

        Schema::create('payment_events', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('payment_id')->nullable()->constrained('payments')->nullOnDelete();
            $table->foreignUlid('payment_provider_id')->constrained('payment_providers')->restrictOnDelete();
            $table->string('provider_event_id')->nullable()->index();
            $table->string('event_type', 80);
            $table->boolean('signature_valid')->default(false);
            $table->boolean('amount_valid')->nullable();
            $table->boolean('invoice_valid')->nullable();
            $table->boolean('tenant_valid')->nullable();
            $table->string('idempotency_key')->unique();
            $table->jsonb('request_headers')->nullable();
            $table->jsonb('payload');
            $table->string('processing_status', 20)->default('RECEIVED');
            $table->text('failure_message')->nullable();
            $table->timestampTz('received_at');
            $table->timestampTz('processed_at')->nullable();
            $table->index(['payment_id', 'received_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_events');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('invoice_lines');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('payment_channels');
        Schema::dropIfExists('payment_provider_configs');
        Schema::dropIfExists('payment_providers');
    }
};
