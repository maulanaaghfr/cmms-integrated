<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('work_orders', function (Blueprint $table): void {
            $table->boolean('approval_required')->default(false);
            $table->timestampTz('approved_at')->nullable();
            $table->foreignUlid('approved_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->timestampTz('rejected_at')->nullable();
            $table->foreignUlid('rejected_by')->nullable()->constrained('tenant_users')->nullOnDelete();
            $table->text('rejection_reason')->nullable();
        });

        DB::table('work_orders')->update(['is_claimable' => false]);

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE work_orders ALTER COLUMN is_claimable SET DEFAULT false');
            DB::statement("ALTER TABLE work_orders ALTER COLUMN status SET DEFAULT 'PENDING_APPROVAL'");
            DB::statement('ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check');
            DB::statement("ALTER TABLE work_orders ADD CONSTRAINT work_orders_status_check CHECK (status IN ('PENDING_APPROVAL', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'VERIFIED', 'CLOSED', 'REJECTED', 'CANCELLED'))");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check');
        }

        DB::table('work_orders')->where('status', 'PENDING_APPROVAL')->update(['status' => 'OPEN']);
        DB::table('work_orders')->where('status', 'REJECTED')->update(['status' => 'CANCELLED']);

        Schema::table('work_orders', function (Blueprint $table): void {
            $table->dropForeign(['approved_by']);
            $table->dropForeign(['rejected_by']);
            $table->dropColumn(['approval_required', 'approved_at', 'approved_by', 'rejected_at', 'rejected_by', 'rejection_reason']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE work_orders ALTER COLUMN is_claimable SET DEFAULT true');
            DB::statement("ALTER TABLE work_orders ALTER COLUMN status SET DEFAULT 'OPEN'");
            DB::statement("ALTER TABLE work_orders ADD CONSTRAINT work_orders_status_check CHECK (status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED'))");
        }
    }
};
