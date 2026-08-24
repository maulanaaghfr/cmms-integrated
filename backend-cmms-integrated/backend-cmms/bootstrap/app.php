<?php

use App\Exceptions\ApiException;
use App\Http\Middleware\EnsurePlanFeature;
use App\Http\Middleware\EnsurePlatformAdmin;
use App\Http\Middleware\EnsureTenantAccess;
use App\Http\Middleware\EnsureTenantRole;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'platform.admin' => EnsurePlatformAdmin::class,
            'tenant.feature' => EnsurePlanFeature::class,
            'tenant.access' => EnsureTenantAccess::class,
            'tenant.role' => EnsureTenantRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request): bool => $request->is('api/*'));
        $exceptions->render(function (ApiException $exception, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error' => [
                    'code' => $exception->errorCode,
                    'message' => $exception->getMessage(),
                    'details' => (object) $exception->details,
                ],
            ], $exception->status);
        });
        $exceptions->render(function (ValidationException $exception, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error' => [
                    'code' => 'VALIDATION_FAILED',
                    'message' => 'The submitted data is invalid.',
                    'details' => $exception->errors(),
                ],
            ], 422);
        });
        $exceptions->render(function (HttpExceptionInterface $exception, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error' => [
                    'code' => match ($exception->getStatusCode()) {
                        401 => 'UNAUTHENTICATED',
                        403 => 'FORBIDDEN',
                        404 => 'RESOURCE_NOT_FOUND',
                        429 => 'TOO_MANY_REQUESTS',
                        default => 'HTTP_ERROR',
                    },
                    'message' => $exception->getMessage() ?: 'Request failed.',
                    'details' => (object) [],
                ],
            ], $exception->getStatusCode());
        });
    })->create();
