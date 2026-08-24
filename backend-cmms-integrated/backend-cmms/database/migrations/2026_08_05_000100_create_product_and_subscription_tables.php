<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_memberships', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('tenant_id')->constrained('tenants')->restrictOnDelete();
            $table->foreignUlid('user_id')->constrained('users')->restrictOnDelete();
            $table->string('role_key', 40);
            $table->string('status', 20)->default('INVITED');
            $table->timestampTz('joined_at')->nullable();
            $table->timestampTz('deactivated_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->unique(['tenant_id', 'user_id']);
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('features', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('key', 100)->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('feature_type', 20)->default('BOOLEAN');
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
        });

        Schema::create('plans', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('key', 40);
            $table->unsignedInteger('version_number')->default(1);
            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('monthly_price', 19, 4)->default(0);
            $table->decimal('annual_price', 19, 4)->nullable();
            $table->char('currency_code', 3)->default('IDR');
            $table->unsignedInteger('max_users')->nullable();
            $table->unsignedInteger('max_assets')->nullable();
            $table->unsignedInteger('max_sites')->nullable();
            $table->string('status', 20)->default('DRAFT');
            $table->boolean('is_public')->default(false);
            $table->timestampTz('effective_from')->nullable();
            $table->timestampTz('effective_until')->nullable();
            $table->timestampTz('published_at')->nullable();
            $table->foreignUlid('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('lock_version')->default(1);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->unique(['key', 'version_number']);
            $table->index(['status', 'effective_from']);
        });

        Schema::create('plan_features', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('plan_id')->constrained('plans')->cascadeOnDelete();
            $table->foreignUlid('feature_id')->constrained('features')->restrictOnDelete();
            $table->boolean('is_enabled')->default(true);
            $table->decimal('numeric_limit', 19, 4)->nullable();
            $table->jsonb('config_value')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->unique(['plan_id', 'feature_id']);
        });

        Schema::create('subscriptions', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('tenant_id')->constrained('tenants')->restrictOnDelete();
            $table->foreignUlid('plan_id')->constrained('plans')->restrictOnDelete();
            $table->string('status', 20);
            $table->string('billing_period', 16);
            $table->decimal('price_snapshot', 19, 4);
            $table->char('currency_code', 3)->default('IDR');
            $table->timestampTz('starts_at');
            $table->timestampTz('trial_ends_at')->nullable();
            $table->timestampTz('current_period_start')->nullable();
            $table->timestampTz('current_period_end')->nullable();
            $table->timestampTz('grace_ends_at')->nullable();
            $table->boolean('auto_renew')->default(true);
            $table->timestampTz('cancelled_at')->nullable();
            $table->text('cancellation_reason')->nullable();
            $table->text('notes')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['tenant_id', 'status']);
            $table->index(['status', 'current_period_end']);
        });

        Schema::create('platform_audit_logs', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUlid('tenant_id')->nullable()->constrained('tenants')->nullOnDelete();
            $table->string('action', 120);
            $table->string('entity_type', 80);
            $table->ulid('entity_id')->nullable();
            $table->jsonb('before_values')->nullable();
            $table->jsonb('after_values')->nullable();
            $table->jsonb('context')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestampTz('occurred_at');
            $table->index(['actor_user_id', 'occurred_at']);
            $table->index(['tenant_id', 'occurred_at']);
            $table->index(['entity_type', 'entity_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_audit_logs');
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('plan_features');
        Schema::dropIfExists('plans');
        Schema::dropIfExists('features');
        Schema::dropIfExists('tenant_memberships');
    }
};
