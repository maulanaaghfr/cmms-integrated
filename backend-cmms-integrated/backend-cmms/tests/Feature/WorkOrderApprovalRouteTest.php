<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class WorkOrderApprovalRouteTest extends TestCase
{
    public function test_manager_approval_routes_exist_and_claim_release_routes_are_removed(): void
    {
        $uris = collect(Route::getRoutes())->map(fn ($route) => $route->uri())->all();

        $this->assertContains('api/v1/requests/{maintenanceRequest}/approve', $uris);
        $this->assertContains('api/v1/requests/{maintenanceRequest}/reject', $uris);
        $this->assertContains('api/v1/work-orders/{workOrder}/approve', $uris);
        $this->assertContains('api/v1/work-orders/{workOrder}/reject', $uris);
        $this->assertNotContains('api/v1/work-orders/{workOrder}/claim', $uris);
        $this->assertNotContains('api/v1/work-orders/{workOrder}/release', $uris);
    }

    public function test_user_mutation_routes_exclude_supervisors(): void
    {
        foreach ([
            ['POST', 'api/v1/users'],
            ['PATCH', 'api/v1/users/{user}'],
        ] as [$method, $uri]) {
            $route = collect(Route::getRoutes())->first(
                fn ($route) => $route->uri() === $uri && in_array($method, $route->methods(), true)
            );

            $this->assertNotNull($route);
            $this->assertContains('tenant.role:COMPANY_ADMIN,MANAGER', $route->gatherMiddleware());
            $this->assertNotContains('tenant.role:COMPANY_ADMIN,MANAGER,SUPERVISOR', $route->gatherMiddleware());
        }
    }
}
