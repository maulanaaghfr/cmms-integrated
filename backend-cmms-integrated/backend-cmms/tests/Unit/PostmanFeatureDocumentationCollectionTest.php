<?php

declare(strict_types=1);

namespace Tests\Unit;

use Tests\TestCase;

class PostmanFeatureDocumentationCollectionTest extends TestCase
{
    public function test_feature_documentation_collection_is_script_free_and_covers_every_v1_operation(): void
    {
        $path = base_path('docs/postman/AITOMA_CMMS_API_V1_BY_FEATURE.postman_collection.json');
        $this->assertFileExists($path);

        $collection = json_decode((string) file_get_contents($path), true);
        $this->assertSame(JSON_ERROR_NONE, json_last_error(), json_last_error_msg());
        $this->assertSame(
            'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
            $collection['info']['schema'] ?? null,
        );
        $this->assertSame('AITOMA CMMS API V1 - By Feature', $collection['info']['name'] ?? null);
        $this->assertCount(16, $collection['item'] ?? []);

        $requests = $this->flattenRequests($collection['item'] ?? []);
        $this->assertCount(123, $requests);

        foreach ($requests as $item) {
            $this->assertNotEmpty($item['name'] ?? null);
            $this->assertArrayNotHasKey('event', $item, "Documentation request must be script-free: {$item['name']}");
            $this->assertStringContainsString('API reference documentation', $item['request']['description'] ?? '');
            $this->assertStringContainsString('**Domain:**', $item['request']['description'] ?? '');
            $this->assertStringContainsString('**Access:**', $item['request']['description'] ?? '');
            $this->assertStringContainsString('**Plan entitlement:**', $item['request']['description'] ?? '');
        }

        $collectionVariableKeys = array_column($collection['variable'] ?? [], 'key');
        $this->assertNotContains('authToken', $collectionVariableKeys, 'authToken must come from the selected environment.');
        $this->assertNotContains('tenantBaseUrl', $collectionVariableKeys, 'tenantBaseUrl must come from the selected environment.');

        $routeOperations = [];
        foreach (app('router')->getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/v1/')) {
                continue;
            }
            foreach (array_diff($route->methods(), ['HEAD', 'OPTIONS']) as $method) {
                $routeOperations[] = $method.' '.$this->shape($route->uri());
            }
        }

        $postmanOperations = [];
        foreach ($requests as $item) {
            $url = $item['request']['url'] ?? '';
            if (! is_string($url) || (! str_starts_with($url, '{{centralBaseUrl}}/') && ! str_starts_with($url, '{{tenantBaseUrl}}/'))) {
                continue;
            }
            $postmanOperations[] = $item['request']['method'].' '.$this->shape($url);
        }

        $routeOperations = array_values(array_unique($routeOperations));
        $postmanOperations = array_values(array_unique($postmanOperations));
        sort($routeOperations);
        sort($postmanOperations);

        $this->assertCount(121, $postmanOperations);
        $this->assertSame($routeOperations, $postmanOperations);
    }

    private function flattenRequests(array $nodes): array
    {
        $requests = [];
        foreach ($nodes as $node) {
            if (isset($node['request'])) {
                $requests[] = $node;
            }
            if (isset($node['item']) && is_array($node['item'])) {
                array_push($requests, ...$this->flattenRequests($node['item']));
            }
        }

        return $requests;
    }

    private function shape(string $path): string
    {
        $path = preg_replace('#^api/v1/?#', '', $path);
        $path = preg_replace('#^\{\{(?:centralBaseUrl|tenantBaseUrl)\}\}/?#', '', $path);
        $path = explode('?', $path)[0];
        $path = preg_replace('/\{\{[^}]+\}\}/', '{}', $path);
        $path = preg_replace('/\{[^}]+\}/', '{}', $path);

        return trim($path, '/');
    }
}
