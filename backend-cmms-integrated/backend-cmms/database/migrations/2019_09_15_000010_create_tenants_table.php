<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('code', 60)->unique();
            $table->string('name');
            $table->string('slug', 100)->unique();
            $table->string('email', 320);
            $table->string('phone', 32)->nullable();
            $table->string('industry', 100)->nullable();
            $table->string('timezone', 64)->default('Asia/Jakarta');
            $table->string('status', 20)->default('TRIAL');
            $table->string('database_name', 128)->unique();
            $table->string('database_status', 20)->default('PENDING');
            $table->jsonb('settings')->nullable();
            $table->timestampTz('provisioned_at')->nullable();
            $table->foreignUlid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('lock_version')->default(1);
            $table->timestampTz('archived_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            // Technical storage required by stancl/tenancy for internal keys.
            $table->jsonb('data')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenants');
    }
};
