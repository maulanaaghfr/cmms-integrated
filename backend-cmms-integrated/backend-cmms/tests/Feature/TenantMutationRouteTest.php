<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class TenantMutationRouteTest extends TestCase
{
    public function test_attachment_and_comment_mutations_exclude_viewer_role(): void
    {
        foreach ([
            ['POST', 'api/v1/attachments'],
            ['DELETE', 'api/v1/attachments/{attachment}'],
            ['POST', 'api/v1/comments'],
        ] as [$method, $uri]) {
            $route = collect(Route::getRoutes())->first(
                fn ($route) => $route->uri() === $uri && in_array($method, $route->methods(), true)
            );

            $this->assertNotNull($route);
            $this->assertContains(
                'tenant.role:COMPANY_ADMIN,MANAGER,SUPERVISOR,TECHNICIAN,OPERATOR',
                $route->gatherMiddleware()
            );
        }
    }
}
