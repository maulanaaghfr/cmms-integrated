<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('work_order_assignments', function (Blueprint $table): void {
            // The old nullOnDelete() action sets technician_id to NULL, but
            // work_order_assignments_target_check requires team_id or
            // technician_id to remain non-null. Delete the assignment history
            // row together with the deleted technician instead.
            $table->dropForeign(['technician_id']);
            $table->foreign('technician_id')
                ->references('id')
                ->on('tenant_users')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('work_order_assignments', function (Blueprint $table): void {
            $table->dropForeign(['technician_id']);
            $table->foreign('technician_id')
                ->references('id')
                ->on('tenant_users')
                ->nullOnDelete();
        });
    }
};
