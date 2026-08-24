<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EnsureTenantAccess
{
    public function handle(Request $request, Closure $next, string $subscriptionRequired = 'true'): mixed
    {
        $user = $request->user();
        $tenant = tenant();
        if (! $user || ! $tenant) {
            throw new ApiException('TENANT_CONTEXT_REQUIRED', 'A valid tenant domain is required.', 403);
        }
        if ($user->must_change_password) {
            throw new ApiException('PASSWORD_CHANGE_REQUIRED', 'Change the temporary password before accessing tenant data.', 403);
        }
        if (! in_array($tenant->status, ['TRIAL', 'ACTIVE'], true)) {
            throw new ApiException('TENANT_INACTIVE', 'This tenant is suspended or closed.', 403);
        }

        $central = config('tenancy.database.central_connection');
        $membership = DB::connection($central)->table('tenant_memberships')
            ->where('tenant_id', $tenant->id)
            ->where('user_id', $user->id)
            ->where('status', 'ACTIVE')
            ->first();
        if (! $membership) {
            throw new ApiException('TENANT_MEMBERSHIP_REQUIRED', 'No active membership exists for this tenant.', 403);
        }

        $tenantUser = DB::table('tenant_users')
            ->where('central_membership_id', $membership->id)
            ->where('status', 'ACTIVE')
            ->first();
        if (! $tenantUser) {
            throw new ApiException('TENANT_USER_INACTIVE', 'The tenant user projection is missing or inactive.', 403);
        }

        if ($subscriptionRequired === 'true') {
            $subscription = DB::connection($central)->table('subscriptions')
                ->where('tenant_id', $tenant->id)
                ->whereIn('status', ['TRIAL', 'ACTIVE', 'GRACE'])
                ->orderByDesc('starts_at')
                ->first();
            if (! $subscription) {
                throw new ApiException('SUBSCRIPTION_REQUIRED', 'An active subscription is required.', 402);
            }
            $request->attributes->set('subscription', $subscription);
        }

        $request->attributes->set('tenant_membership', $membership);
        $request->attributes->set('tenant_user', $tenantUser);

        return $next($request);
    }
}
