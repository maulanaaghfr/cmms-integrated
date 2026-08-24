<?php

use App\Http\Controllers\ApiDocumentationController;
use Illuminate\Support\Facades\Route;

foreach (config('tenancy.central_domains') as $domain) {
    Route::domain($domain)->group(function (): void {
        Route::get('/api/documentation', [ApiDocumentationController::class, 'ui']);
        Route::get('/api/documentation/openapi.json', [ApiDocumentationController::class, 'specification']);
        Route::get('/', fn () => response()->json([
            'application' => config('app.name'),
            'context' => 'central',
            'status' => 'ok',
        ]));
    });
}
