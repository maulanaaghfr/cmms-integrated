<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('work_order_checklist_items', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('work_order_id')->constrained('work_orders')->cascadeOnDelete();
            $table->string('label', 500);
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_required')->default(true);
            $table->boolean('is_completed')->default(false);
            $table->text('note')->nullable();
            $table->foreignUlid('completed_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->timestampTz('completed_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->index(['work_order_id', 'sort_order']);
        });

        Schema::create('work_order_signatures', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('work_order_id')->constrained('work_orders')->cascadeOnDelete();
            $table->foreignUlid('signed_by')->constrained('tenant_users')->restrictOnDelete();
            $table->text('signature_data');
            $table->timestampTz('signed_at');
            $table->timestampTz('created_at');
            $table->index(['work_order_id', 'signed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('work_order_signatures');
        Schema::dropIfExists('work_order_checklist_items');
    }
};
