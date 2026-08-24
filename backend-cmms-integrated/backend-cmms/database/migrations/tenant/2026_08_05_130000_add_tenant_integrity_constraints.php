<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        foreach ($this->checks() as $name => [$table, $expression]) {
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK ({$expression})");
        }

        DB::statement('CREATE UNIQUE INDEX team_members_one_active_membership ON team_members (team_id, tenant_user_id) WHERE is_active = true');
        DB::statement('CREATE UNIQUE INDEX work_order_assignments_one_current ON work_order_assignments (work_order_id) WHERE is_current = true');
        DB::statement('CREATE UNIQUE INDEX labor_entries_one_active_timer_per_technician ON work_order_labor_entries (technician_id) WHERE ended_at IS NULL');
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS labor_entries_one_active_timer_per_technician');
        DB::statement('DROP INDEX IF EXISTS work_order_assignments_one_current');
        DB::statement('DROP INDEX IF EXISTS team_members_one_active_membership');

        foreach (array_reverse($this->checks(), true) as $name => [$table]) {
            DB::statement("ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$name}");
        }
    }

    /** @return array<string, array{string, string}> */
    private function checks(): array
    {
        return [
            'locations_type_check' => ['locations', "location_type IN ('AREA', 'BUILDING', 'FLOOR', 'ROOM', 'LINE', 'ZONE', 'OTHER')"],
            'tenant_users_role_check' => ['tenant_users', "role_key IN ('COMPANY_ADMIN', 'MANAGER', 'SUPERVISOR', 'TECHNICIAN', 'OPERATOR', 'VIEWER')"],
            'tenant_users_status_check' => ['tenant_users', "status IN ('INVITED', 'ACTIVE', 'INACTIVE')"],
            'team_members_type_check' => ['team_members', "member_type IN ('LEAD', 'MEMBER')"],
            'team_members_period_check' => ['team_members', 'left_at IS NULL OR left_at >= joined_at'],
            'assets_status_check' => ['assets', "status IN ('OPERATIONAL', 'UNDER_MAINTENANCE', 'DOWN', 'STANDBY', 'OUT_OF_SERVICE')"],
            'assets_criticality_check' => ['assets', "criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')"],
            'asset_operator_assignment_type_check' => ['asset_operator_assignments', "assignment_type IN ('PRIMARY', 'SECONDARY', 'TEMPORARY')"],
            'asset_operator_assignment_period_check' => ['asset_operator_assignments', 'ends_at IS NULL OR ends_at >= starts_at'],
            'maintenance_requests_priority_check' => ['maintenance_requests', "priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')"],
            'maintenance_requests_status_check' => ['maintenance_requests', "status IN ('SUBMITTED', 'PENDING_APPROVAL', 'CONVERTED', 'REJECTED', 'CANCELLED')"],
            'work_orders_source_check' => ['work_orders', "source IN ('DIRECT', 'REQUEST', 'PM')"],
            'work_orders_source_reference_check' => ['work_orders', "(source = 'DIRECT' AND maintenance_request_id IS NULL AND pm_occurrence_id IS NULL) OR (source = 'REQUEST' AND maintenance_request_id IS NOT NULL AND pm_occurrence_id IS NULL) OR (source = 'PM' AND maintenance_request_id IS NULL AND pm_occurrence_id IS NOT NULL)"],
            'work_orders_priority_check' => ['work_orders', "priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')"],
            'work_orders_status_check' => ['work_orders', "status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED')"],
            'work_order_assignments_action_check' => ['work_order_assignments', "action IN ('ASSIGN', 'CLAIM', 'REASSIGN', 'RELEASE')"],
            'work_order_assignments_target_check' => ['work_order_assignments', 'team_id IS NOT NULL OR technician_id IS NOT NULL'],
            'work_order_labor_entries_period_check' => ['work_order_labor_entries', 'ended_at IS NULL OR ended_at >= started_at'],
            'work_order_labor_entries_duration_check' => ['work_order_labor_entries', 'duration_minutes IS NULL OR duration_minutes >= 0'],
            'attachments_entity_type_check' => ['attachments', "entity_type IN ('REQUEST', 'WORK_ORDER')"],
            'attachments_media_role_check' => ['attachments', "media_role IN ('REQUEST', 'BEFORE', 'AFTER', 'OTHER')"],
            'attachments_size_check' => ['attachments', 'size_bytes >= 0'],
            'comments_entity_type_check' => ['comments', "entity_type IN ('REQUEST', 'WORK_ORDER')"],
            'pm_templates_priority_check' => ['pm_templates', "priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')"],
            'pm_templates_status_check' => ['pm_templates', "status IN ('DRAFT', 'ACTIVE', 'RETIRED')"],
            'pm_schedules_mode_check' => ['pm_schedules', "schedule_mode IN ('FIXED', 'COMPLETION_BASED')"],
            'pm_schedules_open_policy_check' => ['pm_schedules', "open_occurrence_policy IN ('HOLD_NEXT', 'ALLOW_NEXT')"],
            'pm_schedules_status_check' => ['pm_schedules', "status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED')"],
            'pm_schedules_period_check' => ['pm_schedules', 'end_date IS NULL OR end_date >= start_date'],
            'pm_triggers_type_check' => ['pm_schedule_triggers', "trigger_type IN ('TIME', 'METER')"],
            'pm_triggers_operator_check' => ['pm_schedule_triggers', "trigger_operator IN ('EVERY_INTERVAL', 'REACHES', 'EVERY_INCREMENT')"],
            'pm_time_trigger_fields_check' => ['pm_schedule_triggers', "trigger_type <> 'TIME' OR (trigger_operator = 'EVERY_INTERVAL' AND interval_unit IN ('DAY', 'WEEK', 'MONTH', 'YEAR') AND interval_value > 0 AND meter_id IS NULL AND meter_threshold_value IS NULL AND meter_interval_value IS NULL)"],
            'pm_meter_trigger_fields_check' => ['pm_schedule_triggers', "trigger_type <> 'METER' OR (meter_id IS NOT NULL AND ((trigger_operator = 'REACHES' AND meter_threshold_value IS NOT NULL) OR (trigger_operator = 'EVERY_INCREMENT' AND meter_interval_value > 0)))"],
            'pm_fixed_day_of_week_check' => ['pm_schedule_triggers', 'fixed_day_of_week IS NULL OR fixed_day_of_week BETWEEN 1 AND 7'],
            'pm_fixed_day_of_month_check' => ['pm_schedule_triggers', 'fixed_day_of_month IS NULL OR fixed_day_of_month BETWEEN 1 AND 31'],
            'pm_occurrences_status_check' => ['pm_occurrences', "status IN ('PENDING', 'GENERATED', 'COMPLETED', 'SKIPPED', 'CANCELLED', 'HELD')"],
        ];
    }
};
