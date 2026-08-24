<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EnsurePlanFeature
{
    public function handle(Request $request, Closure $next, string $featureKey): mixed
    {
        $subscription = $request->attributes->get('subscription');
        if (! $subscription) {
            throw new ApiException('SUBSCRIPTION_REQUIRED', 'An active subscription is required.', 402);
        }

        $enabled = DB::connection(config('tenancy.database.central_connection'))
            ->table('plan_features')
            ->join('features', 'features.id', '=', 'plan_features.feature_id')
            ->where('plan_features.plan_id', $subscription->plan_id)
            ->where('features.key', $featureKey)
            ->where('features.is_active', true)
            ->where('plan_features.is_enabled', true)
            ->exists();
        if (! $enabled) {
            throw new ApiException('FEATURE_NOT_INCLUDED', 'This feature is not included in the active subscription.', 403, [
                'feature' => $featureKey,
            ]);
        }

        return $next($request);
    }
}
