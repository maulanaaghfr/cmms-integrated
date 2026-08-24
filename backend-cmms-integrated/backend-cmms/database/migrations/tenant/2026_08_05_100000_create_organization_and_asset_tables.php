<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sites', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('code', 60)->unique();
            $table->string('name');
            $table->text('address')->nullable();
            $table->string('timezone', 64)->default('Asia/Jakarta');
            $table->boolean('is_active')->default(true);
            $table->timestampTz('archived_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
        });

        Schema::create('locations', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('site_id')->constrained('sites')->restrictOnDelete();
            $table->ulid('parent_location_id')->nullable();
            $table->string('code', 60);
            $table->string('name');
            $table->string('location_type', 30)->default('OTHER');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('archived_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->unique(['site_id', 'code']);
            $table->index(['site_id', 'parent_location_id']);
        });

        Schema::table('locations', function (Blueprint $table): void {
            $table->foreign('parent_location_id')->references('id')->on('locations')->restrictOnDelete();
        });

        Schema::create('tenant_users', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->ulid('central_user_id')->unique();
            $table->ulid('central_membership_id')->unique();
            $table->string('email', 320);
            $table->string('full_name');
            $table->string('phone', 32)->nullable();
            $table->string('employee_code', 80)->nullable()->unique();
            $table->string('role_key', 40);
            $table->string('status', 20)->default('INVITED');
            $table->foreignUlid('primary_site_id')->nullable()->constrained('sites')->nullOnDelete();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
        });

        Schema::create('teams', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('site_id')->constrained('sites')->restrictOnDelete();
            $table->string('code', 60);
            $table->string('name');
            $table->foreignUlid('supervisor_user_id')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('archived_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->unique(['site_id', 'code']);
        });

        Schema::create('team_members', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('team_id')->constrained('teams')->cascadeOnDelete();
            $table->foreignUlid('tenant_user_id')->constrained('tenant_users')->cascadeOnDelete();
            $table->string('member_type', 20)->default('MEMBER');
            $table->timestampTz('joined_at');
            $table->timestampTz('left_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->unique(['team_id', 'tenant_user_id', 'joined_at']);
        });

        Schema::create('asset_categories', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('code', 80)->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('archived_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
        });

        Schema::create('assets', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('site_id')->constrained('sites')->restrictOnDelete();
            $table->foreignUlid('location_id')->nullable()->constrained('locations')->restrictOnDelete();
            $table->foreignUlid('asset_category_id')->constrained('asset_categories')->restrictOnDelete();
            $table->string('code', 80)->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('status', 30)->default('OPERATIONAL');
            $table->string('criticality', 20)->default('MEDIUM');
            $table->string('manufacturer')->nullable();
            $table->string('model')->nullable();
            $table->string('serial_number')->nullable()->index();
            $table->date('installation_date')->nullable();
            $table->string('barcode', 128)->nullable()->unique();
            $table->string('qr_token', 128)->unique();
            $table->boolean('request_approval_required')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('archived_at')->nullable();
            $table->foreignUlid('created_by')->constrained('tenant_users')->restrictOnDelete();
            $table->unsignedInteger('lock_version')->default(1);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['site_id', 'location_id']);
            $table->index(['status', 'criticality']);
        });

        Schema::create('asset_operator_assignments', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('asset_id')->constrained('assets')->restrictOnDelete();
            $table->foreignUlid('tenant_user_id')->constrained('tenant_users')->restrictOnDelete();
            $table->string('assignment_type', 20)->default('PRIMARY');
            $table->timestampTz('starts_at');
            $table->timestampTz('ends_at')->nullable();
            $table->foreignUlid('assigned_by')->constrained('tenant_users')->restrictOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at');
            $table->unique(['asset_id', 'tenant_user_id', 'starts_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('asset_operator_assignments');
        Schema::dropIfExists('assets');
        Schema::dropIfExists('asset_categories');
        Schema::dropIfExists('team_members');
        Schema::dropIfExists('teams');
        Schema::dropIfExists('tenant_users');
        Schema::dropIfExists('locations');
        Schema::dropIfExists('sites');
    }
};
