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
            // FIX: sebelumnya di-upsert dengan key ['key' => $key, 'version_number' => 1]
            // yang HARDCODE version 1. Jika plan pernah di-republish (version_number naik),
            // baris ini akan membuat plan BARU yang terpisah dari plan yang benar-benar
            // dipakai oleh subscriptions.plan_id tenant, sehingga plan_features yang
            // di-attach di bawah tidak pernah "terlihat" oleh EnsurePlanFeature untuk
            // tenant yang sudah berlangganan versi lama/baru yang berbeda.
            //
            // Sekarang: cari plan TERBARU (version_number tertinggi) untuk key ini.
            // Kalau ada, update baris itu (bukan bikin baru). Kalau belum ada sama
            // sekali, baru buat version 1.
            $planId = $this->upsertPlanLatestVersion($key, [
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

        $this->warnOnOrphanPlanVersions();
    }

    /**
     * Update plan versi terbaru untuk $key jika sudah ada; buat version 1 hanya
     * jika key ini belum punya baris plan sama sekali. Tidak pernah membuat
     * baris "bayangan" baru selama masih ada baris existing untuk key tsb.
     */
    private function upsertPlanLatestVersion(string $key, array $values): string
    {
        $existing = DB::table('plans')->where('key', $key)->orderByDesc('version_number')->first();

        if ($existing) {
            DB::table('plans')->where('id', $existing->id)->update([
                ...$values,
                'updated_at' => now(),
            ]);

            return $existing->id;
        }

        $id = (string) Str::ulid();
        DB::table('plans')->insert([
            'id' => $id,
            'key' => $key,
            'version_number' => 1,
            'lock_version' => 1,
            ...$values,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    /**
     * Peringatan diagnostik saja (tidak mengubah data): kalau ada key plan dengan
     * lebih dari satu baris version_number, itu tanda peninggalan bug lama —
     * perlu ditinjau manual mana yang benar-benar dipakai subscriptions.plan_id.
     */
    private function warnOnOrphanPlanVersions(): void
    {
        $dupes = DB::table('plans')
            ->select('key')
            ->groupBy('key')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('key');

        foreach ($dupes as $key) {
            $this->command?->warn("[ProductCatalogSeeder] Plan key '{$key}' punya lebih dari satu baris version_number — periksa manual mana yang dipakai subscriptions.plan_id agar plan_features tidak basi.");
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