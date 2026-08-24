<?php

declare(strict_types=1);

namespace App\Models;

use Laravel\Sanctum\PersonalAccessToken;
use Stancl\Tenancy\Database\Concerns\CentralConnection;

class CentralPersonalAccessToken extends PersonalAccessToken
{
    use CentralConnection;

    /**
     * Keep Sanctum tokens in the central table created by Laravel's
     * personal access token migration. Without this explicit mapping,
     * Eloquent derives central_personal_access_tokens from this class name.
     */
    protected $table = 'personal_access_tokens';
}
