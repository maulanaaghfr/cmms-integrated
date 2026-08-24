<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manufacturers', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('name', 255);
            $table->string('contact_person', 255)->nullable();
            $table->string('email', 320)->nullable();
            $table->string('phone', 64)->nullable();
            $table->text('address')->nullable();
            $table->string('website', 255)->nullable();
            $table->unsignedTinyInteger('quality_score')->default(80);   // 0-100
            $table->unsignedTinyInteger('delivery_score')->default(80);  // 0-100
            $table->unsignedTinyInteger('support_score')->default(80);   // 0-100
            $table->boolean('is_active')->default(true);
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
        });

        Schema::create('vendors', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('name', 255);
            $table->string('vendor_type', 60)->default('Sparepart Supplier'); // Sparepart Supplier | Contractor | Service Provider
            $table->string('contact_person', 255)->nullable();
            $table->string('email', 320)->nullable();
            $table->string('phone', 64)->nullable();
            $table->text('address')->nullable();
            $table->string('city', 100)->nullable();
            $table->string('country', 100)->default('Indonesia');
            $table->string('website', 255)->nullable();
            $table->decimal('rating', 3, 1)->default(4.0);          // 1.0 - 5.0
            $table->unsignedTinyInteger('on_time_rate')->default(80); // 0-100 %
            $table->unsignedTinyInteger('quality_rate')->default(80); // 0-100 %
            $table->unsignedTinyInteger('price_score')->default(70);  // 0-100 %
            $table->decimal('total_spend', 18, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
        });

        Schema::create('purchase_orders', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->string('po_number', 80)->unique();
            $table->ulid('vendor_id')->nullable();
            $table->string('status', 40)->default('DRAFT'); // DRAFT | SENT | CONFIRMED | PARTIALLY_RECEIVED | RECEIVED | INVOICED | PAID | CANCELLED
            $table->string('invoice_status', 40)->default('PENDING'); // PENDING | INVOICED | PAID
            $table->decimal('total_cost', 18, 2)->default(0);
            $table->date('expected_date')->nullable();
            $table->date('received_date')->nullable();
            $table->text('notes')->nullable();
            $table->ulid('created_by')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->foreign('vendor_id')->references('id')->on('vendors')->nullOnDelete();
        });

        Schema::create('purchase_order_items', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->ulid('purchase_order_id');
            $table->ulid('spare_part_id')->nullable();
            $table->string('part_name', 255);          // denormalized for display
            $table->integer('quantity')->default(1);
            $table->decimal('unit_price', 15, 2)->default(0);
            $table->decimal('total_price', 15, 2)->default(0);
            $table->timestamps();

            $table->foreign('purchase_order_id')->references('id')->on('purchase_orders')->cascadeOnDelete();
            $table->foreign('spare_part_id')->references('id')->on('spare_parts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_order_items');
        Schema::dropIfExists('purchase_orders');
        Schema::dropIfExists('vendors');
        Schema::dropIfExists('manufacturers');
    }
};
