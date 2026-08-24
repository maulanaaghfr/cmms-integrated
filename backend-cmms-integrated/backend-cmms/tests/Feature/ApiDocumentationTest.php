<?php

namespace Tests\Feature;

use Tests\TestCase;

class ApiDocumentationTest extends TestCase
{
    public function test_swagger_ui_and_openapi_json_are_available_on_central_domain(): void
    {
        $this->get('http://localhost/api/documentation')
            ->assertOk()
            ->assertSee('SwaggerUIBundle', false);

        $this->getJson('http://localhost/api/documentation/openapi.json')
            ->assertOk()
            ->assertJsonPath('openapi', '3.1.0')
            ->assertJsonPath('info.title', 'AITOMA CMMS API')
            ->assertJsonStructure(['paths' => ['/api/v1/assets']]);
    }
}
