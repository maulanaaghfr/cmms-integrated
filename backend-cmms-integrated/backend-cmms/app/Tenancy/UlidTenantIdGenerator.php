<?php

declare(strict_types=1);

namespace App\Tenancy;

use Illuminate\Support\Str;
use Stancl\Tenancy\Contracts\UniqueIdentifierGenerator;

final class UlidTenantIdGenerator implements UniqueIdentifierGenerator
{
    public static function generate($resource): string
    {
        return (string) Str::ulid();
    }
}
