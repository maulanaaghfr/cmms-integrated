<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;

class EnsurePlatformAdmin
{
    public function handle(Request $request, Closure $next): mixed
    {
        if ($request->user()?->platform_role !== 'SUPER_ADMIN') {
            throw new ApiException('PLATFORM_ADMIN_REQUIRED', 'Super Admin access is required.', 403);
        }

        return $next($request);
    }
}
