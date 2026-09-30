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

        $central = DB::connection(config('tenancy.database.central_connection'));
        $snapshot = isset($subscription->id)
            ? $central->table('subscriptions')->where('id', $subscription->id)->value('features_snapshot')
            : null;

        if ($snapshot !== null) {
            // Features frozen for the running billing period.
            $enabledIds = collect(json_decode((string) $snapshot, true) ?: [])
                ->where('is_enabled', true)->pluck('feature_id')->all();
            $enabled = $enabledIds !== [] && $central->table('features')
                ->whereIn('id', $enabledIds)->where('key', $featureKey)->where('is_active', true)->exists();
        } else {
            $enabled = $central->table('plan_features')
                ->join('features', 'features.id', '=', 'plan_features.feature_id')
                ->where('plan_features.plan_id', $subscription->plan_id)
                ->where('features.key', $featureKey)
                ->where('features.is_active', true)
                ->where('plan_features.is_enabled', true)
                ->exists();
        }
        if (! $enabled) {
            throw new ApiException('FEATURE_NOT_INCLUDED', 'This feature is not included in the active subscription.', 403, [
                'feature' => $featureKey,
            ]);
        }

        return $next($request);
    }
}
