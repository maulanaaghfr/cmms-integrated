<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BillingController;
use App\Http\Controllers\Api\V1\OnboardingController;
use App\Http\Controllers\Api\V1\PlanController;
use App\Http\Controllers\Api\V1\PlatformController;
use App\Http\Controllers\Api\V1\PublicPlanController;
use Illuminate\Support\Facades\Route;

foreach (config('tenancy.central_domains') as $domain) {
    Route::domain($domain)->prefix('v1')->group(function (): void {
        Route::post('billing/providers/{provider}/callback', [BillingController::class, 'callback'])->middleware('throttle:120,1');
        Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
        Route::post('auth/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:3,10');
        Route::post('auth/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,10');
        Route::get('public/plans', [PublicPlanController::class, 'index'])->middleware('throttle:60,1');
        Route::get('public/plans/{plan}', [PublicPlanController::class, 'show'])->middleware('throttle:60,1');
        Route::post('onboarding/register', [OnboardingController::class, 'register'])->middleware('throttle:10,1');
        Route::post('onboarding/resend-verification', [OnboardingController::class, 'resendVerification'])->middleware('throttle:3,10');
        Route::post('onboarding/verify-email', [OnboardingController::class, 'verifyEmail'])->middleware('throttle:20,1');
        Route::middleware('auth:sanctum')->group(function (): void {
            Route::get('auth/me', [AuthController::class, 'me']);
            Route::put('auth/password', [AuthController::class, 'password']);
            Route::post('auth/logout', [AuthController::class, 'logout']);

            Route::get('onboarding/{onboarding}', [OnboardingController::class, 'show']);
            Route::patch('onboarding/{onboarding}', [OnboardingController::class, 'update']);
            Route::post('onboarding/{onboarding}/provision', [OnboardingController::class, 'provision']);
            Route::get('onboarding/{onboarding}/status', [OnboardingController::class, 'status']);
            Route::post('onboarding/{onboarding}/retry', [OnboardingController::class, 'retry']);
            Route::post('onboarding/{onboarding}/cancel', [OnboardingController::class, 'cancel']);

            Route::prefix('platform')->middleware('platform.admin')->group(function (): void {
                Route::get('tenants', [PlatformController::class, 'tenants']);
                Route::get('users', [PlatformController::class, 'users']);
                Route::get('revenue', [PlatformController::class, 'revenue']);
                Route::post('tenants', [PlatformController::class, 'createTenant']);
                Route::get('tenants/{tenant}', [PlatformController::class, 'tenant']);
                Route::patch('tenants/{tenant}', [PlatformController::class, 'updateTenant']);
                Route::post('tenants/{tenant}/retry-provisioning', [PlatformController::class, 'retryProvisioning']);
                Route::apiResource('plans', PlanController::class)->parameters(['plans' => 'plan']);
                Route::post('plans/{plan}/publish', [PlanController::class, 'publish']);
                Route::put('plans/{plan}/features', [PlanController::class, 'features']);
                Route::put('tenants/{tenant}/subscription', [PlanController::class, 'replaceSubscription']);
                Route::get('billing/providers/{provider}/config', [BillingController::class, 'providerConfig']);
                Route::put('billing/providers/{provider}/config', [BillingController::class, 'upsertProviderConfig']);
                Route::get('billing/providers/{provider}/channels', [BillingController::class, 'providerChannels']);
                Route::put('billing/providers/{provider}/channels/{channelKey}', [BillingController::class, 'upsertProviderChannel']);
                Route::post('payments/{payment}/confirm', [BillingController::class, 'manualConfirm']);
                Route::get('audit-logs', [PlanController::class, 'audits']);
            });
        });
    });
}
