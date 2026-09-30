<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Database\ConnectionInterface;

/**
 * Builds the frozen copy of a plan's limits and features that a subscription
 * keeps for its running billing period. Price is snapshotted by callers
 * (price_snapshot); everything else comes from here.
 */
class PlanSnapshotService
{
    public function forPlan(ConnectionInterface $db, object $plan): array
    {
        $features = $db->table('plan_features')
            ->where('plan_id', $plan->id)
            ->orderBy('feature_id')
            ->get(['feature_id', 'is_enabled', 'numeric_limit', 'config_value'])
            ->map(fn ($f) => [
                'feature_id' => $f->feature_id,
                'is_enabled' => (bool) $f->is_enabled,
                'numeric_limit' => $f->numeric_limit !== null ? (float) $f->numeric_limit : null,
                'config_value' => is_string($f->config_value) ? json_decode($f->config_value, true) : $f->config_value,
            ])
            ->values()
            ->all();

        return [
            'max_users_snapshot' => $plan->max_users,
            'max_assets_snapshot' => $plan->max_assets,
            'max_sites_snapshot' => $plan->max_sites,
            'features_snapshot' => json_encode($features),
        ];
    }

    public function priceFor(object $plan, string $billingPeriod): mixed
    {
        return $billingPeriod === 'YEARLY'
            ? ($plan->annual_price ?? $plan->monthly_price * 12)
            : $plan->monthly_price;
    }
}
