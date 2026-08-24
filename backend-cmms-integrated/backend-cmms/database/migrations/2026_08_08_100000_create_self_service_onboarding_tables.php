<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('onboarding_registrations', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignUlid('selected_plan_id')->constrained('plans')->restrictOnDelete();
            $table->foreignUlid('tenant_id')->nullable()->unique()->constrained('tenants')->restrictOnDelete();
            $table->string('source', 30)->default('SELF_SERVICE');
            $table->string('status', 40);
            $table->string('company_name');
            $table->string('company_email', 320);
            $table->string('company_phone', 32)->nullable();
            $table->string('industry', 100)->nullable();
            $table->string('timezone', 64)->default('Asia/Jakarta');
            $table->string('requested_slug', 100)->unique();
            $table->string('billing_period', 16);
            $table->string('terms_version', 40);
            $table->string('privacy_version', 40);
            $table->timestampTz('consented_at');
            $table->timestampTz('email_verified_at')->nullable();
            $table->char('email_verification_token_hash', 64)->nullable()->unique();
            $table->timestampTz('email_verification_expires_at')->nullable();
            $table->timestampTz('verification_sent_at')->nullable();
            $table->unsignedSmallInteger('verification_send_count')->default(0);
            $table->string('registration_idempotency_key', 160)->unique();
            $table->char('registration_payload_hash', 64);
            $table->string('provision_idempotency_key', 160)->nullable()->unique();
            $table->char('provision_payload_hash', 64)->nullable();
            $table->timestampTz('expires_at');
            $table->timestampTz('completed_at')->nullable();
            $table->string('last_error_code', 100)->nullable();
            $table->jsonb('metadata')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['user_id', 'status']);
            $table->index(['status', 'expires_at']);
        });

        Schema::create('tenant_provisioning_attempts', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('tenant_id')->constrained('tenants')->restrictOnDelete();
            $table->foreignUlid('onboarding_registration_id')->nullable()->constrained('onboarding_registrations')->restrictOnDelete();
            $table->string('request_id', 160)->unique();
            $table->string('source', 30);
            $table->string('status', 30);
            $table->string('current_step', 60)->nullable();
            $table->unsignedSmallInteger('attempt_number')->default(1);
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('finished_at')->nullable();
            $table->string('last_error_code', 100)->nullable();
            $table->text('last_error_message')->nullable();
            $table->jsonb('context')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['tenant_id', 'status']);
            $table->index(['onboarding_registration_id', 'created_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE onboarding_registrations ADD CONSTRAINT onboarding_source_check CHECK (source IN ('SELF_SERVICE', 'PLATFORM_ADMIN', 'CLI', 'SALES'))");
            DB::statement("ALTER TABLE onboarding_registrations ADD CONSTRAINT onboarding_status_check CHECK (status IN ('EMAIL_VERIFICATION_PENDING', 'READY_TO_PROVISION', 'PLAN_SELECTION_REQUIRED', 'PROVISIONING', 'COMPLETED', 'PROVISIONING_FAILED', 'EXPIRED', 'CANCELLED'))");
            DB::statement("ALTER TABLE onboarding_registrations ADD CONSTRAINT onboarding_billing_period_check CHECK (billing_period IN ('MONTHLY', 'YEARLY'))");
            DB::statement("ALTER TABLE tenant_provisioning_attempts ADD CONSTRAINT provisioning_attempt_source_check CHECK (source IN ('SELF_SERVICE', 'PLATFORM_ADMIN', 'CLI', 'SALES'))");
            DB::statement("ALTER TABLE tenant_provisioning_attempts ADD CONSTRAINT provisioning_attempt_status_check CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_provisioning_attempts');
        Schema::dropIfExists('onboarding_registrations');
    }
};
