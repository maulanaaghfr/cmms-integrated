<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Str;

final class CmmsNumber
{
    public static function make(string $prefix): string
    {
        return sprintf('%s-%s-%s', $prefix, now()->format('Ymd'), Str::upper(Str::random(8)));
    }
}
