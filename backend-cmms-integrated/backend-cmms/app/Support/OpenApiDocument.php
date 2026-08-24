<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use Illuminate\Support\Str;

final class OpenApiDocument
{
    public function build(): array
    {
        $paths = [];
        foreach (RouteFacade::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/v1/')) {
                continue;
            }
            $path = '/'.preg_replace('/\{([^}]+)\?\}/', '{$1}', $route->uri());
            foreach (array_diff($route->methods(), ['HEAD', 'OPTIONS']) as $method) {
                $method = strtolower($method);
                if (isset($paths[$path][$method])) {
                    continue;
                }
                $action = class_basename((string) $route->getActionName());
                $context = $this->context($path);
                $public = $path === '/api/v1/auth/login'
                    || $path === '/api/v1/billing/providers/{provider}/callback'
                    || str_starts_with($path, '/api/v1/public/')
                    || in_array($path, [
                        '/api/v1/onboarding/register',
                        '/api/v1/onboarding/resend-verification',
                        '/api/v1/onboarding/verify-email',
                    ], true);
                $successStatus = $this->successStatus($method, $path);
                $successResponse = ['description' => $successStatus === 204 ? 'Successful response with no content' : 'Successful response'];
                if ($path === '/api/v1/attachments/{attachment}/download') {
                    $successResponse['content'] = ['application/octet-stream' => ['schema' => ['type' => 'string', 'format' => 'binary']]];
                } elseif ($successStatus !== 204) {
                    $successResponse['content'] = ['application/json' => ['schema' => ['$ref' => $this->isPaginated($path) ? '#/components/schemas/PaginatedResponse' : '#/components/schemas/DataResponse']]];
                }
                $operation = [
                    'tags' => [$this->tag($path)],
                    'summary' => $this->summary($action, $method),
                    'description' => $this->description($route, $path, $context, $public),
                    'operationId' => Str::camel(str_replace(['/', '{', '}', '-'], ['_', '', '', '_'], $method.'_'.$path)),
                    'servers' => [$this->operationServer($context)],
                    'parameters' => [...$this->parameters($route), ...$this->queryParameters($method, $path)],
                    'responses' => [
                        (string) $successStatus => $successResponse,
                        '401' => ['$ref' => '#/components/responses/Unauthenticated'],
                        '403' => ['$ref' => '#/components/responses/Forbidden'],
                        '404' => ['$ref' => '#/components/responses/NotFound'],
                        '409' => ['$ref' => '#/components/responses/Conflict'],
                        '422' => ['$ref' => '#/components/responses/ValidationFailed'],
                        '429' => ['$ref' => '#/components/responses/TooManyRequests'],
                        '500' => ['$ref' => '#/components/responses/ServerError'],
                    ],
                    'x-api-context' => $context,
                ];
                if ($context === 'tenant') {
                    $operation['responses']['402'] = ['$ref' => '#/components/responses/PaymentRequired'];
                    $operation['x-site-scoped'] = true;
                }
                if ($method === 'put' && (str_contains($path, '/platform/billing/providers/{provider}/config') || str_contains($path, '/platform/billing/providers/{provider}/channels/'))) {
                    $operation['responses']['201'] = $successResponse;
                }
                if ($roles = $this->roles($route, $path, $public)) {
                    $operation['x-required-roles'] = $roles;
                }
                if ($feature = $this->feature($route)) {
                    $operation['x-required-feature'] = $feature;
                }
                if (! $public) {
                    $operation['security'] = [['bearerAuth' => []]];
                }
                if ($this->hasRequestBody($method, $path)) {
                    $operation['requestBody'] = $this->requestBody($method, $path);
                }
                $paths[$path][$method] = $operation;
            }
        }
        ksort($paths);

        return [
            'openapi' => '3.1.0',
            'info' => ['title' => 'AITOMA CMMS API', 'version' => '1.0.0', 'description' => "AITOMA CMMS MVP API. Authentication, onboarding, and platform administration use the central domain. Company operations use the tenant domain and isolated tenant database.\n\nSuccess responses use `data`; paginated responses also use `meta` and `links`; failures use `error.code`, `error.message`, and `error.details`. See `docs/FRONTEND_BACKEND_HANDOFF.md` for the frontend integration contract."],
            'servers' => [
                ['url' => rtrim(config('app.url'), '/'), 'description' => 'Central API'],
                ['url' => '{scheme}://{tenantDomain}', 'description' => 'Tenant API', 'variables' => ['scheme' => ['default' => 'http', 'enum' => ['http', 'https']], 'tenantDomain' => ['default' => 'demo.localhost:8000']]],
            ],
            'tags' => $this->tags(),
            'paths' => $paths,
            'components' => [
                'securitySchemes' => ['bearerAuth' => ['type' => 'http', 'scheme' => 'bearer', 'bearerFormat' => 'Laravel Sanctum token', 'description' => 'Use the token returned by central login on both central and tenant requests.']],
                'schemas' => [
                    'DataResponse' => ['type' => 'object', 'properties' => ['data' => ['description' => 'Resource, collection, or action result']]],
                    'PaginatedResponse' => ['type' => 'object', 'required' => ['data', 'meta', 'links'], 'properties' => [
                        'data' => ['type' => 'array', 'items' => []],
                        'meta' => ['type' => 'object', 'properties' => ['current_page' => ['type' => 'integer'], 'last_page' => ['type' => 'integer'], 'per_page' => ['type' => 'integer'], 'total' => ['type' => 'integer']]],
                        'links' => ['type' => 'object', 'properties' => ['first' => ['type' => 'string'], 'last' => ['type' => 'string'], 'prev' => ['type' => ['string', 'null']], 'next' => ['type' => ['string', 'null']]]],
                    ]],
                    'ErrorResponse' => ['type' => 'object', 'required' => ['error'], 'properties' => ['error' => ['type' => 'object', 'required' => ['code', 'message', 'details'], 'properties' => ['code' => ['type' => 'string', 'example' => 'VALIDATION_FAILED'], 'message' => ['type' => 'string'], 'details' => ['type' => 'object', 'additionalProperties' => true]]]]],
                ],
                'responses' => [
                    'Unauthenticated' => $this->errorResponse('Authentication is required.'),
                    'Forbidden' => $this->errorResponse('The authenticated user is not authorized.'),
                    'NotFound' => $this->errorResponse('The resource does not exist in the current tenant scope.'),
                    'Conflict' => $this->errorResponse('The operation conflicts with the current resource state.'),
                    'ValidationFailed' => $this->errorResponse('The submitted data is invalid.'),
                    'PaymentRequired' => $this->errorResponse('An active subscription is required.'),
                    'TooManyRequests' => $this->errorResponse('The endpoint rate limit was exceeded.'),
                    'ServerError' => $this->errorResponse('The server or an external provider could not complete the request.'),
                ],
            ],
        ];
    }

    private function parameters(Route $route): array
    {
        return array_map(function ($parameter): array {
            $namedKey = str_contains(strtolower($parameter), 'provider') || str_ends_with(strtolower($parameter), 'key');

            return ['name' => $parameter, 'in' => 'path', 'required' => true, 'schema' => ['type' => 'string', 'example' => $namedKey ? (str_contains(strtolower($parameter), 'provider') ? 'DUITKU' : 'VC') : '01ARZ3NDEKTSV4RRFFQ69G5FAV']];
        }, $route->parameterNames());
    }

    private function requestBody(string $method, string $path): array
    {
        if ($path === '/api/v1/auth/login') {
            return ['required' => true, 'content' => ['application/json' => ['schema' => ['type' => 'object', 'required' => ['email', 'password'], 'properties' => ['email' => ['type' => 'string', 'format' => 'email'], 'password' => ['type' => 'string', 'format' => 'password'], 'device_name' => ['type' => 'string']]]]]];
        }
        if ($path === '/api/v1/attachments') {
            return ['required' => true, 'content' => ['multipart/form-data' => ['schema' => ['type' => 'object', 'required' => ['entity_type', 'entity_id', 'media_role', 'file'], 'properties' => ['entity_type' => ['type' => 'string', 'enum' => ['REQUEST', 'WORK_ORDER']], 'entity_id' => ['type' => 'string'], 'media_role' => ['type' => 'string', 'enum' => ['REQUEST', 'BEFORE', 'AFTER', 'OTHER']], 'file' => ['type' => 'string', 'format' => 'binary']]]]]];
        }

        $example = $this->requestExample($method, $path);

        return ['required' => true, 'content' => ['application/json' => [
            'schema' => ['type' => 'object', 'additionalProperties' => true],
            ...($example === null ? [] : ['example' => $example]),
        ]]];
    }

    private function hasRequestBody(string $method, string $path): bool
    {
        if (! in_array($method, ['post', 'put', 'patch'], true)) {
            return false;
        }

        return ! preg_match('#/(logout|acknowledge|start|resume|verify|read|read-all|check-status)$#', $path);
    }

    private function requestExample(string $method, string $path): ?array
    {
        $key = strtoupper($method).' '.$path;
        $ulid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

        return match ($key) {
            'PUT /api/v1/auth/password' => ['current_password' => 'CurrentPass123', 'password' => 'NewPassword123', 'password_confirmation' => 'NewPassword123'],
            'POST /api/v1/onboarding/register' => ['full_name' => 'Budi Santoso', 'email' => 'budi@example.com', 'phone' => '+628123456789', 'password' => 'SecurePass123', 'password_confirmation' => 'SecurePass123', 'company' => ['name' => 'PT Makmur Sejahtera', 'email' => 'office@example.com', 'phone' => '+62311234567', 'industry' => 'Food & Beverage', 'timezone' => 'Asia/Jakarta', 'requested_slug' => 'makmur-sejahtera'], 'plan_id' => $ulid, 'billing_period' => 'MONTHLY', 'terms_accepted' => true, 'privacy_accepted' => true],
            'POST /api/v1/onboarding/resend-verification' => ['email' => 'budi@example.com'],
            'POST /api/v1/onboarding/verify-email' => ['token' => 'token-from-verification-email'],
            'PATCH /api/v1/onboarding/{onboarding}' => ['industry' => 'Food & Beverage', 'timezone' => 'Asia/Jakarta'],
            'POST /api/v1/platform/tenants' => ['code' => 'ACME', 'name' => 'PT ACME', 'domain' => 'acme.localhost', 'email' => 'office@acme.test', 'industry' => 'Manufacturing', 'timezone' => 'Asia/Jakarta', 'admin' => ['full_name' => 'Company Admin', 'email' => 'admin@acme.test', 'temporary_password' => 'ChangeMe123'], 'plan_id' => $ulid, 'trial_days' => 30],
            'PATCH /api/v1/platform/tenants/{tenant}' => ['name' => 'PT ACME Indonesia', 'status' => 'ACTIVE'],
            'POST /api/v1/platform/plans' => ['key' => 'PROFESSIONAL', 'version_number' => 2, 'name' => 'Professional', 'description' => 'Professional CMMS package', 'monthly_price' => 1500000, 'annual_price' => 15000000, 'currency_code' => 'IDR', 'max_users' => 50, 'max_assets' => 1000, 'max_sites' => 5, 'is_public' => true],
            'PUT /api/v1/platform/plans/{plan}', 'PATCH /api/v1/platform/plans/{plan}' => ['name' => 'Professional', 'monthly_price' => 1500000, 'is_public' => true],
            'PUT /api/v1/platform/plans/{plan}/features' => ['features' => [['feature_id' => $ulid, 'is_enabled' => true, 'numeric_limit' => null, 'config_value' => null]]],
            'PUT /api/v1/platform/tenants/{tenant}/subscription' => ['plan_id' => $ulid, 'status' => 'ACTIVE', 'billing_period' => 'MONTHLY', 'current_period_end' => '2026-09-09T00:00:00Z'],
            'PUT /api/v1/platform/billing/providers/{provider}/config' => ['environment' => 'SANDBOX', 'merchant_identifier' => 'DXXXX', 'secret_reference' => 'env:DUITKU_API_KEY', 'callback_base_url' => 'https://api.example.com', 'return_base_url' => 'https://app.example.com/billing', 'settings' => ['transaction_url' => 'https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry', 'status_url' => 'https://sandbox.duitku.com/webapi/api/merchant/transactionStatus'], 'is_active' => true],
            'PUT /api/v1/platform/billing/providers/{provider}/channels/{channelKey}' => ['name' => 'QRIS', 'channel_type' => 'QRIS', 'bank_code' => null, 'minimum_amount' => 10000, 'maximum_amount' => 10000000, 'is_active' => true],
            'POST /api/v1/platform/payments/{payment}/confirm' => ['note' => 'Payment verified manually by finance.'],
            'POST /api/v1/sites' => ['code' => 'PLANT-01', 'name' => 'Main Plant', 'address' => 'Surabaya', 'timezone' => 'Asia/Jakarta'],
            'PATCH /api/v1/sites/{site}' => ['name' => 'Main Production Plant'],
            'POST /api/v1/locations' => ['site_id' => $ulid, 'parent_location_id' => null, 'code' => 'LINE-01', 'name' => 'Production Line 1', 'location_type' => 'LINE'],
            'PATCH /api/v1/locations/{location}' => ['description' => 'Primary packaging line'],
            'POST /api/v1/users' => ['email' => 'technician@example.com', 'full_name' => 'Technician One', 'employee_code' => 'TECH-001', 'role_key' => 'TECHNICIAN', 'primary_site_id' => $ulid, 'temporary_password' => 'ChangeMe123'],
            'PATCH /api/v1/users/{user}' => ['phone' => '+628123456789', 'status' => 'ACTIVE'],
            'POST /api/v1/teams' => ['site_id' => $ulid, 'code' => 'MECH-01', 'name' => 'Mechanical Team', 'supervisor_user_id' => $ulid],
            'PATCH /api/v1/teams/{team}' => ['name' => 'Rotating Equipment Team'],
            'POST /api/v1/teams/{team}/members' => ['tenant_user_id' => $ulid, 'member_type' => 'MEMBER'],
            'POST /api/v1/asset-categories' => ['code' => 'ROTATING', 'name' => 'Rotating Equipment', 'description' => 'Pumps, motors, and gearboxes'],
            'PATCH /api/v1/asset-categories/{category}' => ['description' => 'Rotating production equipment'],
            'POST /api/v1/assets' => ['site_id' => $ulid, 'location_id' => $ulid, 'asset_category_id' => $ulid, 'code' => 'PUMP-001', 'name' => 'Transfer Pump', 'status' => 'OPERATIONAL', 'criticality' => 'HIGH', 'request_approval_required' => false],
            'PATCH /api/v1/assets/{asset}' => ['status' => 'UNDER_MAINTENANCE'],
            'POST /api/v1/assets/{asset}/operators' => ['tenant_user_id' => $ulid, 'assignment_type' => 'PRIMARY'],
            'POST /api/v1/requests' => ['asset_id' => $ulid, 'title' => 'Seal leakage', 'description' => 'Operator observed a small seal leak.', 'priority' => 'HIGH', 'due_at' => '2026-08-16T10:00:00Z'],
            'POST /api/v1/requests/{maintenanceRequest}/approve' => ['note' => 'Approved for execution', 'due_at' => '2026-08-16T10:00:00Z'],
            'POST /api/v1/requests/{maintenanceRequest}/reject', 'POST /api/v1/requests/{maintenanceRequest}/cancel' => ['reason' => 'Duplicate request'],
            'POST /api/v1/work-orders' => ['asset_id' => $ulid, 'title' => 'Replace pump seal', 'description' => 'Replace seal and inspect coupling.', 'priority' => 'HIGH', 'due_at' => '2026-08-16T10:00:00Z'],
            'PATCH /api/v1/work-orders/{workOrder}' => ['title' => 'Replace mechanical seal', 'priority' => 'CRITICAL'],
            'POST /api/v1/work-orders/{workOrder}/approve' => ['note' => 'Approved'],
            'POST /api/v1/work-orders/{workOrder}/assign' => ['team_id' => $ulid, 'assignee_id' => $ulid],
            'POST /api/v1/work-orders/{workOrder}/reject', 'POST /api/v1/work-orders/{workOrder}/hold', 'POST /api/v1/work-orders/{workOrder}/reject-completion', 'POST /api/v1/work-orders/{workOrder}/cancel' => ['reason' => 'Operational reason'],
            'POST /api/v1/work-orders/{workOrder}/complete' => ['completion_note' => 'Seal replaced and tested.'],
            'POST /api/v1/work-orders/{workOrder}/timer/start', 'POST /api/v1/work-orders/{workOrder}/timer/stop' => ['notes' => 'On-site maintenance work'],
            'POST /api/v1/comments' => ['entity_type' => 'WORK_ORDER', 'entity_id' => $ulid, 'body' => 'Spare part has arrived.'],
            'POST /api/v1/pm/templates' => ['site_id' => $ulid, 'code' => 'PM-PUMP', 'name' => 'Pump Inspection', 'priority' => 'MEDIUM', 'estimated_duration_minutes' => 60, 'work_instructions' => 'Inspect vibration, temperature, and lubrication.', 'status' => 'ACTIVE'],
            'PATCH /api/v1/pm/templates/{template}' => ['estimated_duration_minutes' => 75],
            'POST /api/v1/pm/schedules' => ['pm_template_id' => $ulid, 'site_id' => $ulid, 'asset_id' => $ulid, 'code' => 'PM-PUMP-WEEKLY', 'name' => 'Weekly Pump Inspection', 'schedule_mode' => 'FIXED', 'generation_lead_minutes' => 60, 'open_occurrence_policy' => 'HOLD_NEXT', 'timezone' => 'Asia/Jakarta', 'start_date' => '2026-08-10', 'status' => 'ACTIVE', 'trigger' => ['interval_unit' => 'WEEK', 'interval_value' => 1, 'fixed_local_time' => '08:00']],
            'PATCH /api/v1/pm/schedules/{schedule}' => ['trigger' => ['interval_unit' => 'WEEK', 'interval_value' => 2, 'fixed_local_time' => '08:00']],
            'POST /api/v1/pm/schedules/{schedule}/pause' => ['reason' => 'Asset shutdown'],
            'POST /api/v1/billing/invoices/{invoice}/payments' => ['payment_channel_id' => $ulid, 'idempotency_key' => 'frontend-payment-unique-001'],
            'POST /api/v1/billing/providers/{provider}/callback' => ['merchantOrderId' => 'PAY-REFERENCE', 'amount' => 1500000, 'resultCode' => '00', 'signature' => 'provider-generated-signature'],
            default => null,
        };
    }

    private function successStatus(string $method, string $path): int
    {
        if ($method === 'delete') {
            return 204;
        }
        if ($method === 'put' && str_contains($path, '/platform/tenants/{tenant}/subscription')) {
            return 201;
        }
        if ($method !== 'post') {
            return 200;
        }
        if (in_array($path, [
            '/api/v1/onboarding/register',
            '/api/v1/onboarding/resend-verification',
            '/api/v1/onboarding/{onboarding}/provision',
            '/api/v1/onboarding/{onboarding}/retry',
        ], true)) {
            return 202;
        }
        foreach ([
            '#^/api/v1/platform/(tenants|plans)$#', '#^/api/v1/(sites|locations|users|teams|asset-categories|assets|requests|work-orders|attachments|comments)$#',
            '#^/api/v1/pm/(templates|schedules)$#', '#^/api/v1/billing/invoices/\{invoice\}/payments$#',
        ] as $pattern) {
            if (preg_match($pattern, $path)) {
                return 201;
            }
        }

        return 200;
    }

    private function context(string $path): string
    {
        return match (true) {
            str_starts_with($path, '/api/v1/auth/'),
            str_starts_with($path, '/api/v1/public/'),
            str_starts_with($path, '/api/v1/onboarding/'),
            str_starts_with($path, '/api/v1/platform/'),
            $path === '/api/v1/billing/providers/{provider}/callback' => 'central',
            default => 'tenant',
        };
    }

    private function operationServer(string $context): array
    {
        if ($context === 'central') {
            return ['url' => rtrim(config('app.url'), '/'), 'description' => 'Central API'];
        }

        return ['url' => '{scheme}://{tenantDomain}', 'description' => 'Tenant API', 'variables' => [
            'scheme' => ['default' => 'http', 'enum' => ['http', 'https']],
            'tenantDomain' => ['default' => 'demo.localhost:8000'],
        ]];
    }

    private function roles(Route $route, string $path, bool $public): array
    {
        if ($public) {
            return [];
        }
        if (str_starts_with($path, '/api/v1/platform/')) {
            return ['SUPER_ADMIN'];
        }
        if (str_starts_with($path, '/api/v1/onboarding/')) {
            return ['ONBOARDING_OWNER'];
        }

        foreach ($route->gatherMiddleware() as $middleware) {
            if (is_string($middleware) && str_starts_with($middleware, 'tenant.role:')) {
                return explode(',', Str::after($middleware, 'tenant.role:'));
            }
        }

        return $this->context($path) === 'tenant' ? ['AUTHENTICATED_TENANT_MEMBER'] : ['AUTHENTICATED_USER'];
    }

    private function feature(Route $route): ?string
    {
        foreach ($route->gatherMiddleware() as $middleware) {
            if (is_string($middleware) && str_starts_with($middleware, 'tenant.feature:')) {
                return Str::after($middleware, 'tenant.feature:');
            }
        }

        return null;
    }

    private function description(Route $route, string $path, string $context, bool $public): string
    {
        $parts = [
            '**Domain:** '.($context === 'central' ? 'central domain' : 'tenant-specific domain and isolated tenant database').'.',
            '**Authentication:** '.($public ? 'public endpoint' : 'Bearer token issued by central login').'.',
        ];
        if ($roles = $this->roles($route, $path, $public)) {
            $parts[] = '**Access:** '.implode(', ', $roles).'. Controller policies can further restrict ownership, assignment, state, and site scope.';
        }
        if ($feature = $this->feature($route)) {
            $parts[] = '**Plan feature:** `'.$feature.'` must be enabled.';
        }
        if ($context === 'tenant') {
            $parts[] = '**Visibility:** use the returned records as the source of truth; tenant and site scoping is enforced by the backend.';
        }

        return implode("\n\n", $parts);
    }

    private function queryParameters(string $method, string $path): array
    {
        if ($method !== 'get') {
            return [];
        }

        $parameters = [];
        $add = function (string $name, array $schema, string $description) use (&$parameters): void {
            $parameters[$name] = compact('name', 'schema', 'description') + ['in' => 'query', 'required' => false];
        };

        if (in_array($path, ['/api/v1/platform/tenants', '/api/v1/platform/plans', '/api/v1/platform/audit-logs', '/api/v1/sites', '/api/v1/locations', '/api/v1/users', '/api/v1/teams', '/api/v1/asset-categories', '/api/v1/assets', '/api/v1/requests', '/api/v1/work-orders', '/api/v1/notifications', '/api/v1/pm/templates', '/api/v1/pm/schedules', '/api/v1/pm/occurrences', '/api/v1/billing/invoices'], true)) {
            $add('per_page', ['type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'default' => 20], 'Number of records per page.');
            $add('page', ['type' => 'integer', 'minimum' => 1, 'default' => 1], 'Requested page number.');
        }
        if ($path === '/api/v1/platform/tenants') {
            $add('search', ['type' => 'string'], 'Search company name or code.');
        }
        if ($path === '/api/v1/platform/audit-logs') {
            $add('tenant_id', ['type' => 'string'], 'Filter audit logs by tenant ULID.');
        }
        if (in_array($path, ['/api/v1/sites', '/api/v1/locations', '/api/v1/teams', '/api/v1/asset-categories', '/api/v1/assets'], true)) {
            $add('include_archived', ['type' => 'boolean', 'default' => false], 'Include archived records.');
        }
        if (in_array($path, ['/api/v1/locations', '/api/v1/teams', '/api/v1/assets'], true)) {
            $add('site_id', ['type' => 'string'], 'Filter by a permitted site ULID.');
        }
        if ($path === '/api/v1/users') {
            $add('role', ['type' => 'string', 'enum' => array_keys(ReferenceData::roles())], 'Filter by company role.');
            $add('status', ['type' => 'string'], 'Filter by tenant-user status.');
        }
        if (in_array($path, ['/api/v1/requests', '/api/v1/work-orders', '/api/v1/pm/schedules', '/api/v1/pm/occurrences'], true)) {
            $add('status', ['type' => 'string'], 'Filter by workflow status.');
        }
        if ($path === '/api/v1/assets') {
            $add('criticality', ['type' => 'string', 'enum' => ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']], 'Filter by asset criticality.');
        }
        if ($path === '/api/v1/work-orders') {
            $add('priority', ['type' => 'string', 'enum' => ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']], 'Filter by priority.');
            $add('assignee_id', ['type' => 'string'], 'Filter by assigned technician ULID.');
        }
        if ($path === '/api/v1/notifications') {
            $add('unread_only', ['type' => 'boolean', 'default' => false], 'Return only unread notifications.');
        }

        return array_values($parameters);
    }

    private function tag(string $path): string
    {
        return match (true) {
            str_contains($path, '/auth/') => 'Authentication',
            str_contains($path, '/onboarding/') || str_contains($path, '/public/plans') => 'Onboarding',
            str_contains($path, '/platform/plans') => 'Plans & Features',
            str_contains($path, '/platform/tenants') => 'Tenant Provisioning',
            str_contains($path, '/platform/audit') => 'Platform Audit',
            str_contains($path, '/assets') || str_contains($path, '/asset-categories') => 'Assets',
            str_contains($path, '/requests') => 'Maintenance Requests', str_contains($path, '/work-orders') => 'Work Orders',
            str_contains($path, '/pm/') => 'Preventive Maintenance', str_contains($path, '/billing/') || str_contains($path, '/platform/payments/') => 'Billing',
            str_contains($path, '/attachments') || str_contains($path, '/comments') => 'Collaboration',
            str_contains($path, '/notifications') || str_contains($path, '/dashboard') => 'Notifications & Dashboard',
            str_contains($path, '/users') => 'Company Users', str_contains($path, '/teams') => 'Maintenance Teams',
            default => 'Sites & Locations',
        };
    }

    private function isPaginated(string $path): bool
    {
        return in_array($path, ['/api/v1/platform/tenants', '/api/v1/platform/plans', '/api/v1/platform/audit-logs', '/api/v1/sites', '/api/v1/locations', '/api/v1/users', '/api/v1/teams', '/api/v1/asset-categories', '/api/v1/assets', '/api/v1/requests', '/api/v1/work-orders', '/api/v1/notifications', '/api/v1/pm/templates', '/api/v1/pm/schedules', '/api/v1/pm/occurrences', '/api/v1/billing/invoices'], true);
    }

    private function tags(): array
    {
        $tags = [
            'Authentication' => 'Central login, identity, password changes, and logout.',
            'Onboarding' => 'Public plans, registration, verification, trial provisioning, and status polling.',
            'Plans & Features' => 'Super Admin plan drafts, entitlements, and publication.',
            'Tenant Provisioning' => 'Super Admin company provisioning and subscription replacement.',
            'Company Users' => 'Company users and tenant role assignment.',
            'Sites & Locations' => 'Site and physical location hierarchy.',
            'Maintenance Teams' => 'Maintenance teams and membership.',
            'Assets' => 'Asset master data and operator assignment.',
            'Maintenance Requests' => 'Maintenance reports and Manager approval.',
            'Work Orders' => 'Approval, assignment, execution, labor, completion, and closure.',
            'Collaboration' => 'Comments and optional photo/video attachments.',
            'Preventive Maintenance' => 'Site-scoped PM templates, schedules, and occurrences.',
            'Notifications & Dashboard' => 'User notifications and role-scoped summary.',
            'Billing' => 'Subscriptions, invoices, Duitku channels, payments, and callbacks.',
            'Platform Audit' => 'Central Super Admin audit records.',
        ];

        $result = [];
        foreach ($tags as $name => $description) {
            $result[] = compact('name', 'description');
        }

        return $result;
    }

    private function summary(string $action, string $method): string
    {
        $methodName = str_contains($action, '@') ? Str::after($action, '@') : $method;

        return Str::headline($methodName);
    }

    private function errorResponse(string $description): array
    {
        return ['description' => $description, 'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/ErrorResponse']]]];
    }
}
