<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Stancl\Tenancy\Database\Concerns\CentralConnection;

class OnboardingRegistration extends Model
{
    use CentralConnection, HasUlids;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'consented_at' => 'datetime',
            'email_verified_at' => 'datetime',
            'email_verification_expires_at' => 'datetime',
            'verification_sent_at' => 'datetime',
            'expires_at' => 'datetime',
            'completed_at' => 'datetime',
            'metadata' => 'array',
        ];
    }
}
