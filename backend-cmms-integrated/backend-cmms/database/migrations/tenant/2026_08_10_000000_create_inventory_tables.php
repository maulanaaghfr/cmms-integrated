<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warehouses', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->ulid('site_id');
            $table->string('code', 80)->unique();
            $table->string('name', 255);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->foreign('site_id')->references('id')->on('sites')->cascadeOnDelete();
            $table->index(['site_id', 'is_active']);
        });

        Schema::create('spare_part_categories', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('code', 80)->unique();
            $table->string('name', 255);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
        });

        Schema::create('spare_parts', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->ulid('site_id');
            $table->ulid('spare_part_category_id')->nullable();
            $table->string('code', 80)->unique();
            $table->string('name', 255);
            $table->text('description')->nullable();
            $table->string('unit', 32)->default('pcs');
            $table->string('barcode', 128)->nullable()->unique();
            $table->unsignedInteger('min_stock')->default(0);
            $table->unsignedInteger('reorder_point')->default(0);
            $table->decimal('unit_cost', 15, 2)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('archived_at')->nullable();
            $table->ulid('created_by')->nullable();
            $table->unsignedInteger('lock_version')->default(1);
            $table->timestamps();

            $table->foreign('site_id')->references('id')->on('sites')->cascadeOnDelete();
            $table->foreign('spare_part_category_id')->references('id')->on('spare_part_categories')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('tenant_users')->nullOnDelete();
            $table->index(['site_id', 'is_active']);
        });

        Schema::create('spare_part_stocks', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->ulid('spare_part_id');
            $table->ulid('warehouse_id');
            $table->integer('quantity')->default(0);
            $table->timestamps();

            $table->foreign('spare_part_id')->references('id')->on('spare_parts')->cascadeOnDelete();
            $table->foreign('warehouse_id')->references('id')->on('warehouses')->cascadeOnDelete();
            $table->unique(['spare_part_id', 'warehouse_id']);
        });

        Schema::create('spare_part_stock_movements', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->ulid('spare_part_id');
            $table->ulid('warehouse_id');
            $table->string('type', 20); // IN, OUT, ADJUSTMENT
            $table->integer('quantity');
            $table->string('reason', 255)->nullable();
            $table->string('reference_type', 80)->nullable(); // e.g. WORK_ORDER, PURCHASE_ORDER, MANUAL
            $table->ulid('reference_id')->nullable();
            $table->ulid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('spare_part_id')->references('id')->on('spare_parts')->cascadeOnDelete();
            $table->foreign('warehouse_id')->references('id')->on('warehouses')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('tenant_users')->nullOnDelete();
            $table->index(['spare_part_id', 'warehouse_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('spare_part_stock_movements');
        Schema::dropIfExists('spare_part_stocks');
        Schema::dropIfExists('spare_parts');
        Schema::dropIfExists('spare_part_categories');
        Schema::dropIfExists('warehouses');
    }
};
