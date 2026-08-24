<?php

declare(strict_types=1);

/**
 * Generate a script-free Postman collection grouped by product feature.
 *
 * The executable Happy Flow collection remains the source of request bodies and
 * authorization examples. This generator removes execution state, deduplicates
 * route operations, and reorganizes requests as API reference documentation.
 */
$featureDocsOutputDirectory = $outputDirectory ?? dirname(__DIR__).'/docs/postman';
$featureDocsSourcePath = $featureDocsOutputDirectory.'/AITOMA_CMMS_API_V1.postman_collection.json';
$featureDocsOutputPath = $featureDocsOutputDirectory.'/AITOMA_CMMS_API_V1_BY_FEATURE.postman_collection.json';

if (! is_file($featureDocsSourcePath)) {
    throw new RuntimeException("Happy Flow Postman collection was not found at {$featureDocsSourcePath}.");
}

$featureDocsSource = json_decode((string) file_get_contents($featureDocsSourcePath), true, 512, JSON_THROW_ON_ERROR);

function featureDocsFlatten(array $nodes): array
{
    $requests = [];
    foreach ($nodes as $node) {
        if (isset($node['request'])) {
            $requests[] = $node;
        }
        if (isset($node['item']) && is_array($node['item'])) {
            array_push($requests, ...featureDocsFlatten($node['item']));
        }
    }

    return $requests;
}

function featureDocsPath(array $item): string
{
    $url = $item['request']['url'] ?? '';
    if (is_array($url)) {
        $url = $url['raw'] ?? '';
    }

    $url = explode('?', (string) $url, 2)[0];
    $url = preg_replace('/^\{\{(?:appBaseUrl|centralBaseUrl|tenantBaseUrl)\}\}\/?/', '', $url);

    return trim((string) $url, '/');
}

function featureDocsOperationKey(array $item): string
{
    $path = preg_replace('/\{\{[^}]+\}\}/', '{}', featureDocsPath($item));

    return strtoupper((string) ($item['request']['method'] ?? '')).' '.$path;
}

function featureDocsCandidateScore(array $item): int
{
    $name = strtolower((string) ($item['name'] ?? ''));
    $score = 100 - strlen($name);

    foreach ([
        'before approval is rejected' => 100,
        'disposable' => 30,
        'runner' => 25,
        'source' => 20,
        'another' => 15,
        'to reject' => 15,
        'to cancel' => 15,
        'again' => 10,
        'first time' => 5,
        'conditional' => 5,
    ] as $phrase => $penalty) {
        if (str_contains($name, $phrase)) {
            $score -= $penalty;
        }
    }

    if ($name === 'assign technician') {
        $score += 100;
    }

    return $score;
}

function featureDocsCategory(string $path): string
{
    return match (true) {
        $path === 'up', str_starts_with($path, 'api/documentation') => 'system',
        str_starts_with($path, 'auth/') => 'authentication',
        str_starts_with($path, 'public/plans'), str_starts_with($path, 'onboarding/') => 'onboarding',
        str_starts_with($path, 'platform/plans') => 'plans',
        str_starts_with($path, 'platform/tenants') => 'tenants',
        str_starts_with($path, 'users') => 'users',
        str_starts_with($path, 'sites'), str_starts_with($path, 'locations') => 'organization',
        str_starts_with($path, 'teams') => 'teams',
        str_starts_with($path, 'assets'), str_starts_with($path, 'asset-categories') => 'assets',
        str_starts_with($path, 'requests') => 'requests',
        str_starts_with($path, 'work-orders') => 'work_orders',
        str_starts_with($path, 'comments'), str_starts_with($path, 'attachments') => 'collaboration',
        str_starts_with($path, 'pm/') => 'preventive_maintenance',
        str_starts_with($path, 'notifications'), str_starts_with($path, 'dashboard/') => 'notifications_dashboard',
        str_starts_with($path, 'billing/'), str_starts_with($path, 'platform/billing/'), str_starts_with($path, 'platform/payments/') => 'billing',
        str_starts_with($path, 'platform/audit-logs') => 'audit',
        default => throw new RuntimeException("No Postman feature category is defined for {$path}."),
    };
}

function featureDocsName(string $operation, string $fallback): string
{
    $names = [
        'POST auth/login' => 'Login',
        'POST auth/logout' => 'Logout',
        'GET auth/me' => 'Get authenticated user',
        'PUT auth/password' => 'Change password',
        'GET platform/plans' => 'List plans',
        'POST platform/plans' => 'Create plan draft',
        'GET platform/plans/{}' => 'Get plan',
        'PUT platform/plans/{}' => 'Replace plan draft',
        'PATCH platform/plans/{}' => 'Update plan draft',
        'DELETE platform/plans/{}' => 'Delete plan draft',
        'PUT platform/plans/{}/features' => 'Assign features to plan',
        'POST platform/plans/{}/publish' => 'Publish plan',
        'POST platform/tenants' => 'Provision tenant',
        'GET platform/tenants' => 'List tenants',
        'GET platform/tenants/{}' => 'Get tenant',
        'PATCH platform/tenants/{}' => 'Update tenant',
        'POST platform/tenants/{}/retry-provisioning' => 'Retry tenant provisioning',
        'PUT platform/tenants/{}/subscription' => 'Replace tenant subscription',
        'POST users' => 'Create company user',
        'GET users' => 'List company users',
        'GET users/{}' => 'Get company user',
        'PATCH users/{}' => 'Update company user',
        'POST assets' => 'Create asset',
        'GET assets' => 'List assets',
        'GET assets/{}' => 'Get asset',
        'PATCH assets/{}' => 'Update asset',
        'DELETE assets/{}' => 'Archive asset',
        'POST requests' => 'Create maintenance request',
        'GET requests' => 'List maintenance requests',
        'GET requests/{}' => 'Get maintenance request',
        'POST requests/{}/approve' => 'Approve maintenance request',
        'POST requests/{}/reject' => 'Reject maintenance request',
        'POST requests/{}/cancel' => 'Cancel maintenance request',
        'POST work-orders' => 'Create work order',
        'GET work-orders' => 'List work orders',
        'GET work-orders/{}' => 'Get work order',
        'PATCH work-orders/{}' => 'Update work order',
        'POST work-orders/{}/approve' => 'Approve work order',
        'POST work-orders/{}/reject' => 'Reject work order',
        'POST work-orders/{}/cancel' => 'Cancel work order',
        'POST work-orders/{}/assign' => 'Assign technician',
        'POST work-orders/{}/acknowledge' => 'Acknowledge work order',
        'POST work-orders/{}/start' => 'Start work',
        'POST work-orders/{}/timer/start' => 'Start labor timer',
        'POST work-orders/{}/timer/stop' => 'Stop labor timer',
        'POST work-orders/{}/hold' => 'Put work order on hold',
        'POST work-orders/{}/resume' => 'Resume work order',
        'POST work-orders/{}/complete' => 'Complete work order',
        'POST work-orders/{}/reject-completion' => 'Reject work order completion',
        'POST work-orders/{}/verify' => 'Verify and close work order',
        'POST billing/providers/{}/callback' => 'Handle payment provider callback',
        'POST onboarding/{}/provision' => 'Start trial and provision tenant',
        'GET onboarding/{}/status' => 'Get onboarding provisioning status',
        'POST onboarding/{}/retry' => 'Retry onboarding provisioning',
        'POST onboarding/{}/cancel' => 'Cancel onboarding registration',
    ];

    return $names[$operation] ?? $fallback;
}

function featureDocsSetJsonBody(array &$item, array $body): void
{
    $item['request']['body'] = [
        'mode' => 'raw',
        'raw' => json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        'options' => ['raw' => ['language' => 'json']],
    ];
}

function featureDocsContext(string $path): string
{
    return match (true) {
        str_starts_with($path, 'auth/'), str_starts_with($path, 'public/'), str_starts_with($path, 'onboarding/'), str_starts_with($path, 'platform/'), str_starts_with($path, 'billing/providers/') => 'Central API (`{{centralBaseUrl}}`)',
        default => 'Tenant API (`{{tenantBaseUrl}}`) and isolated company database',
    };
}

function featureDocsAccess(string $operation, string $path, array $item): string
{
    if (($item['request']['auth']['type'] ?? null) === 'noauth') {
        return str_starts_with($path, 'billing/providers/')
            ? 'Public provider webhook. Intended for Duitku, not a frontend action.'
            : 'Public; no bearer token.';
    }
    if (str_starts_with($path, 'platform/')) {
        return 'Bearer token with `SUPER_ADMIN` platform role.';
    }
    if (str_starts_with($path, 'onboarding/')) {
        return 'Bearer token belonging to the onboarding owner.';
    }
    if (str_starts_with($path, 'users') && in_array(strtok($operation, ' '), ['POST', 'PATCH'], true)) {
        return '`COMPANY_ADMIN` or `MANAGER`; Manager is limited to Supervisor/Technician users in the same primary site.';
    }
    if ($operation === 'POST sites') {
        return '`COMPANY_ADMIN` only.';
    }
    if (preg_match('#^(POST|PATCH|DELETE) (sites|locations|teams|asset-categories|assets|pm/)#', $operation)) {
        return '`COMPANY_ADMIN`, `MANAGER`, or `SUPERVISOR`, subject to site scope.';
    }
    if (preg_match('#^POST requests/\{\}/(approve|reject)$#', $operation) || preg_match('#^POST work-orders/\{\}/(approve|reject)$#', $operation)) {
        return '`MANAGER` only; self-approval is forbidden.';
    }
    if (str_starts_with($path, 'billing/')) {
        return '`COMPANY_ADMIN` only.';
    }

    return 'Authenticated tenant member. Controller policy additionally checks role, ownership, current assignment, workflow state, and site scope.';
}

function featureDocsEntitlement(string $path): string
{
    return match (true) {
        str_starts_with($path, 'sites'), str_starts_with($path, 'locations'), str_starts_with($path, 'assets'), str_starts_with($path, 'asset-categories') => '`core.assets`',
        str_starts_with($path, 'users'), str_starts_with($path, 'teams') => '`core.teams`',
        str_starts_with($path, 'requests') => '`core.requests`',
        str_starts_with($path, 'work-orders') => '`core.work_orders`',
        str_starts_with($path, 'pm/') => '`core.preventive_maintenance`',
        str_starts_with($path, 'notifications') => '`core.notifications`',
        default => 'No route-level plan feature gate.',
    };
}

function featureDocsPrepare(array $item, string $categoryName): array
{
    $path = featureDocsPath($item);
    $operation = featureDocsOperationKey($item);
    $method = strtoupper((string) $item['request']['method']);
    $hadIdempotencyScript = str_contains(json_encode($item['event'] ?? []), 'Idempotency-Key');

    $originalDescription = trim((string) ($item['request']['description'] ?? ''));
    if (str_starts_with($originalDescription, '**Context:**')) {
        $originalDescription = '';
    } else {
        $originalDescription = trim(explode("\n\n**Context:**", $originalDescription, 2)[0]);
    }
    unset($item['event']);
    $item['name'] = featureDocsName($operation, (string) $item['name']);

    $requestJson = json_encode($item['request'], JSON_THROW_ON_ERROR);
    $requestJson = strtr($requestJson, [
        '{{sourcePlanId}}' => '{{planId}}',
        '{{runnerPlanId}}' => '{{planId}}',
        '{{publishedPlanId}}' => '{{planId}}',
        '{{draftPlanId}}' => '{{planId}}',
        '{{normalRequestId}}' => '{{requestId}}',
        '{{approvalRequestId}}' => '{{requestId}}',
        '{{rejectRequestId}}' => '{{requestId}}',
        '{{cancelRequestId}}' => '{{requestId}}',
        '{{mainWorkOrderId}}' => '{{workOrderId}}',
        '{{requestWorkOrderId}}' => '{{workOrderId}}',
        '{{approvedWorkOrderId}}' => '{{workOrderId}}',
        '{{rejectedWorkOrderId}}' => '{{workOrderId}}',
        '{{cancelWorkOrderId}}' => '{{workOrderId}}',
        '{{selfServiceOnboardingId}}' => '{{onboardingId}}',
        '{{importantAssetId}}' => '{{assetId}}',
    ]);
    $item['request'] = json_decode($requestJson, true, 512, JSON_THROW_ON_ERROR);

    if (($item['request']['auth']['type'] ?? null) === 'bearer') {
        $item['request']['auth']['bearer'] = [[
            'key' => 'token',
            'value' => '{{authToken}}',
            'type' => 'string',
        ]];
    }

    if ($hadIdempotencyScript) {
        $headers = $item['request']['header'] ?? [];
        $headers = array_values(array_filter($headers, fn (array $header): bool => strtolower((string) ($header['key'] ?? '')) !== 'idempotency-key'));
        $headers[] = ['key' => 'Idempotency-Key', 'value' => '{{idempotencyKey}}', 'type' => 'text'];
        $item['request']['header'] = $headers;
    }

    switch ($operation) {
        case 'POST auth/login':
            featureDocsSetJsonBody($item, [
                'email' => '{{loginEmail}}',
                'password' => '{{loginPassword}}',
                'device_name' => '{{deviceName}}',
            ]);
            break;
        case 'POST platform/plans':
            featureDocsSetJsonBody($item, [
                'key' => 'PROFESSIONAL',
                'version_number' => 2,
                'name' => 'Professional',
                'description' => 'Professional CMMS package',
                'monthly_price' => 1500000,
                'annual_price' => 15000000,
                'currency_code' => 'IDR',
                'max_users' => 50,
                'max_assets' => 1000,
                'max_sites' => 5,
                'is_public' => true,
            ]);
            break;
        case 'PUT platform/plans/{}/features':
            featureDocsSetJsonBody($item, [
                'features' => [[
                    'feature_id' => '{{featureId}}',
                    'is_enabled' => true,
                    'numeric_limit' => null,
                    'config_value' => null,
                ]],
            ]);
            break;
        case 'POST users':
            featureDocsSetJsonBody($item, [
                'email' => '{{newUserEmail}}',
                'full_name' => 'Company User',
                'employee_code' => 'EMP-001',
                'role_key' => '{{newUserRoleKey}}',
                'primary_site_id' => '{{siteId}}',
                'temporary_password' => '{{newUserTemporaryPassword}}',
            ]);
            break;
        case 'POST assets':
            featureDocsSetJsonBody($item, [
                'site_id' => '{{siteId}}',
                'location_id' => '{{locationId}}',
                'asset_category_id' => '{{categoryId}}',
                'code' => 'PUMP-001',
                'name' => 'Transfer Pump',
                'description' => 'Production asset',
                'status' => 'OPERATIONAL',
                'criticality' => 'HIGH',
                'request_approval_required' => false,
            ]);
            break;
        case 'POST requests':
            featureDocsSetJsonBody($item, [
                'asset_id' => '{{assetId}}',
                'title' => 'Seal leakage',
                'description' => 'Operator observed a seal leak.',
                'priority' => 'HIGH',
                'due_at' => '{{futureDate}}',
            ]);
            break;
        case 'POST work-orders':
            featureDocsSetJsonBody($item, [
                'asset_id' => '{{assetId}}',
                'title' => 'Pump seal replacement',
                'description' => 'Replace the seal and inspect the coupling.',
                'priority' => 'HIGH',
                'due_at' => '{{futureDate}}',
            ]);
            break;
    }

    $displayPath = preg_replace('/\{\{[^}]+\}\}/', '{id}', $path);
    $description = [
        "**Feature:** {$categoryName}",
        "**Endpoint:** `{$method} /{$displayPath}`",
        '**Domain:** '.featureDocsContext($path),
        '**Access:** '.featureDocsAccess($operation, $path, $item),
        '**Plan entitlement:** '.featureDocsEntitlement($path),
        '**Execution:** API reference documentation only. This request has no workflow script, does not create prerequisites, and does not save response IDs. Fill the environment and collection variables explicitly before sending.',
    ];
    if ($originalDescription !== '') {
        $description[] = '**Additional note:** '.$originalDescription;
    }
    $item['request']['description'] = implode("\n\n", $description);

    return $item;
}

$featureDocsCategories = [
    'system' => ['name' => '00 - System and API Documentation', 'description' => 'Service availability and generated OpenAPI documentation.'],
    'authentication' => ['name' => '01 - Authentication and Session', 'description' => 'Login, authenticated identity, password change, and logout for platform and tenant users.'],
    'onboarding' => ['name' => '02 - Self-Service Onboarding', 'description' => 'Public plans, registration, email verification, trial start, provisioning status, retry, and cancellation.'],
    'plans' => ['name' => '03 - Plans and Feature Packaging', 'description' => 'Super Admin management of package drafts, feature assignments, publication, and immutable published versions.'],
    'tenants' => ['name' => '04 - Tenant Provisioning and Subscription Admin', 'description' => 'Super Admin tenant provisioning, tenant metadata, provisioning retry, and subscription replacement.'],
    'users' => ['name' => '05 - Company Users and Roles', 'description' => 'Company-level users such as Company Admin, Manager, Supervisor, Technician, and Operator.'],
    'organization' => ['name' => '06 - Sites and Locations', 'description' => 'Physical organization master data for sites and nested maintenance locations.'],
    'teams' => ['name' => '07 - Maintenance Teams', 'description' => 'Maintenance teams, supervisors, and technician membership.'],
    'assets' => ['name' => '08 - Assets and Asset Categories', 'description' => 'Asset categories, assets, criticality, approval policy, and operator assignments.'],
    'requests' => ['name' => '09 - Maintenance Requests', 'description' => 'Maintenance request submission and Manager approval, rejection, or requester cancellation.'],
    'work_orders' => ['name' => '10 - Work Orders and Labor', 'description' => 'Work order approval, assignment, execution lifecycle, labor timer, completion, verification, and closure.'],
    'collaboration' => ['name' => '11 - Comments and Attachments', 'description' => 'Comments and optional photo/video attachments associated with supported tenant entities.'],
    'preventive_maintenance' => ['name' => '12 - Preventive Maintenance', 'description' => 'PM templates, schedules, pause/resume controls, and generated occurrences.'],
    'notifications_dashboard' => ['name' => '13 - Notifications and Dashboard', 'description' => 'User notifications, read state, and tenant dashboard summary.'],
    'billing' => ['name' => '14 - Billing and Payments', 'description' => 'Duitku provider configuration, payment channels, subscriptions, invoices, payments, callbacks, and manual confirmation.'],
    'audit' => ['name' => '15 - Platform Audit Logs', 'description' => 'Super Admin visibility into central platform audit events.'],
];

$featureDocsUnique = [];
foreach (featureDocsFlatten($featureDocsSource['item'] ?? []) as $featureDocsItem) {
    $featureDocsKey = featureDocsOperationKey($featureDocsItem);
    if (! isset($featureDocsUnique[$featureDocsKey]) || featureDocsCandidateScore($featureDocsItem) > featureDocsCandidateScore($featureDocsUnique[$featureDocsKey])) {
        $featureDocsUnique[$featureDocsKey] = $featureDocsItem;
    }
}

$featureDocsGrouped = array_fill_keys(array_keys($featureDocsCategories), []);
foreach ($featureDocsUnique as $featureDocsItem) {
    $featureDocsCategoryKey = featureDocsCategory(featureDocsPath($featureDocsItem));
    $featureDocsGrouped[$featureDocsCategoryKey][] = featureDocsPrepare(
        $featureDocsItem,
        $featureDocsCategories[$featureDocsCategoryKey]['name'],
    );
}

$featureDocsFolders = [];
foreach ($featureDocsCategories as $featureDocsCategoryKey => $featureDocsCategory) {
    if ($featureDocsGrouped[$featureDocsCategoryKey] === []) {
        continue;
    }
    $featureDocsFolders[] = [
        'name' => $featureDocsCategory['name'],
        'description' => $featureDocsCategory['description'],
        'item' => $featureDocsGrouped[$featureDocsCategoryKey],
    ];
}

$featureDocsVariableDefaults = [
    'authToken' => '',
    'tenantBaseUrl' => 'http://self-service.localhost:8000/api/v1',
    'idempotencyKey' => 'docs-unique-request-001',
    'billingProvider' => 'DUITKU',
    'loginEmail' => '',
    'loginPassword' => '',
    'deviceName' => 'postman-api-docs',
    'newUserEmail' => 'user@example.com',
    'newUserRoleKey' => 'TECHNICIAN',
    'newUserTemporaryPassword' => 'ChangeMe12345',
    'runId' => '001',
    'futureDate' => '2026-12-31T10:00:00Z',
];

$featureDocsItemsJson = json_encode($featureDocsFolders, JSON_THROW_ON_ERROR);
preg_match_all('/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/', $featureDocsItemsJson, $featureDocsVariableMatches);
$featureDocsEnvironmentVariables = [
    'appBaseUrl', 'centralBaseUrl', 'tenantBaseUrl', 'tenantScheme', 'tenantPort', 'authToken',
    'loginEmail', 'loginPassword', 'deviceName', 'superAdminEmail', 'superAdminPassword',
    'tenantAdminTemporaryPassword', 'tenantAdminPassword', 'testUserTemporaryPassword', 'testUserPassword',
    'newUserEmail', 'newUserRoleKey', 'newUserTemporaryPassword',
    'selfServiceEmail', 'selfServicePassword', 'selfServiceVerificationToken', 'sampleFilePath',
    'duitkuMerchantCode', 'duitkuApiKey', 'duitkuChannelKey', 'publicCallbackBaseUrl', 'billingReturnUrl',
];
$featureDocsVariableNames = array_values(array_unique($featureDocsVariableMatches[1] ?? []));
sort($featureDocsVariableNames);

$featureDocsVariables = [];
foreach ($featureDocsVariableNames as $featureDocsVariableName) {
    if (in_array($featureDocsVariableName, $featureDocsEnvironmentVariables, true) || in_array($featureDocsVariableName, ['appBaseUrl', 'centralBaseUrl'], true)) {
        continue;
    }
    $featureDocsVariables[] = [
        'key' => $featureDocsVariableName,
        'value' => $featureDocsVariableDefaults[$featureDocsVariableName] ?? '',
        'description' => str_ends_with($featureDocsVariableName, 'Id') ? 'ULID of the selected resource. Copy it from the corresponding list/create response.' : 'Request value used by one or more feature examples.',
    ];
}

$featureDocsCollection = [
    'info' => [
        '_postman_id' => 'aa7394c8-1804-4f5f-aecf-aitoma-feature-docs',
        'name' => 'AITOMA CMMS API V1 - By Feature',
        'description' => "Primary API reference for frontend development, grouped by product feature rather than execution order.\n\nImport and select `AITOMA_CMMS_LOCAL.postman_environment.json`. Set `authToken` after central login and set `tenantBaseUrl` from the selected membership or onboarding result. Requests intentionally contain no tests, skip logic, chaining, or response-variable scripts. Use the Happy Flow collection only for end-to-end backend regression. See `docs/FRONTEND_BACKEND_HANDOFF.md`.",
        'schema' => 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    ],
    'item' => $featureDocsFolders,
    'variable' => $featureDocsVariables,
];

file_put_contents(
    $featureDocsOutputPath,
    json_encode($featureDocsCollection, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
);

echo 'Generated '.count($featureDocsFolders).' feature folders in '.$featureDocsOutputPath.PHP_EOL;
