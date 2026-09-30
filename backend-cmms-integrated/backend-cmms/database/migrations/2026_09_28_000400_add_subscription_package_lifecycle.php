<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table): void {
            $table->timestampTz('deleted_at')->nullable();
            $table->index('deleted_at');
        });

        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->unsignedInteger('max_users_snapshot')->nullable();
            $table->unsignedInteger('max_assets_snapshot')->nullable();
            $table->unsignedInteger('max_sites_snapshot')->nullable();
            $table->jsonb('features_snapshot')->nullable();
        });

        DB::statement(<<<'SQL'
UPDATE subscriptions s
SET max_users_snapshot = p.max_users,
    max_assets_snapshot = p.max_assets,
    max_sites_snapshot = p.max_sites,
    features_snapshot = COALESCE((SELECT jsonb_agg(jsonb_build_object('feature_id', pf.feature_id, 'is_enabled', pf.is_enabled, 'numeric_limit', pf.numeric_limit, 'config_value', pf.config_value)) FROM plan_features pf WHERE pf.plan_id = s.plan_id), '[]'::jsonb)
FROM plans p WHERE p.id = s.plan_id
SQL
        );

        DB::statement('ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_status_check');
        DB::statement("ALTER TABLE plans ADD CONSTRAINT plans_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED', 'INACTIVE', 'ARCHIVED'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_status_check');
        DB::statement("ALTER TABLE plans ADD CONSTRAINT plans_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED'))");
        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->dropColumn(['max_users_snapshot', 'max_assets_snapshot', 'max_sites_snapshot', 'features_snapshot']);
        });
        Schema::table('plans', function (Blueprint $table): void {
            $table->dropIndex('plans_deleted_at_index');
            $table->dropColumn('deleted_at');
        });
    }
};
