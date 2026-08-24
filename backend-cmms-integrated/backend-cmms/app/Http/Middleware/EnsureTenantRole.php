<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;

class EnsureTenantRole
{
    public function handle(Request $request, Closure $next, string ...$roles): mixed
    {
        $role = $request->attributes->get('tenant_user')?->role_key;
        if (! in_array($role, $roles, true)) {
            throw new ApiException('ROLE_FORBIDDEN', 'Your tenant role cannot perform this action.', 403);
        }

        return $next($request);
    }
}
