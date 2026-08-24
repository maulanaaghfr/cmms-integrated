<?php

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Http\Controllers\Api\V1\SupportController;
use App\Services\TenantScope;
use Illuminate\Http\Request;
use Mockery;
use Tests\TestCase;

class ViewerReadOnlyTest extends TestCase
{
    public function test_viewer_cannot_mutate_attachments_or_comments_even_if_route_guard_is_bypassed(): void
    {
        $controller = new SupportController(Mockery::mock(TenantScope::class));

        foreach ([
            fn (Request $request) => $controller->uploadAttachment($request),
            fn (Request $request) => $controller->deleteAttachment($request, 'attachment-1'),
            fn (Request $request) => $controller->comments($request),
        ] as $mutation) {
            $request = Request::create('/api/v1/support', 'POST');
            $request->attributes->set('tenant_user', (object) ['id' => 'viewer-1', 'role_key' => 'VIEWER']);

            try {
                $mutation($request);
                $this->fail('Viewer unexpectedly performed a write operation.');
            } catch (ApiException $exception) {
                $this->assertSame('READ_ONLY_ROLE', $exception->errorCode);
                $this->assertSame(403, $exception->status);
            }
        }
    }
}
