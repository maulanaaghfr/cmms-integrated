<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Introduces the PENDING_PAYMENT subscription status.
 *
 * Selecting a paid plan no longer flips the tenant straight to ACTIVE.
 * A subscription row is created in PENDING_PAYMENT and only becomes
 * ACTIVE once the linked invoice is actually paid (see
 * BillingController::settlePayment()). A tenant may therefore have at
 * most one "entitled" subscription (TRIAL/ACTIVE/GRACE/SUSPENDED) and,
 * independently, at most one PENDING_PAYMENT subscription awaiting
 * payment at any given time.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check');
        DB::statement("ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('PENDING_PAYMENT', 'TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'))");

        DB::statement('CREATE UNIQUE INDEX subscriptions_one_pending_per_tenant ON subscriptions (tenant_id) WHERE status = \'PENDING_PAYMENT\'');
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS subscriptions_one_pending_per_tenant');

        DB::statement('ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check');
        DB::statement("ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'))");
    }
};
