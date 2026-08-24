<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('maintenance_requests', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('request_number', 80)->unique();
            $table->foreignUlid('asset_id')->constrained('assets')->restrictOnDelete();
            $table->foreignUlid('requester_id')->constrained('tenant_users')->restrictOnDelete();
            $table->string('title');
            $table->text('description');
            $table->string('priority', 20)->default('MEDIUM');
            $table->string('status', 30)->default('SUBMITTED');
            $table->boolean('approval_required')->default(false);
            $table->timestampTz('reported_at');
            $table->timestampTz('approved_at')->nullable();
            $table->foreignUlid('approved_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->timestampTz('rejected_at')->nullable();
            $table->foreignUlid('rejected_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->text('rejection_reason')->nullable();
            $table->timestampTz('cancelled_at')->nullable();
            $table->foreignUlid('cancelled_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->unsignedInteger('lock_version')->default(1);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['requester_id', 'status']);
            $table->index(['asset_id', 'reported_at']);
        });

        Schema::create('maintenance_request_status_histories', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('maintenance_request_id')->constrained('maintenance_requests')->cascadeOnDelete();
            $table->string('from_status', 30)->nullable();
            $table->string('to_status', 30);
            $table->foreignUlid('actor_id')->constrained('tenant_users')->restrictOnDelete();
            $table->text('note')->nullable();
            $table->timestampTz('occurred_at');
            $table->index(['maintenance_request_id', 'occurred_at']);
        });

        Schema::create('work_orders', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('work_order_number', 80)->unique();
            $table->string('source', 20);
            $table->foreignUlid('maintenance_request_id')->nullable()->unique()->constrained('maintenance_requests')->restrictOnDelete();
            $table->ulid('pm_occurrence_id')->nullable()->unique();
            $table->foreignUlid('site_id')->constrained('sites')->restrictOnDelete();
            $table->foreignUlid('location_id')->nullable()->constrained('locations')->restrictOnDelete();
            $table->foreignUlid('asset_id')->constrained('assets')->restrictOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('priority', 20)->default('MEDIUM');
            $table->string('status', 30)->default('OPEN');
            $table->foreignUlid('requester_id')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->foreignUlid('created_by')->constrained('tenant_users')->restrictOnDelete();
            $table->foreignUlid('current_team_id')->nullable()->constrained('teams')->nullOnDelete();
            $table->foreignUlid('current_assignee_id')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->boolean('is_claimable')->default(true);
            $table->timestampTz('reported_at');
            $table->timestampTz('due_at')->nullable();
            $table->timestampTz('acknowledged_at')->nullable();
            $table->timestampTz('work_started_at')->nullable();
            $table->timestampTz('completed_at')->nullable();
            $table->foreignUlid('completed_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->text('completion_note')->nullable();
            $table->timestampTz('verified_at')->nullable();
            $table->foreignUlid('verified_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->timestampTz('closed_at')->nullable();
            $table->foreignUlid('closed_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->timestampTz('cancelled_at')->nullable();
            $table->foreignUlid('cancelled_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->text('cancellation_reason')->nullable();
            $table->unsignedInteger('lock_version')->default(1);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['status', 'priority', 'due_at']);
            $table->index(['current_assignee_id', 'status']);
            $table->index(['asset_id', 'created_at']);
        });

        Schema::create('work_order_status_histories', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('work_order_id')->constrained('work_orders')->cascadeOnDelete();
            $table->string('from_status', 30)->nullable();
            $table->string('to_status', 30);
            $table->foreignUlid('actor_id')->constrained('tenant_users')->restrictOnDelete();
            $table->string('reason_code', 80)->nullable();
            $table->text('note')->nullable();
            $table->timestampTz('occurred_at');
            $table->index(['work_order_id', 'occurred_at']);
        });

        Schema::create('work_order_assignments', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('work_order_id')->constrained('work_orders')->cascadeOnDelete();
            $table->string('action', 20);
            $table->foreignUlid('team_id')->nullable()->constrained('teams')->nullOnDelete();
            $table->foreignUlid('technician_id')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->foreignUlid('assigned_by')->constrained('tenant_users')->restrictOnDelete();
            $table->timestampTz('assigned_at');
            $table->timestampTz('released_at')->nullable();
            $table->foreignUlid('released_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->text('release_reason')->nullable();
            $table->boolean('is_current')->default(true);
            $table->timestampTz('created_at');
            $table->index(['work_order_id', 'is_current']);
            $table->index(['technician_id', 'is_current']);
        });

        Schema::create('work_order_labor_entries', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('work_order_id')->constrained('work_orders')->cascadeOnDelete();
            $table->foreignUlid('technician_id')->constrained('tenant_users')->restrictOnDelete();
            $table->timestampTz('started_at');
            $table->timestampTz('ended_at')->nullable();
            $table->unsignedInteger('duration_minutes')->nullable();
            $table->text('notes')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['work_order_id', 'started_at']);
            $table->index(['technician_id', 'ended_at']);
        });

        Schema::create('attachments', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('entity_type', 20);
            $table->ulid('entity_id');
            $table->string('media_role', 20)->default('OTHER');
            $table->string('storage_disk', 40);
            $table->string('storage_path', 1024)->unique();
            $table->string('original_filename');
            $table->string('mime_type', 150);
            $table->unsignedBigInteger('size_bytes');
            $table->char('checksum_sha256', 64)->nullable();
            $table->foreignUlid('uploaded_by')->constrained('tenant_users')->restrictOnDelete();
            $table->timestampTz('created_at');
            $table->softDeletesTz();
            $table->index(['entity_type', 'entity_id']);
        });

        Schema::create('comments', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('entity_type', 20);
            $table->ulid('entity_id');
            $table->foreignUlid('author_id')->constrained('tenant_users')->restrictOnDelete();
            $table->text('body');
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->softDeletesTz();
            $table->index(['entity_type', 'entity_id', 'created_at']);
        });

        Schema::create('notifications', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('tenant_user_id')->constrained('tenant_users')->cascadeOnDelete();
            $table->string('event_type', 80);
            $table->string('entity_type', 30)->nullable();
            $table->ulid('entity_id')->nullable();
            $table->string('title');
            $table->text('message');
            $table->jsonb('payload')->nullable();
            $table->timestampTz('read_at')->nullable();
            $table->timestampTz('created_at');
            $table->index(['tenant_user_id', 'read_at', 'created_at']);
            $table->index(['entity_type', 'entity_id']);
        });

        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('actor_id')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->string('action', 120);
            $table->string('entity_type', 60);
            $table->ulid('entity_id')->nullable();
            $table->jsonb('before_values')->nullable();
            $table->jsonb('after_values')->nullable();
            $table->jsonb('context')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestampTz('occurred_at');
            $table->index(['actor_id', 'occurred_at']);
            $table->index(['entity_type', 'entity_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('comments');
        Schema::dropIfExists('attachments');
        Schema::dropIfExists('work_order_labor_entries');
        Schema::dropIfExists('work_order_assignments');
        Schema::dropIfExists('work_order_status_histories');
        Schema::dropIfExists('work_orders');
        Schema::dropIfExists('maintenance_request_status_histories');
        Schema::dropIfExists('maintenance_requests');
    }
};
