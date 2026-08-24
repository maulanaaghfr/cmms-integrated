<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Stancl\Tenancy\Database\Models\Domain as BaseDomain;

class Domain extends BaseDomain
{
    use HasUlids;

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
        ];
    }
}
