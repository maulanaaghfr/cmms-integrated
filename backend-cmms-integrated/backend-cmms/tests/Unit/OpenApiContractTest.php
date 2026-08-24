<?php

namespace Tests\Unit;

use App\Support\OpenApiDocument;
use Tests\TestCase;

class OpenApiContractTest extends TestCase
{
    public function test_every_v1_api_route_is_present_in_openapi_document(): void
    {
        $document = app(OpenApiDocument::class)->build();
        $this->assertSame('3.1.0', $document['openapi']);
        $operations = 0;
        foreach ($document['paths'] as $methods) {
            $operations += count($methods);
        }
        $this->assertGreaterThanOrEqual(75, $operations);

        foreach (app('router')->getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/v1/')) {
                continue;
            }
            $path = '/'.preg_replace('/\{([^}]+)\?\}/', '{$1}', $route->uri());
            foreach (array_diff($route->methods(), ['HEAD', 'OPTIONS']) as $method) {
                $this->assertArrayHasKey(strtolower($method), $document['paths'][$path], "Missing {$method} {$path}");
            }
        }

        $this->assertArrayHasKey('security', $document['paths']['/api/v1/platform/billing/providers/{provider}/config']['put']);
        $this->assertArrayNotHasKey('security', $document['paths']['/api/v1/billing/providers/{provider}/callback']['post']);
        $this->assertArrayNotHasKey('requestBody', $document['paths']['/api/v1/billing/payments/{payment}/check-status']['post']);
        $this->assertArrayHasKey('204', $document['paths']['/api/v1/assets/{asset}']['delete']['responses']);
        $this->assertSame('tenant', $document['paths']['/api/v1/work-orders']['get']['x-api-context']);
        $this->assertSame('core.work_orders', $document['paths']['/api/v1/work-orders']['get']['x-required-feature']);
        $this->assertSame(['COMPANY_ADMIN'], $document['paths']['/api/v1/sites']['post']['x-required-roles']);
        $this->assertTrue($document['paths']['/api/v1/work-orders']['get']['x-site-scoped']);
        $this->assertArrayHasKey('example', $document['paths']['/api/v1/onboarding/register']['post']['requestBody']['content']['application/json']);
        $this->assertContains('per_page', array_column($document['paths']['/api/v1/work-orders']['get']['parameters'], 'name'));
        $this->assertSame('#/components/schemas/PaginatedResponse', $document['paths']['/api/v1/work-orders']['get']['responses']['200']['content']['application/json']['schema']['$ref']);
    }
}
