<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProductCatalogSeeder extends Seeder
{
    public function run(): void
    {
        $this->normalizeLegacyFeatureKeys();
        $featureIds = [];
        foreach ([
            'core.assets' => ['Asset Management', 'BOOLEAN'],
            'core.requests' => ['Maintenance Requests', 'BOOLEAN'],
            'core.work_orders' => ['Work Orders', 'BOOLEAN'],
            'core.teams' => ['Team Management', 'BOOLEAN'],
            'core.notifications' => ['In-app Notifications', 'BOOLEAN'],
            'core.preventive_maintenance' => ['Preventive Maintenance Lite', 'BOOLEAN'],
            'core.billing_gateway' => ['Billing Gateway', 'BOOLEAN'],
            'core.inventory' => ['Inventory Management', 'BOOLEAN'],
            'limit.users' => ['Maximum Users', 'LIMIT'],
            'limit.assets' => ['Maximum Assets', 'LIMIT'],
            'limit.sites' => ['Maximum Sites', 'LIMIT'],
        ] as $key => [$name, $type]) {
            $featureIds[$key] = $this->upsert('features', ['key' => $key], [
                'name' => $name,
                'description' => "MVP feature: {$name}",
                'feature_type' => $type,
                'is_active' => true,
            ]);
        }

        foreach ([
            'BASIC' => ['Basic', 500000, 10, 100, 1, false],
            'PROFESSIONAL' => ['Professional', 1500000, 50, 1000, 5, true],
            'ENTERPRISE' => ['Enterprise', 5000000, null, null, null, true],
        ] as $key => [$name, $monthlyPrice, $maxUsers, $maxAssets, $maxSites, $hasPm]) {
            $planId = $this->upsert('plans', ['key' => $key, 'version_number' => 1], [
                'name' => $name,
                'description' => 'Paket '.$name.' — dapat diubah oleh SUPER_ADMIN kapan saja.',
                'monthly_price' => $monthlyPrice,
                'annual_price' => null,
                'currency_code' => 'IDR',
                'max_users' => $maxUsers,
                'max_assets' => $maxAssets,
                'max_sites' => $maxSites,
                'status' => 'PUBLISHED',
                'is_public' => true,
                'effective_from' => now(),
                'published_at' => now(),
                'lock_version' => 1,
            ]);

            foreach (['core.assets', 'core.requests', 'core.work_orders', 'core.teams', 'core.notifications', 'core.inventory'] as $featureKey) {
                $this->attachFeature($planId, $featureIds[$featureKey], true);
            }
            $this->attachFeature($planId, $featureIds['core.preventive_maintenance'], $hasPm);
            $this->attachFeature($planId, $featureIds['core.billing_gateway'], true);
            $this->attachFeature($planId, $featureIds['limit.users'], true, $maxUsers);
            $this->attachFeature($planId, $featureIds['limit.assets'], true, $maxAssets);
            $this->attachFeature($planId, $featureIds['limit.sites'], true, $maxSites);
        }
    }

    private function normalizeLegacyFeatureKeys(): void
    {
        foreach ([
            'asset_management' => 'core.assets', 'maintenance_requests' => 'core.requests',
            'work_orders' => 'core.work_orders', 'team_management' => 'core.teams',
            'notifications' => 'core.notifications', 'preventive_maintenance' => 'core.preventive_maintenance',
            'billing_gateway' => 'core.billing_gateway', 'max_users' => 'limit.users',
            'max_assets' => 'limit.assets', 'max_sites' => 'limit.sites',
        ] as $legacy => $canonical) {
            $legacyId = DB::table('features')->where('key', $legacy)->value('id');
            if (! $legacyId) {
                continue;
            }
            $canonicalId = DB::table('features')->where('key', $canonical)->value('id');
            if (! $canonicalId) {
                DB::table('features')->where('id', $legacyId)->update(['key' => $canonical, 'updated_at' => now()]);

                continue;
            }
            foreach (DB::table('plan_features')->where('feature_id', $legacyId)->get() as $legacyPlanFeature) {
                if (! DB::table('plan_features')->where('plan_id', $legacyPlanFeature->plan_id)->where('feature_id', $canonicalId)->exists()) {
                    DB::table('plan_features')->where('id', $legacyPlanFeature->id)->update(['feature_id' => $canonicalId, 'updated_at' => now()]);
                } else {
                    DB::table('plan_features')->where('id', $legacyPlanFeature->id)->delete();
                }
            }
            DB::table('features')->where('id', $legacyId)->delete();
        }
    }

    private function attachFeature(string $planId, string $featureId, bool $enabled, ?int $limit = null): void
    {
        $this->upsert('plan_features', ['plan_id' => $planId, 'feature_id' => $featureId], [
            'is_enabled' => $enabled,
            'numeric_limit' => $limit,
            'config_value' => null,
        ]);
    }

    private function upsert(string $table, array $keys, array $values): string
    {
        $id = DB::table($table)->where($keys)->value('id') ?: (string) Str::ulid();
        DB::table($table)->updateOrInsert($keys, [
            'id' => $id,
            ...$values,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }
}
