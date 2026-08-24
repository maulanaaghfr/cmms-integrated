<?php

declare(strict_types=1);

namespace App\Data;

final readonly class ProvisionTenantData
{
    public function __construct(
        public string $requestId,
        public string $source,
        public ?string $actorUserId,
        public string $ownerUserId,
        public string $companyName,
        public string $companyEmail,
        public ?string $companyPhone,
        public ?string $industry,
        public string $timezone,
        public string $code,
        public string $slug,
        public string $domain,
        public string $planId,
        public string $billingPeriod,
        public int $trialDays,
        public ?string $onboardingId = null,
        public array $context = [],
    ) {}
}
