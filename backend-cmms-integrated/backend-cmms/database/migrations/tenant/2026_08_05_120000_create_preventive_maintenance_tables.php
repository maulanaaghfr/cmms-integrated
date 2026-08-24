<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pm_templates', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('code', 80)->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('priority', 20)->default('MEDIUM');
            $table->foreignUlid('default_team_id')->nullable()->constrained('teams')->nullOnDelete();
            $table->foreignUlid('default_technician_id')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->unsignedInteger('estimated_duration_minutes')->nullable();
            $table->text('work_instructions')->nullable();
            $table->string('status', 20)->default('DRAFT');
            $table->foreignUlid('created_by')->constrained('tenant_users')->restrictOnDelete();
            $table->unsignedInteger('lock_version')->default(1);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->timestampTz('archived_at')->nullable();
        });

        Schema::create('pm_schedules', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('pm_template_id')->constrained('pm_templates')->restrictOnDelete();
            $table->foreignUlid('site_id')->constrained('sites')->restrictOnDelete();
            $table->foreignUlid('asset_id')->constrained('assets')->restrictOnDelete();
            $table->string('code', 80)->unique();
            $table->string('name');
            $table->string('schedule_mode', 30)->default('FIXED');
            $table->unsignedInteger('generation_lead_minutes')->default(0);
            $table->string('open_occurrence_policy', 20)->default('HOLD_NEXT');
            $table->string('timezone', 64);
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->timestampTz('next_due_at')->nullable();
            $table->timestampTz('last_generated_at')->nullable();
            $table->timestampTz('last_completed_at')->nullable();
            $table->string('status', 20)->default('DRAFT');
            $table->timestampTz('paused_at')->nullable();
            $table->foreignUlid('paused_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->text('pause_reason')->nullable();
            $table->unsignedInteger('lock_version')->default(1);
            $table->foreignUlid('created_by')->constrained('tenant_users')->restrictOnDelete();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->timestampTz('archived_at')->nullable();
            $table->index(['status', 'next_due_at']);
            $table->index(['asset_id', 'status']);
        });

        Schema::create('pm_schedule_triggers', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('pm_schedule_id')->constrained('pm_schedules')->cascadeOnDelete();
            $table->string('trigger_type', 20)->default('TIME');
            $table->string('trigger_operator', 30)->default('EVERY_INTERVAL');
            $table->string('interval_unit', 20)->nullable();
            $table->unsignedInteger('interval_value')->nullable();
            $table->unsignedSmallInteger('fixed_day_of_week')->nullable();
            $table->unsignedSmallInteger('fixed_day_of_month')->nullable();
            $table->time('fixed_local_time')->nullable();
            $table->ulid('meter_id')->nullable();
            $table->decimal('meter_threshold_value', 24, 8)->nullable();
            $table->decimal('meter_interval_value', 24, 8)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
        });

        Schema::create('pm_occurrences', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('pm_schedule_id')->constrained('pm_schedules')->restrictOnDelete();
            $table->foreignUlid('pm_template_id')->constrained('pm_templates')->restrictOnDelete();
            $table->foreignUlid('asset_id')->constrained('assets')->restrictOnDelete();
            $table->foreignUlid('trigger_id')->nullable()->constrained('pm_schedule_triggers')->nullOnDelete();
            $table->string('occurrence_key', 160)->unique();
            $table->timestampTz('due_at');
            $table->timestampTz('generation_due_at');
            $table->timestampTz('generated_at')->nullable();
            $table->string('status', 20)->default('PENDING');
            $table->timestampTz('skipped_at')->nullable();
            $table->foreignUlid('skipped_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->text('skip_reason')->nullable();
            $table->timestampTz('completed_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['pm_schedule_id', 'due_at']);
            $table->index(['status', 'generation_due_at']);
        });

        Schema::table('work_orders', function (Blueprint $table): void {
            $table->foreign('pm_occurrence_id')->references('id')->on('pm_occurrences')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('work_orders', function (Blueprint $table): void {
            $table->dropForeign(['pm_occurrence_id']);
        });
        Schema::dropIfExists('pm_occurrences');
        Schema::dropIfExists('pm_schedule_triggers');
        Schema::dropIfExists('pm_schedules');
        Schema::dropIfExists('pm_templates');
    }
};
