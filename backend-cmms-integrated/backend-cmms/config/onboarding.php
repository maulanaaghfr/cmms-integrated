<?php

return [
    'trial_days' => (int) env('ONBOARDING_TRIAL_DAYS', 30),
    'registration_ttl_hours' => (int) env('ONBOARDING_REGISTRATION_TTL_HOURS', 72),
    'verification_ttl_minutes' => (int) env('ONBOARDING_VERIFICATION_TTL_MINUTES', 60),
    'terms_version' => env('ONBOARDING_TERMS_VERSION', '2026-08-01'),
    'privacy_version' => env('ONBOARDING_PRIVACY_VERSION', '2026-08-01'),
    'mailer' => env('ONBOARDING_MAILER', 'resend'),
    'frontend_url' => rtrim((string) env('FRONTEND_URL', 'http://localhost:3000'), '/'),
    'tenant_domain_suffix' => trim((string) env('TENANCY_TENANT_DOMAIN_SUFFIX', 'localhost'), '.'),
    'tenant_scheme' => env('TENANCY_TENANT_SCHEME', 'http'),
    'tenant_port' => env('TENANCY_TENANT_PORT', '8000'),
    'reserved_slugs' => [
        'admin', 'api', 'app', 'auth', 'billing', 'help', 'mail', 'platform', 'public',
        'status', 'support', 'www',
    ],
];
