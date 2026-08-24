<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\AuditService;
use App\Support\ApiData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PlanController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    public function index(Request $request): mixed
    {
        $plans = DB::table('plans')->orderBy('key')->orderByDesc('version_number')->paginate($request->integer('per_page', 20));

        return ApiData::paginated($plans);
    }

    public function show(string $plan): mixed
    {
        $row = $this->find($plan);
        $row->features = DB::table('plan_features')->join('features', 'features.id', '=', 'plan_features.feature_id')
            ->where('plan_features.plan_id', $plan)
            ->select('features.id', 'features.key', 'features.name', 'features.feature_type', 'plan_features.is_enabled', 'plan_features.numeric_limit', 'plan_features.config_value')
            ->get();

        return ApiData::item($row);
    }

    public function store(Request $request): mixed
    {
        $data = $this->validatePlan($request);
        $id = (string) Str::ulid();
        DB::table('plans')->insert([
            'id' => $id, ...$data, 'version_number' => $data['version_number'] ?? 1,
            'status' => 'DRAFT', 'is_public' => $data['is_public'] ?? false,
            'effective_from' => null, 'effective_until' => null, 'published_at' => null, 'published_by' => null,
            'lock_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->audit->platform($request, 'plan.created', 'PLAN', $id, null, $data);

        return $this->show($id)->setStatusCode(201);
    }

    public function update(Request $request, string $plan): mixed
    {
        $before = $this->find($plan);
        if ($before->status !== 'DRAFT') {
            throw new ApiException('PUBLISHED_PLAN_IMMUTABLE', 'Published or retired plans cannot be edited; create a new version.', 409);
        }
        $data = $this->validatePlan($request, true, $plan);
        DB::table('plans')->where('id', $plan)->update([...$data, 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now()]);
        $this->audit->platform($request, 'plan.updated', 'PLAN', $plan, $before, $this->find($plan));

        return $this->show($plan);
    }

    public function destroy(Request $request, string $plan): mixed
    {
        $row = $this->find($plan);
        if ($row->status !== 'DRAFT' || DB::table('subscriptions')->where('plan_id', $plan)->exists()) {
            throw new ApiException('PLAN_DELETE_FORBIDDEN', 'Only unused draft plans may be deleted.', 409);
        }
        DB::table('plans')->where('id', $plan)->delete();
        $this->audit->platform($request, 'plan.deleted', 'PLAN', $plan, $row);

        return response()->json(null, 204);
    }

    public function publish(Request $request, string $plan): mixed
    {
        $row = $this->find($plan);
        if ($row->status !== 'DRAFT') {
            throw new ApiException('PLAN_NOT_DRAFT', 'Only draft plans can be published.', 409);
        }
        DB::table('plans')->where('id', $plan)->update([
            'status' => 'PUBLISHED', 'published_at' => now(), 'published_by' => $request->user()->id,
            'effective_from' => $row->effective_from ?: now(), 'updated_at' => now(),
        ]);
        $this->audit->platform($request, 'plan.published', 'PLAN', $plan, $row, $this->find($plan));

        return $this->show($plan);
    }

    public function features(Request $request, string $plan): mixed
    {
        $row = $this->find($plan);
        if ($row->status !== 'DRAFT') {
            throw new ApiException('PUBLISHED_PLAN_IMMUTABLE', 'Published plan features cannot be edited.', 409);
        }
        $data = $request->validate([
            'features' => ['required', 'array'],
            'features.*.feature_id' => ['required', 'ulid', Rule::exists('features', 'id')],
            'features.*.is_enabled' => ['required', 'boolean'],
            'features.*.numeric_limit' => ['nullable', 'numeric', 'min:0'],
            'features.*.config_value' => ['nullable', 'array'],
        ]);
        DB::transaction(function () use ($plan, $data): void {
            foreach ($data['features'] as $feature) {
                $id = DB::table('plan_features')->where('plan_id', $plan)->where('feature_id', $feature['feature_id'])->value('id') ?: (string) Str::ulid();
                DB::table('plan_features')->updateOrInsert(['plan_id' => $plan, 'feature_id' => $feature['feature_id']], [
                    'id' => $id, 'is_enabled' => $feature['is_enabled'], 'numeric_limit' => $feature['numeric_limit'] ?? null,
                    'config_value' => isset($feature['config_value']) ? json_encode($feature['config_value']) : null,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });
        $this->audit->platform($request, 'plan.features_updated', 'PLAN', $plan, null, $data);

        return $this->show($plan);
    }

    public function replaceSubscription(Request $request, string $tenant): mixed
    {
        $data = $request->validate([
            'plan_id' => ['required', 'ulid', Rule::exists('plans', 'id')->where('status', 'PUBLISHED')],
            'status' => ['required', Rule::in(['TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED'])],
            'billing_period' => ['required', Rule::in(['MONTHLY', 'YEARLY'])],
            'starts_at' => ['nullable', 'date'],
            'current_period_end' => ['required', 'date'],
            'trial_ends_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);
        $tenantRow = DB::table('tenants')->where('id', $tenant)->first();
        $plan = DB::table('plans')->where('id', $data['plan_id'])->first();
        if (! $tenantRow || ! $plan) {
            throw new ApiException('RESOURCE_NOT_FOUND', 'Tenant or plan was not found.', 404);
        }
        $id = (string) Str::ulid();
        DB::transaction(function () use ($tenant, $data, $plan, $id): void {
            DB::table('subscriptions')->where('tenant_id', $tenant)->whereIn('status', ['TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED'])->update([
                'status' => 'CANCELLED', 'cancelled_at' => now(), 'cancellation_reason' => 'Replaced by Super Admin', 'updated_at' => now(),
            ]);
            DB::table('subscriptions')->insert([
                'id' => $id, 'tenant_id' => $tenant, 'plan_id' => $plan->id, 'status' => $data['status'],
                'billing_period' => $data['billing_period'],
                'price_snapshot' => $data['billing_period'] === 'YEARLY' ? ($plan->annual_price ?? $plan->monthly_price * 12) : $plan->monthly_price,
                'currency_code' => $plan->currency_code, 'starts_at' => $data['starts_at'] ?? now(),
                'trial_ends_at' => $data['trial_ends_at'] ?? null, 'current_period_start' => $data['starts_at'] ?? now(),
                'current_period_end' => $data['current_period_end'], 'grace_ends_at' => null, 'auto_renew' => true,
                'cancelled_at' => null, 'cancellation_reason' => null, 'notes' => $data['notes'] ?? null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        });
        $this->audit->platform($request, 'subscription.replaced', 'SUBSCRIPTION', $id, null, $data, $tenant);

        return ApiData::item(DB::table('subscriptions')->where('id', $id)->first(), 201);
    }

    public function audits(Request $request): mixed
    {
        $query = DB::table('platform_audit_logs')->orderByDesc('occurred_at');
        if ($request->filled('tenant_id')) {
            $query->where('tenant_id', $request->string('tenant_id'));
        }

        return ApiData::paginated($query->paginate($request->integer('per_page', 20)));
    }

    private function find(string $id): object
    {
        return DB::table('plans')->where('id', $id)->first()
            ?? throw new ApiException('PLAN_NOT_FOUND', 'Plan was not found.', 404);
    }

    private function validatePlan(Request $request, bool $partial = false, ?string $ignore = null): array
    {
        $mode = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'key' => [$mode, 'string', 'max:40'], 'version_number' => [$mode, 'integer', 'min:1'],
            'name' => [$mode, 'string', 'max:255'], 'description' => ['nullable', 'string'],
            'monthly_price' => [$mode, 'numeric', 'min:0'], 'annual_price' => ['nullable', 'numeric', 'min:0'],
            'currency_code' => [$mode, 'string', 'size:3'], 'max_users' => ['nullable', 'integer', 'min:1'],
            'max_assets' => ['nullable', 'integer', 'min:1'], 'max_sites' => ['nullable', 'integer', 'min:1'],
            'is_public' => ['sometimes', 'boolean'], 'effective_from' => ['nullable', 'date'], 'effective_until' => ['nullable', 'date', 'after:effective_from'],
        ]);
    }
}
