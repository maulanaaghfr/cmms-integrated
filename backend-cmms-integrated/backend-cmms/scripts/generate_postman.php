<?php

declare(strict_types=1);

/**
 * Generates the import-ready Postman collection and local environment.
 * Run from the project root: php scripts/generate_postman.php
 */
$outputDirectory = dirname(__DIR__).'/docs/postman';

function lines(string $script): array
{
    $script = trim($script);

    return $script === '' ? [] : preg_split('/\R/', $script);
}

function event(string $listen, string $script): array
{
    return ['listen' => $listen, 'script' => ['type' => 'text/javascript', 'exec' => lines($script)]];
}

function testScript(array $statusCodes = [200], ?string $saveVariable = null, string $extra = ''): string
{
    $codes = json_encode($statusCodes);
    $save = $saveVariable === null ? '' : <<<JS
const payload = pm.response.json();
pm.collectionVariables.set('{$saveVariable}', payload.data.id);
JS;

    return <<<JS
pm.test('HTTP status is expected', function () {
    pm.expect({$codes}).to.include(pm.response.code);
});
if (pm.response.code !== 204) {
    pm.test('Response is valid JSON', function () {
        pm.response.to.be.json;
    });
}
{$save}
{$extra}
JS;
}

function requestItem(
    string $name,
    string $method,
    string $url,
    ?string $token = null,
    ?array $body = null,
    array $statusCodes = [200],
    ?string $saveVariable = null,
    string $extraTests = '',
    string $preRequest = '',
    string $description = '',
): array {
    $headers = [['key' => 'Accept', 'value' => 'application/json']];
    $context = str_contains($url, '{{tenantBaseUrl}}') ? 'tenant domain' : (str_contains($url, '{{centralBaseUrl}}') ? 'central domain' : 'application root');
    $authDescription = $token === null ? 'No bearer token is sent.' : 'Uses the `{{'.$token.'}}` bearer token.';
    $commonDescription = "**Context:** {$context}.\n\n**Authentication:** {$authDescription}\n\n**Expected status:** `".implode('`, `', $statusCodes).'`. Run prerequisite requests in the earlier numbered folders first.';
    $description = $description === '' ? $commonDescription : $description."\n\n".$commonDescription;
    $request = [
        'method' => $method,
        'header' => $headers,
        'url' => $url,
        'description' => $description,
    ];
    $request['auth'] = $token === null
        ? ['type' => 'noauth']
        : ['type' => 'bearer', 'bearer' => [['key' => 'token', 'value' => '{{'.$token.'}}', 'type' => 'string']]];
    if ($body !== null) {
        $request['header'][] = ['key' => 'Content-Type', 'value' => 'application/json'];
        $request['body'] = ['mode' => 'raw', 'raw' => json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), 'options' => ['raw' => ['language' => 'json']]];
    }

    $events = [event('test', testScript($statusCodes, $saveVariable, $extraTests))];
    if ($preRequest !== '') {
        array_unshift($events, event('prerequest', $preRequest));
    }

    return ['name' => $name, 'event' => $events, 'request' => $request, 'response' => []];
}

function multipartItem(string $name, string $url, string $token, array $fields, array $statusCodes, ?string $saveVariable = null, string $preRequest = ''): array
{
    $item = requestItem($name, 'POST', $url, $token, null, $statusCodes, $saveVariable, '', $preRequest);
    $item['request']['body'] = ['mode' => 'formdata', 'formdata' => $fields];

    return $item;
}

function folder(string $name, array $items, string $description = ''): array
{
    return ['name' => $name, 'description' => $description, 'item' => $items];
}

function skipUnless(string $variable): string
{
    return <<<JS
if (pm.collectionVariables.get('{$variable}') !== 'true') {
    console.log('Skipped. Set {$variable}=true to run this conditional request.');
    pm.execution.skipRequest();
}
JS;
}

$items = [];

$items[] = folder('00 - Preflight', [
    requestItem('Health check', 'GET', '{{appBaseUrl}}/up', null, null, [200], null, <<<'JS'
const now = Date.now();
const suffix = String(now).slice(-10);
pm.collectionVariables.set('runId', suffix);
pm.collectionVariables.set('futureDate', new Date(now + 7 * 86400000).toISOString());
pm.collectionVariables.set('periodEnd', new Date(now + 30 * 86400000).toISOString());
pm.collectionVariables.set('pmStartDate', new Date(now + 86400000).toISOString().slice(0, 10));
pm.collectionVariables.set('tenantDomain', `cmms-${suffix}.localhost`);
pm.collectionVariables.set('tenantBaseUrl', `${pm.environment.get('tenantScheme')}://cmms-${suffix}.localhost:${pm.environment.get('tenantPort')}/api/v1`);
JS),
    requestItem('OpenAPI specification', 'GET', '{{appBaseUrl}}/api/documentation/openapi.json', null, null, [200]),
], 'Initializes unique test values and verifies that Laravel and Swagger are reachable.');

$items[] = folder('01 - Platform Auth and Plans', [
    requestItem('Login Super Admin', 'POST', '{{centralBaseUrl}}/auth/login', null, [
        'email' => '{{superAdminEmail}}', 'password' => '{{superAdminPassword}}', 'device_name' => 'postman-happy-flow',
    ], [200], null, <<<'JS'
const payload = pm.response.json();
pm.collectionVariables.set('superAdminToken', payload.data.token);
JS),
    requestItem('Get authenticated Super Admin', 'GET', '{{centralBaseUrl}}/auth/me', 'superAdminToken'),
    requestItem('List plans', 'GET', '{{centralBaseUrl}}/platform/plans?per_page=100', 'superAdminToken', null, [200], null, <<<'JS'
const plans = pm.response.json().data;
const source = plans.find((plan) => plan.status === 'PUBLISHED');
pm.test('At least one published seeded plan exists', () => pm.expect(source).to.exist);
if (source) pm.collectionVariables.set('sourcePlanId', source.id);
JS),
    requestItem('Get source plan and copy entitlements', 'GET', '{{centralBaseUrl}}/platform/plans/{{sourcePlanId}}', 'superAdminToken', null, [200], null, <<<'JS'
const features = pm.response.json().data.features;
pm.test('Source plan has features', () => pm.expect(features.length).to.be.above(0));
pm.collectionVariables.set('featurePayload', JSON.stringify({features: features.map((feature) => ({
    feature_id: feature.id,
    is_enabled: true,
    numeric_limit: feature.numeric_limit,
    config_value: typeof feature.config_value === 'string' ? JSON.parse(feature.config_value) : feature.config_value
}))}));
JS),
    requestItem('Create runner plan (POST)', 'POST', '{{centralBaseUrl}}/platform/plans', 'superAdminToken', [
        'key' => 'POSTMAN_{{runId}}', 'version_number' => 1, 'name' => 'Postman Runner {{runId}}',
        'description' => 'Temporary published plan used by the happy-flow tenant.', 'monthly_price' => 1500000,
        'annual_price' => 15000000, 'currency_code' => 'IDR', 'max_users' => 25, 'max_assets' => 100,
        'max_sites' => 5, 'is_public' => false,
    ], [201], 'runnerPlanId'),
    requestItem('Replace runner plan fields (PUT)', 'PUT', '{{centralBaseUrl}}/platform/plans/{{runnerPlanId}}', 'superAdminToken', [
        'key' => 'POSTMAN_{{runId}}', 'version_number' => 1, 'name' => 'Postman Runner {{runId}}',
        'description' => 'Plan after PUT test.', 'monthly_price' => 1500000, 'annual_price' => 15000000,
        'currency_code' => 'IDR', 'max_users' => 25, 'max_assets' => 100, 'max_sites' => 5, 'is_public' => false,
    ]),
    requestItem('Partially update runner plan (PATCH)', 'PATCH', '{{centralBaseUrl}}/platform/plans/{{runnerPlanId}}', 'superAdminToken', [
        'description' => 'Plan used for the automated Postman happy flow.',
    ]),
    requestItem('Attach all source features', 'PUT', '{{centralBaseUrl}}/platform/plans/{{runnerPlanId}}/features', 'superAdminToken', [
        'features' => [],
    ], [200], null, '', <<<'JS'
pm.request.headers.upsert({key: 'Content-Type', value: 'application/json'});
pm.request.body.update(pm.collectionVariables.get('featurePayload'));
JS),
    requestItem('Publish runner plan', 'POST', '{{centralBaseUrl}}/platform/plans/{{runnerPlanId}}/publish', 'superAdminToken', null, [200], null, <<<'JS'
const plan = pm.response.json().data;
pm.expect(plan.status).to.eql('PUBLISHED');
pm.collectionVariables.set('publishedPlanId', plan.id);
JS),
    requestItem('Get published runner plan', 'GET', '{{centralBaseUrl}}/platform/plans/{{publishedPlanId}}', 'superAdminToken'),
    requestItem('Create disposable draft plan', 'POST', '{{centralBaseUrl}}/platform/plans', 'superAdminToken', [
        'key' => 'DELETE_{{runId}}', 'version_number' => 1, 'name' => 'Disposable {{runId}}',
        'monthly_price' => 1000, 'currency_code' => 'IDR',
    ], [201], 'draftPlanId'),
    requestItem('Delete disposable draft plan', 'DELETE', '{{centralBaseUrl}}/platform/plans/{{draftPlanId}}', 'superAdminToken', null, [204]),
]);

$items[] = folder('02 - Tenant Onboarding and Admin Auth', [
    requestItem('Create tenant with separate database', 'POST', '{{centralBaseUrl}}/platform/tenants', 'superAdminToken', [
        'code' => 'CMMS_{{runId}}', 'name' => 'CMMS Happy Flow {{runId}}', 'domain' => '{{tenantDomain}}',
        'email' => 'company.{{runId}}@example.test', 'industry' => 'Food & Beverage', 'timezone' => 'Asia/Jakarta',
        'admin' => ['full_name' => 'Company Admin Postman', 'email' => 'admin.{{runId}}@example.test', 'temporary_password' => '{{tenantAdminTemporaryPassword}}'],
        'plan_id' => '{{publishedPlanId}}', 'trial_days' => 30,
    ], [201], 'tenantId', <<<'JS'
const tenant = pm.response.json().data;
pm.collectionVariables.set('tenantDomain', tenant.domains[0].domain);
pm.collectionVariables.set('tenantAdminEmail', `admin.${pm.collectionVariables.get('runId')}@example.test`);
pm.collectionVariables.set('tenantBaseUrl', `${pm.environment.get('tenantScheme')}://${tenant.domains[0].domain}:${pm.environment.get('tenantPort')}/api/v1`);
JS),
    requestItem('List tenants', 'GET', '{{centralBaseUrl}}/platform/tenants?search=CMMS_{{runId}}', 'superAdminToken'),
    requestItem('Get tenant and database usage', 'GET', '{{centralBaseUrl}}/platform/tenants/{{tenantId}}', 'superAdminToken'),
    requestItem('Update tenant', 'PATCH', '{{centralBaseUrl}}/platform/tenants/{{tenantId}}', 'superAdminToken', [
        'phone' => '+628123456789', 'industry' => 'Manufacturing - Food & Beverage',
    ]),
    requestItem('Retry provisioning (conditional)', 'POST', '{{centralBaseUrl}}/platform/tenants/{{tenantId}}/retry-provisioning', 'superAdminToken', null, [200], null, '', skipUnless('runRetryProvisioning'), 'Only run for a tenant whose database_status is FAILED; a READY tenant correctly returns 409.'),
    requestItem('Replace tenant subscription', 'PUT', '{{centralBaseUrl}}/platform/tenants/{{tenantId}}/subscription', 'superAdminToken', [
        'plan_id' => '{{publishedPlanId}}', 'status' => 'ACTIVE', 'billing_period' => 'MONTHLY',
        'current_period_end' => '{{periodEnd}}', 'notes' => 'Activated by Postman happy flow.',
    ], [201], 'subscriptionId'),
    requestItem('Login tenant Company Admin', 'POST', '{{centralBaseUrl}}/auth/login', null, [
        'email' => '{{tenantAdminEmail}}', 'password' => '{{tenantAdminTemporaryPassword}}', 'device_name' => 'postman-tenant-admin',
    ], [200], null, <<<'JS'
pm.collectionVariables.set('tenantAdminToken', pm.response.json().data.token);
JS),
    requestItem('Change mandatory Company Admin password', 'PUT', '{{centralBaseUrl}}/auth/password', 'tenantAdminToken', [
        'current_password' => '{{tenantAdminTemporaryPassword}}', 'password' => '{{tenantAdminPassword}}', 'password_confirmation' => '{{tenantAdminPassword}}',
    ]),
    requestItem('Get Company Admin identity', 'GET', '{{centralBaseUrl}}/auth/me', 'tenantAdminToken'),
]);

$items[] = folder('03 - Organization, Team, and Asset Master Data', [
    requestItem('Create site', 'POST', '{{tenantBaseUrl}}/sites', 'tenantAdminToken', [
        'code' => 'SITE-{{runId}}', 'name' => 'Plant Postman {{runId}}', 'address' => 'Pasuruan, East Java', 'timezone' => 'Asia/Jakarta',
    ], [201], 'siteId'),
    requestItem('List sites', 'GET', '{{tenantBaseUrl}}/sites?per_page=20', 'tenantAdminToken'),
    requestItem('Get site', 'GET', '{{tenantBaseUrl}}/sites/{{siteId}}', 'tenantAdminToken'),
    requestItem('Update site', 'PATCH', '{{tenantBaseUrl}}/sites/{{siteId}}', 'tenantAdminToken', ['name' => 'Plant Postman Updated {{runId}}']),
    requestItem('Create location', 'POST', '{{tenantBaseUrl}}/locations', 'tenantAdminToken', [
        'site_id' => '{{siteId}}', 'code' => 'LINE-{{runId}}', 'name' => 'Production Line {{runId}}', 'location_type' => 'LINE', 'description' => 'Happy-flow line',
    ], [201], 'locationId'),
    requestItem('List locations', 'GET', '{{tenantBaseUrl}}/locations?site_id={{siteId}}', 'tenantAdminToken'),
    requestItem('Get location', 'GET', '{{tenantBaseUrl}}/locations/{{locationId}}', 'tenantAdminToken'),
    requestItem('Update location', 'PATCH', '{{tenantBaseUrl}}/locations/{{locationId}}', 'tenantAdminToken', ['description' => 'Updated by Postman']),

    requestItem('Create supervisor', 'POST', '{{tenantBaseUrl}}/users', 'tenantAdminToken', [
        'email' => 'supervisor.{{runId}}@example.test', 'full_name' => 'Supervisor Postman', 'employee_code' => 'SPV-{{runId}}',
        'role_key' => 'SUPERVISOR', 'primary_site_id' => '{{siteId}}', 'temporary_password' => '{{testUserTemporaryPassword}}',
    ], [201], 'supervisorId'),
    requestItem('Create Maintenance Manager', 'POST', '{{tenantBaseUrl}}/users', 'tenantAdminToken', [
        'email' => 'manager.{{runId}}@example.test', 'full_name' => 'Maintenance Manager Postman', 'employee_code' => 'MGR-{{runId}}',
        'role_key' => 'MANAGER', 'primary_site_id' => '{{siteId}}', 'temporary_password' => '{{testUserTemporaryPassword}}',
    ], [201], 'managerId', <<<'JS'
pm.collectionVariables.set('managerEmail', `manager.${pm.collectionVariables.get('runId')}@example.test`);
JS),
    requestItem('Create technician', 'POST', '{{tenantBaseUrl}}/users', 'tenantAdminToken', [
        'email' => 'technician.{{runId}}@example.test', 'full_name' => 'Technician Postman', 'employee_code' => 'TECH-{{runId}}',
        'role_key' => 'TECHNICIAN', 'primary_site_id' => '{{siteId}}', 'temporary_password' => '{{testUserTemporaryPassword}}',
    ], [201], 'technicianId', <<<'JS'
pm.collectionVariables.set('technicianEmail', `technician.${pm.collectionVariables.get('runId')}@example.test`);
JS),
    requestItem('Create operator', 'POST', '{{tenantBaseUrl}}/users', 'tenantAdminToken', [
        'email' => 'operator.{{runId}}@example.test', 'full_name' => 'Operator Postman', 'employee_code' => 'OPR-{{runId}}',
        'role_key' => 'OPERATOR', 'primary_site_id' => '{{siteId}}', 'temporary_password' => '{{testUserTemporaryPassword}}',
    ], [201], 'operatorId'),
    requestItem('List users', 'GET', '{{tenantBaseUrl}}/users?status=ACTIVE', 'tenantAdminToken'),
    requestItem('Get technician user', 'GET', '{{tenantBaseUrl}}/users/{{technicianId}}', 'tenantAdminToken'),
    requestItem('Update technician user', 'PATCH', '{{tenantBaseUrl}}/users/{{technicianId}}', 'tenantAdminToken', ['phone' => '+628111111111']),
    requestItem('Login Maintenance Manager', 'POST', '{{centralBaseUrl}}/auth/login', null, [
        'email' => '{{managerEmail}}', 'password' => '{{testUserTemporaryPassword}}', 'device_name' => 'postman-maintenance-manager',
    ], [200], null, <<<'JS'
pm.collectionVariables.set('managerToken', pm.response.json().data.token);
JS),
    requestItem('Change mandatory Maintenance Manager password', 'PUT', '{{centralBaseUrl}}/auth/password', 'managerToken', [
        'current_password' => '{{testUserTemporaryPassword}}', 'password' => '{{testUserPassword}}', 'password_confirmation' => '{{testUserPassword}}',
    ]),
    requestItem('Login technician', 'POST', '{{centralBaseUrl}}/auth/login', null, [
        'email' => '{{technicianEmail}}', 'password' => '{{testUserTemporaryPassword}}', 'device_name' => 'postman-technician',
    ], [200], null, <<<'JS'
pm.collectionVariables.set('technicianToken', pm.response.json().data.token);
JS),
    requestItem('Change mandatory technician password', 'PUT', '{{centralBaseUrl}}/auth/password', 'technicianToken', [
        'current_password' => '{{testUserTemporaryPassword}}', 'password' => '{{testUserPassword}}', 'password_confirmation' => '{{testUserPassword}}',
    ]),

    requestItem('Create maintenance team', 'POST', '{{tenantBaseUrl}}/teams', 'tenantAdminToken', [
        'site_id' => '{{siteId}}', 'code' => 'TEAM-{{runId}}', 'name' => 'Maintenance Team {{runId}}', 'supervisor_user_id' => '{{supervisorId}}',
    ], [201], 'teamId'),
    requestItem('List teams', 'GET', '{{tenantBaseUrl}}/teams?site_id={{siteId}}', 'tenantAdminToken'),
    requestItem('Get team', 'GET', '{{tenantBaseUrl}}/teams/{{teamId}}', 'tenantAdminToken'),
    requestItem('Update team', 'PATCH', '{{tenantBaseUrl}}/teams/{{teamId}}', 'tenantAdminToken', ['name' => 'Rotating Equipment Team {{runId}}']),
    requestItem('Add technician to team', 'POST', '{{tenantBaseUrl}}/teams/{{teamId}}/members', 'tenantAdminToken', [
        'tenant_user_id' => '{{technicianId}}', 'member_type' => 'MEMBER',
    ], [201], 'teamMemberId'),

    requestItem('Create asset category', 'POST', '{{tenantBaseUrl}}/asset-categories', 'tenantAdminToken', [
        'code' => 'ROTATING-{{runId}}', 'name' => 'Rotating Equipment {{runId}}', 'description' => 'Pumps, motors, and gearboxes',
    ], [201], 'categoryId'),
    requestItem('List asset categories', 'GET', '{{tenantBaseUrl}}/asset-categories', 'tenantAdminToken'),
    requestItem('Get asset category', 'GET', '{{tenantBaseUrl}}/asset-categories/{{categoryId}}', 'tenantAdminToken'),
    requestItem('Update asset category', 'PATCH', '{{tenantBaseUrl}}/asset-categories/{{categoryId}}', 'tenantAdminToken', ['description' => 'Updated rotating equipment category']),
    requestItem('Create normal asset', 'POST', '{{tenantBaseUrl}}/assets', 'tenantAdminToken', [
        'site_id' => '{{siteId}}', 'location_id' => '{{locationId}}', 'asset_category_id' => '{{categoryId}}',
        'code' => 'PUMP-{{runId}}', 'name' => 'Transfer Pump {{runId}}', 'description' => 'Main happy-flow asset',
        'status' => 'OPERATIONAL', 'criticality' => 'HIGH', 'request_approval_required' => false,
    ], [201], 'assetId'),
    requestItem('Create important asset', 'POST', '{{tenantBaseUrl}}/assets', 'tenantAdminToken', [
        'site_id' => '{{siteId}}', 'location_id' => '{{locationId}}', 'asset_category_id' => '{{categoryId}}',
        'code' => 'CRITICAL-{{runId}}', 'name' => 'Critical Mixer {{runId}}',
        'status' => 'OPERATIONAL', 'criticality' => 'CRITICAL', 'request_approval_required' => true,
    ], [201], 'importantAssetId'),
    requestItem('List assets', 'GET', '{{tenantBaseUrl}}/assets?site_id={{siteId}}', 'tenantAdminToken'),
    requestItem('Get asset', 'GET', '{{tenantBaseUrl}}/assets/{{assetId}}', 'tenantAdminToken'),
    requestItem('Update asset', 'PATCH', '{{tenantBaseUrl}}/assets/{{assetId}}', 'tenantAdminToken', ['description' => 'Inspected through Postman happy flow']),
    requestItem('Assign operator to asset', 'POST', '{{tenantBaseUrl}}/assets/{{assetId}}/operators', 'tenantAdminToken', [
        'tenant_user_id' => '{{operatorId}}', 'assignment_type' => 'PRIMARY',
    ], [201], 'operatorAssignmentId'),
    requestItem('List asset operators', 'GET', '{{tenantBaseUrl}}/assets/{{assetId}}/operators', 'tenantAdminToken'),
]);

$items[] = folder('04 - Maintenance Request Happy Flows', [
    requestItem('Create request for normal asset', 'POST', '{{tenantBaseUrl}}/requests', 'tenantAdminToken', [
        'asset_id' => '{{assetId}}', 'title' => 'Seal leakage {{runId}}', 'description' => 'Operator observed a small seal leak.',
        'priority' => 'HIGH', 'due_at' => '{{futureDate}}',
    ], [201], null, <<<'JS'
const result = pm.response.json().data;
pm.collectionVariables.set('normalRequestId', result.request.id);
pm.test('Every request waits for approval', () => pm.expect(result.request.status).to.eql('PENDING_APPROVAL'));
pm.test('WO is not created before approval', () => pm.expect(result.work_order).to.eql(null));
JS),
    requestItem('Maintenance Manager approves normal request', 'POST', '{{tenantBaseUrl}}/requests/{{normalRequestId}}/approve', 'managerToken', [
        'note' => 'Approved for maintenance.', 'due_at' => '{{futureDate}}',
    ], [200], null, <<<'JS'
const result = pm.response.json().data;
pm.collectionVariables.set('requestWorkOrderId', result.work_order.id);
pm.expect(result.request.status).to.eql('CONVERTED');
pm.expect(result.work_order.status).to.eql('OPEN');
JS),
    requestItem('List maintenance requests', 'GET', '{{tenantBaseUrl}}/requests?per_page=20', 'tenantAdminToken'),
    requestItem('Get converted request', 'GET', '{{tenantBaseUrl}}/requests/{{normalRequestId}}', 'tenantAdminToken'),
    requestItem('Create another request for approval', 'POST', '{{tenantBaseUrl}}/requests', 'tenantAdminToken', [
        'asset_id' => '{{importantAssetId}}', 'title' => 'Critical vibration {{runId}}', 'description' => 'Vibration is above the inspection baseline.', 'priority' => 'CRITICAL',
    ], [201], null, <<<'JS'
const result = pm.response.json().data;
pm.collectionVariables.set('approvalRequestId', result.request.id);
pm.test('Request waits for approval', () => pm.expect(result.request.status).to.eql('PENDING_APPROVAL'));
JS),
    requestItem('Maintenance Manager approves request', 'POST', '{{tenantBaseUrl}}/requests/{{approvalRequestId}}/approve', 'managerToken', [
        'note' => 'Approved for immediate inspection.', 'due_at' => '{{futureDate}}',
    ], [200], null, <<<'JS'
const result = pm.response.json().data;
pm.collectionVariables.set('approvedWorkOrderId', result.work_order.id);
pm.expect(result.request.status).to.eql('CONVERTED');
JS),
    requestItem('Create important request to reject', 'POST', '{{tenantBaseUrl}}/requests', 'tenantAdminToken', [
        'asset_id' => '{{importantAssetId}}', 'title' => 'Duplicate inspection {{runId}}', 'description' => 'Created to verify the rejection happy flow.', 'priority' => 'LOW',
    ], [201], null, <<<'JS'
pm.collectionVariables.set('rejectRequestId', pm.response.json().data.request.id);
JS),
    requestItem('Maintenance Manager rejects request', 'POST', '{{tenantBaseUrl}}/requests/{{rejectRequestId}}/reject', 'managerToken', [
        'reason' => 'Duplicate of an existing maintenance activity.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('REJECTED');"),
    requestItem('Create important request to cancel', 'POST', '{{tenantBaseUrl}}/requests', 'tenantAdminToken', [
        'asset_id' => '{{importantAssetId}}', 'title' => 'Cancelled inspection {{runId}}', 'description' => 'Created to verify requester cancellation.', 'priority' => 'MEDIUM',
    ], [201], null, <<<'JS'
pm.collectionVariables.set('cancelRequestId', pm.response.json().data.request.id);
JS),
    requestItem('Cancel pending request', 'POST', '{{tenantBaseUrl}}/requests/{{cancelRequestId}}/cancel', 'tenantAdminToken', [
        'reason' => 'Condition was rechecked and is normal.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('CANCELLED');"),
]);

$attachment = multipartItem('Upload optional WO photo/video', '{{tenantBaseUrl}}/attachments', 'tenantAdminToken', [
    ['key' => 'entity_type', 'value' => 'WORK_ORDER', 'type' => 'text'],
    ['key' => 'entity_id', 'value' => '{{mainWorkOrderId}}', 'type' => 'text'],
    ['key' => 'media_role', 'value' => 'BEFORE', 'type' => 'text'],
    ['key' => 'file', 'type' => 'file', 'src' => '{{sampleFilePath}}'],
], [201], 'attachmentId', skipUnless('runAttachment'));

$items[] = folder('05 - Work Order Lifecycle and Supporting Features', [
    requestItem('Create direct WO pending approval', 'POST', '{{tenantBaseUrl}}/work-orders', 'tenantAdminToken', [
        'asset_id' => '{{assetId}}', 'title' => 'Pump seal replacement {{runId}}', 'description' => 'Replace seal and inspect coupling.',
        'priority' => 'HIGH', 'due_at' => '{{futureDate}}',
    ], [201], 'mainWorkOrderId', "pm.expect(pm.response.json().data.status).to.eql('PENDING_APPROVAL');"),
    requestItem('Assignment before approval is rejected', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/assign', 'tenantAdminToken', [
        'team_id' => '{{teamId}}', 'assignee_id' => '{{technicianId}}',
    ], [409], null, "pm.expect(pm.response.json().error.code).to.eql('WORK_ORDER_NOT_ASSIGNABLE');"),
    requestItem('Maintenance Manager approves direct WO', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/approve', 'managerToken', [
        'note' => 'Approved for execution.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('OPEN');"),
    requestItem('List work orders', 'GET', '{{tenantBaseUrl}}/work-orders?status=OPEN&per_page=20', 'tenantAdminToken'),
    requestItem('Get work order details', 'GET', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}', 'tenantAdminToken'),
    requestItem('Update work order', 'PATCH', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}', 'tenantAdminToken', [
        'priority' => 'CRITICAL', 'description' => 'Seal replacement prioritized by supervisor.',
    ]),
    requestItem('Assign technician', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/assign', 'tenantAdminToken', [
        'team_id' => '{{teamId}}', 'assignee_id' => '{{technicianId}}',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('ASSIGNED');"),
    requestItem('Technician acknowledges WO', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/acknowledge', 'technicianToken'),
    requestItem('Technician starts work', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/start', 'technicianToken', null, [200], null, "pm.expect(pm.response.json().data.status).to.eql('IN_PROGRESS');"),
    requestItem('Start labor timer', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/timer/start', 'technicianToken', [
        'notes' => 'Started seal replacement.',
    ], [201], 'laborEntryId'),
    requestItem('Add WO comment', 'POST', '{{tenantBaseUrl}}/comments', 'technicianToken', [
        'entity_type' => 'WORK_ORDER', 'entity_id' => '{{mainWorkOrderId}}', 'body' => 'Old seal removed; coupling condition is acceptable.',
    ], [201], 'commentId'),
    $attachment,
    requestItem('Download optional attachment', 'GET', '{{tenantBaseUrl}}/attachments/{{attachmentId}}/download', 'tenantAdminToken', null, [200], null, '', skipUnless('runAttachment')),
    requestItem('Stop labor timer', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/timer/stop', 'technicianToken', [
        'notes' => 'Paused for spare seal verification.',
    ]),
    requestItem('Put WO on hold', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/hold', 'technicianToken', [
        'reason' => 'Waiting for the correct spare seal.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('ON_HOLD');"),
    requestItem('Resume WO', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/resume', 'technicianToken', [
        'note' => 'Correct spare received.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('IN_PROGRESS');"),
    requestItem('Complete WO first time', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/complete', 'technicianToken', [
        'completion_note' => 'Seal replaced and test run completed.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('COMPLETED');"),
    requestItem('Requester rejects completion', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/reject-completion', 'tenantAdminToken', [
        'reason' => 'Add the post-maintenance vibration reading.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('IN_PROGRESS');"),
    requestItem('Technician completes WO again', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/complete', 'technicianToken', [
        'completion_note' => 'Post-maintenance vibration recorded; machine is normal.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('COMPLETED');"),
    requestItem('Requester verifies and auto-closes WO', 'POST', '{{tenantBaseUrl}}/work-orders/{{mainWorkOrderId}}/verify', 'tenantAdminToken', null, [200], null, "pm.expect(pm.response.json().data.status).to.eql('CLOSED');"),

    requestItem('Create direct WO to reject', 'POST', '{{tenantBaseUrl}}/work-orders', 'tenantAdminToken', [
        'asset_id' => '{{assetId}}', 'title' => 'Duplicate lubrication {{runId}}', 'priority' => 'LOW',
    ], [201], 'rejectedWorkOrderId'),
    requestItem('Maintenance Manager rejects direct WO', 'POST', '{{tenantBaseUrl}}/work-orders/{{rejectedWorkOrderId}}/reject', 'managerToken', [
        'reason' => 'Duplicate of the weekly PM activity.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('REJECTED');"),
    requestItem('Create direct WO to cancel', 'POST', '{{tenantBaseUrl}}/work-orders', 'tenantAdminToken', [
        'asset_id' => '{{assetId}}', 'title' => 'Cancelled direct WO {{runId}}', 'priority' => 'LOW',
    ], [201], 'cancelWorkOrderId'),
    requestItem('Requester cancels pending direct WO', 'POST', '{{tenantBaseUrl}}/work-orders/{{cancelWorkOrderId}}/cancel', 'tenantAdminToken', [
        'reason' => 'The reported condition is no longer present.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('CANCELLED');"),

    requestItem('List Company Admin notifications', 'GET', '{{tenantBaseUrl}}/notifications?per_page=20', 'tenantAdminToken', null, [200], null, <<<'JS'
const rows = pm.response.json().data;
pm.test('At least one notification exists', () => pm.expect(rows.length).to.be.above(0));
if (rows.length) pm.collectionVariables.set('notificationId', rows[0].id);
JS),
    requestItem('Read one notification', 'POST', '{{tenantBaseUrl}}/notifications/{{notificationId}}/read', 'tenantAdminToken'),
    requestItem('Read all notifications', 'POST', '{{tenantBaseUrl}}/notifications/read-all', 'tenantAdminToken'),
    requestItem('Dashboard summary', 'GET', '{{tenantBaseUrl}}/dashboard/summary', 'tenantAdminToken'),
]);

$items[] = folder('06 - Preventive Maintenance Lite', [
    requestItem('Create PM template', 'POST', '{{tenantBaseUrl}}/pm/templates', 'tenantAdminToken', [
        'site_id' => '{{siteId}}', 'code' => 'PM-TPL-{{runId}}', 'name' => 'Monthly Pump Inspection {{runId}}',
        'description' => 'Visual, vibration, temperature, and lubrication inspection.', 'priority' => 'MEDIUM',
        'default_team_id' => '{{teamId}}', 'default_technician_id' => '{{technicianId}}',
        'estimated_duration_minutes' => 60, 'work_instructions' => 'LOTO, inspect, record readings, and test run.', 'status' => 'ACTIVE',
    ], [201], 'pmTemplateId'),
    requestItem('List PM templates', 'GET', '{{tenantBaseUrl}}/pm/templates', 'tenantAdminToken'),
    requestItem('Get PM template', 'GET', '{{tenantBaseUrl}}/pm/templates/{{pmTemplateId}}', 'tenantAdminToken'),
    requestItem('Update PM template', 'PATCH', '{{tenantBaseUrl}}/pm/templates/{{pmTemplateId}}', 'tenantAdminToken', [
        'estimated_duration_minutes' => 75, 'description' => 'Updated by Postman happy flow.',
    ]),
    requestItem('Create PM schedule', 'POST', '{{tenantBaseUrl}}/pm/schedules', 'tenantAdminToken', [
        'pm_template_id' => '{{pmTemplateId}}', 'site_id' => '{{siteId}}', 'asset_id' => '{{assetId}}',
        'code' => 'PM-SCH-{{runId}}', 'name' => 'Monthly Pump Schedule {{runId}}',
        'schedule_mode' => 'COMPLETION_BASED', 'generation_lead_minutes' => 0, 'open_occurrence_policy' => 'HOLD_NEXT',
        'timezone' => 'Asia/Jakarta', 'start_date' => '{{pmStartDate}}', 'status' => 'ACTIVE',
        'trigger' => ['interval_unit' => 'MONTH', 'interval_value' => 1, 'fixed_day_of_month' => 1, 'fixed_local_time' => '08:00'],
    ], [201], 'pmScheduleId'),
    requestItem('List PM schedules', 'GET', '{{tenantBaseUrl}}/pm/schedules?status=ACTIVE', 'tenantAdminToken'),
    requestItem('Get PM schedule', 'GET', '{{tenantBaseUrl}}/pm/schedules/{{pmScheduleId}}', 'tenantAdminToken'),
    requestItem('Update PM schedule', 'PATCH', '{{tenantBaseUrl}}/pm/schedules/{{pmScheduleId}}', 'tenantAdminToken', [
        'generation_lead_minutes' => 60, 'open_occurrence_policy' => 'ALLOW_NEXT',
        'trigger' => ['interval_unit' => 'MONTH', 'interval_value' => 2, 'fixed_day_of_month' => 1, 'fixed_local_time' => '08:00'],
    ]),
    requestItem('Pause PM schedule', 'POST', '{{tenantBaseUrl}}/pm/schedules/{{pmScheduleId}}/pause', 'tenantAdminToken', [
        'reason' => 'Production shutdown test.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('PAUSED');"),
    requestItem('Resume PM schedule', 'POST', '{{tenantBaseUrl}}/pm/schedules/{{pmScheduleId}}/resume', 'tenantAdminToken', null, [200], null, "pm.expect(pm.response.json().data.status).to.eql('ACTIVE');"),
    requestItem('List PM occurrences', 'GET', '{{tenantBaseUrl}}/pm/occurrences?per_page=20', 'tenantAdminToken'),
], 'To generate an occurrence immediately, set the schedule due time accordingly and run php artisan cmms:pm:generate.');

$items[] = folder('07 - Billing Gateway (Conditional)', [
    requestItem('Get Duitku provider config', 'GET', '{{centralBaseUrl}}/platform/billing/providers/{{billingProvider}}/config', 'superAdminToken', null, [200], null, '', skipUnless('runBillingGateway')),
    requestItem('Upsert Duitku sandbox config', 'PUT', '{{centralBaseUrl}}/platform/billing/providers/{{billingProvider}}/config', 'superAdminToken', [
        'environment' => 'SANDBOX', 'merchant_identifier' => '{{duitkuMerchantCode}}',
        'secret_reference' => 'env:DUITKU_API_KEY', 'callback_base_url' => '{{publicCallbackBaseUrl}}',
        'return_base_url' => '{{billingReturnUrl}}',
        'settings' => [
            'transaction_url' => 'https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry',
            'status_url' => 'https://sandbox.duitku.com/webapi/api/merchant/transactionStatus',
        ],
        'is_active' => true,
    ], [200, 201], null, '', skipUnless('runBillingGateway')),
    requestItem('List Duitku provider channels', 'GET', '{{centralBaseUrl}}/platform/billing/providers/{{billingProvider}}/channels', 'superAdminToken', null, [200], null, '', skipUnless('runBillingGateway')),
    requestItem('Upsert Duitku channel', 'PUT', '{{centralBaseUrl}}/platform/billing/providers/{{billingProvider}}/channels/{{duitkuChannelKey}}', 'superAdminToken', [
        'name' => 'Postman Duitku Channel', 'channel_type' => 'VIRTUAL_ACCOUNT', 'minimum_amount' => 10000, 'is_active' => true,
    ], [200, 201], null, '', skipUnless('runBillingGateway')),
    requestItem('Get tenant subscription', 'GET', '{{tenantBaseUrl}}/billing/subscription', 'tenantAdminToken', null, [200], null, '', skipUnless('runBillingGateway')),
    requestItem('List tenant invoices and select one', 'GET', '{{tenantBaseUrl}}/billing/invoices?per_page=20', 'tenantAdminToken', null, [200], null, <<<'JS'
const invoices = pm.response.json().data;
pm.test('A generated payable invoice exists', () => pm.expect(invoices.length).to.be.above(0));
if (invoices.length) pm.collectionVariables.set('invoiceId', invoices[0].id);
JS, skipUnless('runBillingGateway')),
    requestItem('Get tenant invoice', 'GET', '{{tenantBaseUrl}}/billing/invoices/{{invoiceId}}', 'tenantAdminToken', null, [200], null, '', skipUnless('runBillingGateway')),
    requestItem('List tenant payment channels', 'GET', '{{tenantBaseUrl}}/billing/payment-channels', 'tenantAdminToken', null, [200], null, <<<'JS'
const channels = pm.response.json().data;
pm.test('An active payment channel exists', () => pm.expect(channels.length).to.be.above(0));
if (channels.length) pm.collectionVariables.set('paymentChannelId', channels[0].id);
JS, skipUnless('runBillingGateway')),
    requestItem('Create Duitku payment', 'POST', '{{tenantBaseUrl}}/billing/invoices/{{invoiceId}}/payments', 'tenantAdminToken', [
        'payment_channel_id' => '{{paymentChannelId}}', 'idempotency_key' => 'postman-{{runId}}',
    ], [201], 'paymentId', <<<'JS'
const payment = pm.response.json().data;
pm.collectionVariables.set('paymentReference', payment.payment_reference);
pm.collectionVariables.set('paymentAmount', payment.amount);
JS, skipUnless('runBillingGateway')),
    requestItem('Get tenant payment', 'GET', '{{tenantBaseUrl}}/billing/payments/{{paymentId}}', 'tenantAdminToken', null, [200], null, '', skipUnless('runBillingGateway')),
    requestItem('Check payment status at Duitku', 'POST', '{{tenantBaseUrl}}/billing/payments/{{paymentId}}/check-status', 'tenantAdminToken', null, [200], null, '', skipUnless('runBillingGateway')),
    requestItem('Simulate signed failed callback', 'POST', '{{centralBaseUrl}}/billing/providers/{{billingProvider}}/callback', null, [
        'merchantOrderId' => '{{paymentReference}}', 'amount' => '{{paymentAmount}}', 'resultCode' => '01', 'signature' => '{{callbackSignature}}',
    ], [200], null, '', <<<'JS'
if (pm.collectionVariables.get('runBillingGateway') !== 'true') {
    pm.execution.skipRequest();
} else {
    const merchant = pm.environment.get('duitkuMerchantCode');
    const key = pm.environment.get('duitkuApiKey');
    const order = pm.collectionVariables.get('paymentReference');
    const amount = pm.collectionVariables.get('paymentAmount');
    const signature = CryptoJS.HmacSHA256(merchant + amount + order, key).toString(CryptoJS.enc.Hex);
    pm.collectionVariables.set('callbackSignature', signature);
}
JS),
    requestItem('Manually confirm payment', 'POST', '{{centralBaseUrl}}/platform/payments/{{paymentId}}/confirm', 'superAdminToken', [
        'note' => 'Authorized Postman sandbox recovery confirmation.',
    ], [200], null, "pm.expect(pm.response.json().data.status).to.eql('PAID');", skipUnless('runBillingGateway')),
    requestItem('List platform audit logs', 'GET', '{{centralBaseUrl}}/platform/audit-logs?tenant_id={{tenantId}}', 'superAdminToken'),
], 'Disabled by default because it calls Duitku. Complete the documented prerequisites, generate an invoice, then set runBillingGateway=true.');

$items[] = folder('08 - Cleanup and Logout', [
    requestItem('Delete optional attachment', 'DELETE', '{{tenantBaseUrl}}/attachments/{{attachmentId}}', 'tenantAdminToken', null, [204], null, '', skipUnless('runAttachment')),
    requestItem('Remove asset operator assignment', 'DELETE', '{{tenantBaseUrl}}/assets/{{assetId}}/operators/{{operatorAssignmentId}}', 'tenantAdminToken', null, [204]),
    requestItem('Remove technician from team', 'DELETE', '{{tenantBaseUrl}}/teams/{{teamId}}/members/{{technicianId}}', 'tenantAdminToken', null, [204]),
    requestItem('Archive PM schedule', 'DELETE', '{{tenantBaseUrl}}/pm/schedules/{{pmScheduleId}}', 'tenantAdminToken', null, [204]),
    requestItem('Archive PM template', 'DELETE', '{{tenantBaseUrl}}/pm/templates/{{pmTemplateId}}', 'tenantAdminToken', null, [204]),
    requestItem('Archive important asset', 'DELETE', '{{tenantBaseUrl}}/assets/{{importantAssetId}}', 'tenantAdminToken', null, [204]),
    requestItem('Archive normal asset', 'DELETE', '{{tenantBaseUrl}}/assets/{{assetId}}', 'tenantAdminToken', null, [204]),
    requestItem('Archive asset category', 'DELETE', '{{tenantBaseUrl}}/asset-categories/{{categoryId}}', 'tenantAdminToken', null, [204]),
    requestItem('Archive maintenance team', 'DELETE', '{{tenantBaseUrl}}/teams/{{teamId}}', 'tenantAdminToken', null, [204]),
    requestItem('Archive location', 'DELETE', '{{tenantBaseUrl}}/locations/{{locationId}}', 'tenantAdminToken', null, [204]),
    requestItem('Archive site', 'DELETE', '{{tenantBaseUrl}}/sites/{{siteId}}', 'tenantAdminToken', null, [204]),
    requestItem('Logout technician', 'POST', '{{centralBaseUrl}}/auth/logout', 'technicianToken', null, [204]),
    requestItem('Logout Maintenance Manager', 'POST', '{{centralBaseUrl}}/auth/logout', 'managerToken', null, [204]),
    requestItem('Logout Company Admin', 'POST', '{{centralBaseUrl}}/auth/logout', 'tenantAdminToken', null, [204]),
    requestItem('Logout Super Admin', 'POST', '{{centralBaseUrl}}/auth/logout', 'superAdminToken', null, [204]),
], 'Archives tenant master data created by the run and revokes all generated tokens. Tenant and published plan remain because V1 intentionally has no delete endpoint for them.');

$items[] = folder('09 - Self-Service Onboarding (Manual Email)', [
    requestItem('List public plans', 'GET', '{{centralBaseUrl}}/public/plans', null, null, [200], null, <<<'JS'
const plans = pm.response.json().data;
pm.test('At least one public published plan exists', () => pm.expect(plans.length).to.be.above(0));
if (plans.length) pm.collectionVariables.set('selfServicePlanId', plans[0].id);
JS, skipUnless('runSelfServiceOnboarding')),
    requestItem('Get public plan', 'GET', '{{centralBaseUrl}}/public/plans/{{selfServicePlanId}}', null, null, [200], null, '', skipUnless('runSelfServiceOnboarding')),
    requestItem('Register company owner', 'POST', '{{centralBaseUrl}}/onboarding/register', null, [
        'full_name' => 'Self Service Owner', 'email' => '{{selfServiceEmail}}', 'phone' => '+628123456789',
        'password' => '{{selfServicePassword}}', 'password_confirmation' => '{{selfServicePassword}}',
        'company' => [
            'name' => 'Self Service Company {{runId}}', 'email' => '{{selfServiceEmail}}', 'phone' => '+628123456789',
            'industry' => 'Food & Beverage', 'timezone' => 'Asia/Jakarta', 'requested_slug' => 'self-service-{{runId}}',
        ],
        'plan_id' => '{{selfServicePlanId}}', 'billing_period' => 'MONTHLY',
        'terms_accepted' => true, 'privacy_accepted' => true,
    ], [202], null, <<<'JS'
const data = pm.response.json().data;
pm.collectionVariables.set('selfServiceOnboardingId', data.onboarding_id);
JS, <<<'JS'
if (pm.collectionVariables.get('runSelfServiceOnboarding') !== 'true') pm.execution.skipRequest();
pm.request.headers.upsert({key: 'Idempotency-Key', value: `register-${pm.collectionVariables.get('runId')}`});
JS),
    requestItem('Resend verification email', 'POST', '{{centralBaseUrl}}/onboarding/resend-verification', null, [
        'email' => '{{selfServiceEmail}}',
    ], [202], null, '', skipUnless('runSelfServiceOnboarding')),
    requestItem('Verify registration email', 'POST', '{{centralBaseUrl}}/onboarding/verify-email', null, [
        'token' => '{{selfServiceVerificationToken}}',
    ], [200], null, '', skipUnless('runSelfServiceOnboarding'), 'Copy the token query parameter from the Resend email into selfServiceVerificationToken before sending.'),
    requestItem('Login verified owner', 'POST', '{{centralBaseUrl}}/auth/login', null, [
        'email' => '{{selfServiceEmail}}', 'password' => '{{selfServicePassword}}', 'device_name' => 'postman-self-service',
    ], [200], null, <<<'JS'
pm.collectionVariables.set('selfServiceToken', pm.response.json().data.token);
JS, skipUnless('runSelfServiceOnboarding')),
    requestItem('Get own onboarding', 'GET', '{{centralBaseUrl}}/onboarding/{{selfServiceOnboardingId}}', 'selfServiceToken', null, [200], null, '', skipUnless('runSelfServiceOnboarding')),
    requestItem('Update own onboarding before trial', 'PATCH', '{{centralBaseUrl}}/onboarding/{{selfServiceOnboardingId}}', 'selfServiceToken', [
        'industry' => 'Manufacturing - Food & Beverage',
    ], [200], null, '', skipUnless('runSelfServiceOnboarding')),
    requestItem('Start trial and queue provisioning', 'POST', '{{centralBaseUrl}}/onboarding/{{selfServiceOnboardingId}}/provision', 'selfServiceToken', null, [202], null, '', <<<'JS'
if (pm.collectionVariables.get('runSelfServiceOnboarding') !== 'true') pm.execution.skipRequest();
pm.request.headers.upsert({key: 'Idempotency-Key', value: `provision-${pm.collectionVariables.get('runId')}`});
JS),
    requestItem('Poll self-service provisioning status', 'GET', '{{centralBaseUrl}}/onboarding/{{selfServiceOnboardingId}}/status', 'selfServiceToken', null, [200], null, '', skipUnless('runSelfServiceOnboarding')),
    requestItem('Retry failed self-service provisioning', 'POST', '{{centralBaseUrl}}/onboarding/{{selfServiceOnboardingId}}/retry', 'selfServiceToken', null, [202], null, '', <<<'JS'
if (pm.collectionVariables.get('runSelfServiceRetry') !== 'true') pm.execution.skipRequest();
pm.request.headers.upsert({key: 'Idempotency-Key', value: `retry-${Date.now()}`});
JS, 'Only enable when onboarding status is PROVISIONING_FAILED.'),
    requestItem('Cancel disposable onboarding', 'POST', '{{centralBaseUrl}}/onboarding/{{selfServiceOnboardingId}}/cancel', 'selfServiceToken', null, [200, 409], null, '', skipUnless('runSelfServiceCancel'), 'Only succeeds before provisioning starts.'),
], 'Set runSelfServiceOnboarding=true, provide a real inbox, run the queue worker, and copy the token from the Resend email. Retry and cancel are separate conditional branches.');

$happyFlowFolderDescriptions = [
    '01 - Platform Auth and Plans' => 'Authenticates the seeded Super Admin, creates a disposable plan draft, assigns feature entitlements, publishes the version, and verifies immutable publication behavior.',
    '02 - Tenant Onboarding and Admin Auth' => 'Provisions one database-per-tenant company through Super Admin, assigns a subscription, and prepares the Company Admin session.',
    '03 - Organization, Team, and Asset Master Data' => 'Creates the site-scoped organization structure, company roles, maintenance team, asset category, assets, and operator assignment required by later flows.',
    '04 - Maintenance Request Happy Flows' => 'Covers request creation, mandatory Maintenance Manager approval, conversion to a work order, rejection, and cancellation.',
    '05 - Work Order Lifecycle and Supporting Features' => 'Covers direct WO approval, assignment, acknowledgement, execution, labor timer, hold/resume, comments, optional attachment, completion review, verification, rejection, and cancellation.',
    '08 - Cleanup and Logout' => 'Archives disposable tenant master data, removes assignments and optional attachments, then revokes the access tokens created by this run.',
];
foreach ($items as &$happyFlowFolder) {
    if (($happyFlowFolder['description'] ?? '') === '' && isset($happyFlowFolderDescriptions[$happyFlowFolder['name']])) {
        $happyFlowFolder['description'] = $happyFlowFolderDescriptions[$happyFlowFolder['name']];
    }
}
unset($happyFlowFolder);

$collectionVariables = [
    ['key' => 'runRetryProvisioning', 'value' => 'false'],
    ['key' => 'runAttachment', 'value' => 'false'],
    ['key' => 'runBillingGateway', 'value' => 'false'],
    ['key' => 'runSelfServiceOnboarding', 'value' => 'false'],
    ['key' => 'runSelfServiceRetry', 'value' => 'false'],
    ['key' => 'runSelfServiceCancel', 'value' => 'false'],
    ['key' => 'billingProvider', 'value' => 'DUITKU'],
];

foreach ([
    'runId', 'futureDate', 'periodEnd', 'pmStartDate', 'tenantDomain', 'tenantBaseUrl',
    'superAdminToken', 'sourcePlanId', 'featurePayload', 'runnerPlanId', 'publishedPlanId', 'draftPlanId',
    'tenantId', 'subscriptionId', 'tenantAdminEmail', 'tenantAdminToken',
    'siteId', 'locationId', 'supervisorId', 'managerId', 'managerEmail', 'managerToken', 'technicianId', 'operatorId', 'technicianEmail', 'technicianToken',
    'teamId', 'teamMemberId', 'categoryId', 'assetId', 'importantAssetId', 'operatorAssignmentId',
    'normalRequestId', 'requestWorkOrderId', 'approvalRequestId', 'approvedWorkOrderId', 'rejectRequestId', 'cancelRequestId',
    'mainWorkOrderId', 'rejectedWorkOrderId', 'cancelWorkOrderId', 'laborEntryId', 'commentId', 'attachmentId', 'notificationId',
    'pmTemplateId', 'pmScheduleId', 'invoiceId', 'paymentChannelId', 'paymentId', 'paymentReference', 'paymentAmount', 'callbackSignature',
    'selfServicePlanId', 'selfServiceOnboardingId', 'selfServiceToken',
] as $variable) {
    $collectionVariables[] = ['key' => $variable, 'value' => ''];
}

$collection = [
    'info' => [
        '_postman_id' => '8bbef23f-5ae7-48dd-92df-aitoma-cmms-v1',
        'name' => 'AITOMA CMMS API V1 - Happy Flow',
        'description' => 'Executable end-to-end regression collection. Import the local environment, fill its required secrets, and run folders in numeric order. Conditional retry, attachment, billing, and self-service branches are disabled by default. For endpoint lookup use the separate By Feature collection; see docs/FRONTEND_BACKEND_HANDOFF.md.',
        'schema' => 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    ],
    'item' => $items,
    'variable' => $collectionVariables,
];

$environment = [
    'id' => '54055229-4fa0-44db-a93f-aitoma-cmms-local',
    'name' => 'AITOMA CMMS - Local Development',
    'values' => [
        ['key' => 'appBaseUrl', 'value' => 'http://localhost:8000', 'enabled' => true, 'description' => 'Laravel application root; no /api/v1 suffix.'],
        ['key' => 'centralBaseUrl', 'value' => 'http://localhost:8000/api/v1', 'enabled' => true, 'description' => 'Central identity, onboarding, platform, and provider-callback API base URL.'],
        ['key' => 'tenantBaseUrl', 'value' => 'http://demo.localhost:8000/api/v1', 'enabled' => true, 'description' => 'Company API base URL. Replace demo with the provisioned tenant domain.'],
        ['key' => 'tenantScheme', 'value' => 'http', 'enabled' => true, 'description' => 'Used by the Happy Flow pre-request script when building a disposable tenant URL.'],
        ['key' => 'tenantPort', 'value' => '8000', 'enabled' => true, 'description' => 'Local Laravel port used for dynamically generated tenant domains.'],
        ['key' => 'authToken', 'value' => '', 'enabled' => true, 'type' => 'secret', 'description' => 'Bearer token used by the By Feature reference collection.'],
        ['key' => 'loginEmail', 'value' => '', 'enabled' => true, 'description' => 'Account used by the generic By Feature login request.'],
        ['key' => 'loginPassword', 'value' => '', 'enabled' => true, 'type' => 'secret', 'description' => 'Password used by the generic By Feature login request.'],
        ['key' => 'deviceName', 'value' => 'postman-local', 'enabled' => true, 'description' => 'Human-readable Sanctum token/device label.'],
        ['key' => 'superAdminEmail', 'value' => 'admin@aitoma.id', 'enabled' => true, 'description' => 'Seeded platform Super Admin email.'],
        ['key' => 'superAdminPassword', 'value' => '', 'enabled' => true, 'type' => 'secret', 'description' => 'Seeded platform Super Admin password from local setup.'],
        ['key' => 'tenantAdminTemporaryPassword', 'value' => 'Postman12345', 'enabled' => true, 'type' => 'secret', 'description' => 'Temporary password assigned during Super Admin tenant provisioning.'],
        ['key' => 'tenantAdminPassword', 'value' => 'Postman67890', 'enabled' => true, 'type' => 'secret', 'description' => 'Replacement Company Admin password after mandatory password change.'],
        ['key' => 'testUserTemporaryPassword', 'value' => 'Postman12345', 'enabled' => true, 'type' => 'secret', 'description' => 'Temporary password for generated Manager, Supervisor, Technician, and Operator users.'],
        ['key' => 'testUserPassword', 'value' => 'Postman67890', 'enabled' => true, 'type' => 'secret', 'description' => 'Replacement password for generated tenant users.'],
        ['key' => 'newUserEmail', 'value' => 'user@example.com', 'enabled' => true, 'description' => 'Generic company-user email used by the By Feature collection.'],
        ['key' => 'newUserRoleKey', 'value' => 'TECHNICIAN', 'enabled' => true, 'description' => 'Role for generic company-user creation.'],
        ['key' => 'newUserTemporaryPassword', 'value' => 'ChangeMe12345', 'enabled' => true, 'type' => 'secret', 'description' => 'Temporary password for generic company-user creation.'],
        ['key' => 'selfServiceEmail', 'value' => '', 'enabled' => true, 'description' => 'Real inbox used to test Resend verification.'],
        ['key' => 'selfServicePassword', 'value' => 'Postman67890', 'enabled' => true, 'type' => 'secret', 'description' => 'Password submitted in self-service registration.'],
        ['key' => 'selfServiceVerificationToken', 'value' => '', 'enabled' => true, 'type' => 'secret', 'description' => 'Token copied from the verification email link.'],
        ['key' => 'sampleFilePath', 'value' => '', 'enabled' => true, 'description' => 'Absolute local image/video path. Select the file manually when Postman cannot resolve it.'],
        ['key' => 'duitkuMerchantCode', 'value' => '', 'enabled' => true, 'description' => 'Duitku sandbox or production merchant code.'],
        ['key' => 'duitkuApiKey', 'value' => '', 'enabled' => true, 'type' => 'secret', 'description' => 'Duitku API key; the backend reads its own DUITKU_API_KEY environment variable.'],
        ['key' => 'duitkuChannelKey', 'value' => 'VC', 'enabled' => true, 'description' => 'Duitku payment method code, for example VC or a configured QRIS/VA code.'],
        ['key' => 'publicCallbackBaseUrl', 'value' => 'https://example.ngrok-free.app', 'enabled' => true, 'description' => 'Public HTTPS URL forwarding callbacks to the local central API.'],
        ['key' => 'billingReturnUrl', 'value' => 'http://localhost:3000/billing', 'enabled' => true, 'description' => 'Frontend page shown after the payment-provider flow.'],
    ],
    '_postman_variable_scope' => 'environment',
    '_postman_exported_using' => 'AITOMA CMMS generator',
];

if (! is_dir($outputDirectory) && ! mkdir($outputDirectory, 0777, true) && ! is_dir($outputDirectory)) {
    throw new RuntimeException('Unable to create Postman output directory.');
}

file_put_contents(
    $outputDirectory.'/AITOMA_CMMS_API_V1.postman_collection.json',
    json_encode($collection, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
);
file_put_contents(
    $outputDirectory.'/AITOMA_CMMS_LOCAL.postman_environment.json',
    json_encode($environment, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL,
);

echo 'Generated '.count($items).' Postman folders in '.$outputDirectory.PHP_EOL;

require __DIR__.'/generate_postman_feature_docs.php';
