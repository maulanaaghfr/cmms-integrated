<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use Illuminate\Support\Facades\DB;

class PlanLimitService
{
    public function enforce(string $resource): void
    {
        $central = config('tenancy.database.central_connection');
        $subscription = DB::connection($central)->table('subscriptions')
            ->join('plans', 'plans.id', '=', 'subscriptions.plan_id')
            ->where('subscriptions.tenant_id', tenant('id'))
            ->whereIn('subscriptions.status', ['TRIAL', 'ACTIVE', 'GRACE'])
            ->select('plans.max_users', 'plans.max_assets', 'plans.max_sites')
            ->first();
        if (! $subscription) {
            throw new ApiException('SUBSCRIPTION_REQUIRED', 'An active subscription is required.', 402);
        }

        // Resources without a plan-level cap are always allowed.
        $limitedResources = [
            'users' => ['max_users', 'tenant_users', 'users', 'status', 'ACTIVE'],
            'assets' => ['max_assets', 'assets', 'assets', 'is_active', true],
            'sites' => ['max_sites', 'sites', 'sites', 'is_active', true],
        ];

        if (! isset($limitedResources[$resource])) {
            return; // No cap defined for this resource type — allow.
        }

        [$column, $table, $label, $activeColumn, $activeValue] = $limitedResources[$resource];
        $limit = $subscription->{$column};
        if ($limit !== null && DB::table($table)->where($activeColumn, $activeValue)->count() >= $limit) {
            throw new ApiException('PLAN_LIMIT_REACHED', "The subscription limit for {$label} has been reached.", 409, [
                'resource' => $resource,
                'limit' => $limit,
            ]);
        }
    }
}
