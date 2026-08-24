<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Support\ApiData;
use Illuminate\Support\Facades\DB;

class PublicPlanController extends Controller
{
    public function index(): mixed
    {
        $plans = $this->query()->orderBy('monthly_price')->get();
        foreach ($plans as $plan) {
            $plan->features = $this->features($plan->id);
            $plan->trial_days = (int) config('onboarding.trial_days');
            $plan->billing_periods = $plan->annual_price === null ? ['MONTHLY'] : ['MONTHLY', 'YEARLY'];
        }

        return ApiData::item($plans);
    }

    public function show(string $plan): mixed
    {
        $row = $this->query()->where('id', $plan)->first()
            ?? throw new ApiException('PLAN_NOT_FOUND', 'Public plan was not found.', 404);
        $row->features = $this->features($row->id);
        $row->trial_days = (int) config('onboarding.trial_days');
        $row->billing_periods = $row->annual_price === null ? ['MONTHLY'] : ['MONTHLY', 'YEARLY'];

        return ApiData::item($row);
    }

    private function query(): mixed
    {
        return DB::table('plans')
            ->where('status', 'PUBLISHED')
            ->where('is_public', true)
            ->where(fn ($query) => $query->whereNull('effective_from')->orWhere('effective_from', '<=', now()))
            ->where(fn ($query) => $query->whereNull('effective_until')->orWhere('effective_until', '>', now()));
    }

    private function features(string $planId): mixed
    {
        return DB::table('plan_features')
            ->join('features', 'features.id', '=', 'plan_features.feature_id')
            ->where('plan_features.plan_id', $planId)
            ->where('features.is_active', true)
            ->select(
                'features.key', 'features.name', 'features.description', 'features.feature_type',
                'plan_features.is_enabled', 'plan_features.numeric_limit', 'plan_features.config_value'
            )
            ->orderBy('features.key')
            ->get();
    }
}
