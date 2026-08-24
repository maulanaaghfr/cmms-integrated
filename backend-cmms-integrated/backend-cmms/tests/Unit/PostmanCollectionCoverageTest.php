<?php

declare(strict_types=1);

namespace Tests\Unit;

use Tests\TestCase;

class PostmanCollectionCoverageTest extends TestCase
{
    public function test_postman_files_are_valid_and_cover_every_v1_route_operation(): void
    {
        $collection = $this->decodeJson(base_path('docs/postman/AITOMA_CMMS_API_V1.postman_collection.json'));
        $environment = $this->decodeJson(base_path('docs/postman/AITOMA_CMMS_LOCAL.postman_environment.json'));

        $this->assertSame(
            'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
            $collection['info']['schema'] ?? null,
        );
        $this->assertSame('environment', $environment['_postman_variable_scope'] ?? null);
        $this->assertSame('AITOMA CMMS - Local Development', $environment['name'] ?? null);

        $requests = $this->flattenRequests($collection['item'] ?? []);
        $this->assertCount(10, $collection['item']);
        $this->assertGreaterThanOrEqual(121, count($requests));

        foreach ($requests as $item) {
            $this->assertNotEmpty($item['name'] ?? null);
            $this->assertNotEmpty($item['request']['method'] ?? null, $item['name']);
            $this->assertNotEmpty($item['request']['url'] ?? null, $item['name']);
            $listeners = array_column($item['event'] ?? [], 'listen');
            $this->assertContains('test', $listeners, "Missing Postman test script: {$item['name']}");
        }

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
            $url = $item['request']['url'];
            if (! is_string($url) || (! str_starts_with($url, '{{centralBaseUrl}}/') && ! str_starts_with($url, '{{tenantBaseUrl}}/'))) {
                continue;
            }
            $postmanOperations[] = $item['request']['method'].' '.$this->shape($url);
        }

        $routeOperations = array_values(array_unique($routeOperations));
        $postmanOperations = array_values(array_unique($postmanOperations));
        sort($routeOperations);
        sort($postmanOperations);

        $this->assertCount(121, $routeOperations);
        $this->assertSame($routeOperations, $postmanOperations, 'Postman collection and Laravel V1 routes differ.');

        $environmentKeys = array_column($environment['values'] ?? [], 'key');
        foreach (['appBaseUrl', 'centralBaseUrl', 'tenantBaseUrl', 'authToken', 'loginEmail', 'loginPassword', 'superAdminEmail', 'superAdminPassword', 'tenantScheme', 'tenantPort'] as $key) {
            $this->assertContains($key, $environmentKeys);
        }
        foreach ($environment['values'] ?? [] as $variable) {
            $this->assertNotEmpty($variable['description'] ?? null, "Missing environment variable description: {$variable['key']}");
        }
        foreach ($collection['item'] as $folder) {
            $this->assertNotEmpty($folder['description'] ?? null, "Missing Happy Flow folder description: {$folder['name']}");
        }
    }

    private function decodeJson(string $path): array
    {
        $this->assertFileExists($path);
        $decoded = json_decode((string) file_get_contents($path), true);
        $this->assertSame(JSON_ERROR_NONE, json_last_error(), "Invalid JSON in {$path}: ".json_last_error_msg());
        $this->assertIsArray($decoded);

        return $decoded;
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
