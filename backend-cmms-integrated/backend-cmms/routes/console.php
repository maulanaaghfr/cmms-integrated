<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('cmms:pm:generate')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('cmms:billing:generate-invoices')->dailyAt('01:00')->withoutOverlapping();
