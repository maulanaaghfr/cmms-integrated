<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Makes a real, permanent DELETE of a tenant_user possible.
 *
 * Historically tenant_users could only be soft-deleted (status -> INACTIVE)
 * because almost every "who did this" column pointing at tenant_users was
 * declared ->restrictOnDelete(). That is correct and safe for master/asset
 * data (an asset's `created_by` is intentionally left alone — see the
 * assets.created_by guard in TenantUserManagementPolicy::assertHardDeletable()
 * — deleting a user should never silently delete a piece of equipment).
 *
 * For pure *activity/history* records, though, the business decision (2026-09-08)
 * is that deleting a user should take their footprint with them, including
 * work orders, PM schedules/occurrences generated from templates they made,
 * comments, attachments, signatures, labor entries, etc. — even if that
 * "breaks"/removes records that other users also touched along the way.
 *
 * This migration flips those specific FKs from RESTRICT to CASCADE, and also
 * flips the *intermediate* parent/child FKs that would otherwise still block
 * the cascade chain from completing (e.g. work_orders.maintenance_request_id,
 * pm_schedules.pm_template_id, pm_occurrences.pm_schedule_id/pm_template_id,
 * work_orders.pm_occurrence_id).
 *
 * NOT touched (left as RESTRICT, intentionally):
 *   - assets.created_by, asset_categories/sites/locations/teams/warehouses/
 *     spare_parts creator-ish columns — these are master/physical data, not
 *     "history". Deleting a user who created an asset is blocked with a
 *     clear error instead (see TenantUserManagementPolicy).
 */
return new class extends Migration
{
    /** @var array<int, array{table: string, column: string, references: string, on: string}> */
    private array $referenceMap = [
        ['table' => 'maintenance_requests', 'column' => 'requester_id', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'maintenance_request_status_histories', 'column' => 'actor_id', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'work_orders', 'column' => 'created_by', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'work_orders', 'column' => 'maintenance_request_id', 'references' => 'id', 'on' => 'maintenance_requests'],
        ['table' => 'work_orders', 'column' => 'pm_occurrence_id', 'references' => 'id', 'on' => 'pm_occurrences'],
        ['table' => 'work_order_status_histories', 'column' => 'actor_id', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'work_order_assignments', 'column' => 'assigned_by', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'work_order_labor_entries', 'column' => 'technician_id', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'work_order_signatures', 'column' => 'signed_by', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'comments', 'column' => 'author_id', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'attachments', 'column' => 'uploaded_by', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'asset_operator_assignments', 'column' => 'tenant_user_id', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'asset_operator_assignments', 'column' => 'assigned_by', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'pm_templates', 'column' => 'created_by', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'pm_schedules', 'column' => 'created_by', 'references' => 'id', 'on' => 'tenant_users'],
        ['table' => 'pm_schedules', 'column' => 'pm_template_id', 'references' => 'id', 'on' => 'pm_templates'],
        ['table' => 'pm_occurrences', 'column' => 'pm_schedule_id', 'references' => 'id', 'on' => 'pm_schedules'],
        ['table' => 'pm_occurrences', 'column' => 'pm_template_id', 'references' => 'id', 'on' => 'pm_templates'],
    ];

    public function up(): void
    {
        foreach ($this->referenceMap as $fk) {
            Schema::table($fk['table'], function (Blueprint $table) use ($fk): void {
                $table->dropForeign([$fk['column']]);
                $table->foreign($fk['column'])->references($fk['references'])->on($fk['on'])->cascadeOnDelete();
            });
        }
    }

    public function down(): void
    {
        // Reverse in opposite order so we never drop a constraint that a
        // later-in-`up()` step depended on being present.
        foreach (array_reverse($this->referenceMap) as $fk) {
            Schema::table($fk['table'], function (Blueprint $table) use ($fk): void {
                $table->dropForeign([$fk['column']]);
                $table->foreign($fk['column'])->references($fk['references'])->on($fk['on'])->restrictOnDelete();
            });
        }
    }
};
