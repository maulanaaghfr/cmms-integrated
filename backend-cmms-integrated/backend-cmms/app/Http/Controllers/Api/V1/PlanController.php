<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\AuditService;
use App\Services\PlanChangeNotifier;
use App\Services\PlanSnapshotService;
use App\Support\ApiData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PlanController extends Controller
{
    /** Subscriptions that make a plan "in use" (blocks delete). */
    private const IN_USE = ['PENDING_PAYMENT', 'TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED'];

    private const TRACKED = [
        'name' => 'Nama', 'description' => 'Deskripsi', 'monthly_price' => 'Harga bulanan', 'annual_price' => 'Harga tahunan',
        'max_users' => 'Limit pengguna', 'max_assets' => 'Limit aset', 'max_sites' => 'Limit lokasi',
    ];

    public function __construct(
        private readonly AuditService $audit,
        private readonly PlanChangeNotifier $notifier,
        private readonly PlanSnapshotService $snapshots,
    ) {}

    public function index(Request $request): mixed
    {
        $query = DB::table('plans')->whereNull('deleted_at')->select('plans.*')
            ->selectSub(fn ($q) => $q->from('subscriptions')->selectRaw('count(*)')
                ->whereColumn('subscriptions.plan_id', 'plans.id')->whereIn('subscriptions.status', self::IN_USE), 'subscriber_count')
            ->orderBy('key')->orderByDesc('version_number');
        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }

        return ApiData::paginated($query->paginate($request->integer('per_page', 20)));
    }

    public function show(string $plan): mixed
    {
        $row = $this->find($plan);
        $row->subscriber_count = $this->subscriberCount($plan);
        $row->features = DB::table('plan_features')->join('features', 'features.id', '=', 'plan_features.feature_id')
            ->where('plan_features.plan_id', $plan)
            ->select('features.id', 'features.key', 'features.name', 'features.feature_type', 'plan_features.is_enabled', 'plan_features.numeric_limit', 'plan_features.config_value')
            ->get();

        return ApiData::item($row);
    }

    public function store(Request $request): mixed
    {
        $data = $this->validatePlan($request);
        $version = $data['version_number'] ?? 1;
        if (DB::table('plans')->where('key', $data['key'])->where('version_number', $version)->exists()) {
            throw new ApiException('PLAN_KEY_VERSION_TAKEN', 'Kode paket dan nomor versi tersebut sudah dipakai.', 409);
        }
        $id = (string) Str::ulid();
        DB::table('plans')->insert([
            'id' => $id, ...$data, 'version_number' => $version,
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
        $data = $this->validatePlan($request, true, $plan);
        if ($before->status !== 'DRAFT') {
            unset($data['key'], $data['version_number']);
        }
        DB::table('plans')->where('id', $plan)->update([...$data, 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now()]);
        $after = $this->find($plan);
        $this->audit->platform($request, 'plan.updated', 'PLAN', $plan, $before, $after);
        // Running subscribers keep their snapshot; they are only told what changes and when.
        $this->notifier->notify($after, $this->diff($before, $after));

        return $this->show($plan);
    }

    public function destroy(Request $request, string $plan): mixed
    {
        $row = null;
        DB::transaction(function () use ($plan, &$row): void {
            $row = DB::table('plans')->where('id', $plan)->whereNull('deleted_at')->lockForUpdate()->first()
                ?? throw new ApiException('PLAN_NOT_FOUND', 'Plan was not found.', 404);
            $count = $this->subscriberCount($plan);
            if ($count > 0) {
                throw new ApiException('PLAN_IN_USE', "Paket masih digunakan oleh {$count} subscriber dan tidak dapat dihapus. Ubah statusnya menjadi draft, archive, atau inactive.", 409, [
                    'subscriber_count' => $count, 'allowed_statuses' => ['DRAFT', 'INACTIVE', 'ARCHIVED'],
                ]);
            }
            // Soft delete only: subscriptions/invoices keep referencing the row.
            DB::table('plans')->where('id', $plan)->update([
                'deleted_at' => now(), 'is_public' => false, 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now(),
            ]);
        });
        $this->audit->platform($request, 'plan.deleted', 'PLAN', $plan, $row);

        return response()->json(null, 204);
    }

    public function status(Request $request, string $plan): mixed
    {
        $data = $request->validate(['status' => ['required', Rule::in(['DRAFT', 'PUBLISHED', 'INACTIVE', 'ARCHIVED'])]]);
        $before = $this->find($plan);
        if ($before->status === $data['status']) {
            return $this->show($plan);
        }
        $update = ['status' => $data['status'], 'lock_version' => DB::raw('lock_version + 1'), 'updated_at' => now()];
        if ($data['status'] === 'PUBLISHED') {
            $update['published_at'] = $before->published_at ?: now();
            $update['published_by'] = $before->published_by ?: $request->user()->id;
            $update['effective_from'] = $before->effective_from ?: now();
        }
        DB::table('plans')->where('id', $plan)->update($update);
        $this->audit->platform($request, 'plan.status_changed', 'PLAN', $plan, $before, $this->find($plan));

        return $this->show($plan);
    }

    public function subscribers(string $plan): mixed
    {
        $this->find($plan);
        $rows = DB::table('subscriptions')->join('tenants', 'tenants.id', '=', 'subscriptions.tenant_id')
            ->where('subscriptions.plan_id', $plan)->whereIn('subscriptions.status', self::IN_USE)
            ->orderBy('tenants.name')->limit(50)
            ->get(['subscriptions.id', 'tenants.id as tenant_id', 'tenants.name as tenant_name', 'subscriptions.status', 'subscriptions.current_period_end']);

        return ApiData::item(['plan_id' => $plan, 'subscriber_count' => $this->subscriberCount($plan), 'subscribers' => $rows]);
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
        $data = $request->validate([
            'features' => ['required', 'array'],
            'features.*.feature_id' => ['required', 'ulid', Rule::exists('features', 'id')],
            'features.*.is_enabled' => ['required', 'boolean'],
            'features.*.numeric_limit' => ['nullable', 'numeric', 'min:0'],
            'features.*.config_value' => ['nullable', 'array'],
        ]);
        $before = $this->featureState($plan);
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
        $this->notifier->notify($row, $this->featureDiff($before, $this->featureState($plan)));

        return $this->show($plan);
    }

    public function replaceSubscription(Request $request, string $tenant): mixed
    {
        $data = $request->validate([
            'plan_id' => ['required', 'ulid', Rule::exists('plans', 'id')->where('status', 'PUBLISHED')->whereNull('deleted_at')],
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
                'price_snapshot' => $this->snapshots->priceFor($plan, $data['billing_period']),
                ...$this->snapshots->forPlan(DB::connection(), $plan),
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
        return DB::table('plans')->where('id', $id)->whereNull('deleted_at')->first()
            ?? throw new ApiException('PLAN_NOT_FOUND', 'Plan was not found.', 404);
    }

    private function subscriberCount(string $planId): int
    {
        return DB::table('subscriptions')->where('plan_id', $planId)->whereIn('status', self::IN_USE)->count();
    }

    private function diff(object $before, object $after): array
    {
        $lines = [];
        foreach (self::TRACKED as $field => $label) {
            $old = $before->{$field};
            $new = $after->{$field};
            if (is_numeric($old) && is_numeric($new) ? (float) $old === (float) $new : $old === $new) {
                continue;
            }
            $lines[] = match ($field) {
                'monthly_price', 'annual_price' => $label.': '.$this->money($old, (string) $before->currency_code).' → '.$this->money($new, (string) $after->currency_code),
                'max_users', 'max_assets', 'max_sites' => $label.': '.($old ?? 'tanpa batas').' → '.($new ?? 'tanpa batas'),
                'name' => $label.': '.$old.' → '.$new,
                default => $label.' diperbarui',
            };
        }

        return $lines;
    }

    private function money(mixed $value, string $currency): string
    {
        return $value === null ? 'tidak tersedia' : $currency.' '.number_format((float) $value, 0, ',', '.');
    }

    private function featureState(string $planId): array
    {
        return DB::table('plan_features')->join('features', 'features.id', '=', 'plan_features.feature_id')
            ->where('plan_features.plan_id', $planId)
            ->get(['features.id', 'features.name', 'plan_features.is_enabled', 'plan_features.numeric_limit'])
            ->mapWithKeys(fn ($r) => [$r->id => [
                'name' => $r->name, 'enabled' => (bool) $r->is_enabled,
                'limit' => $r->numeric_limit !== null ? (float) $r->numeric_limit : null,
            ]])->all();
    }

    private function featureDiff(array $before, array $after): array
    {
        $lines = [];
        foreach ($after as $id => $now) {
            $old = $before[$id] ?? null;
            if ($old === null) {
                if ($now['enabled']) {
                    $lines[] = 'Layanan ditambahkan: '.$now['name'];
                }
            } elseif ($old['enabled'] !== $now['enabled']) {
                $lines[] = ($now['enabled'] ? 'Layanan diaktifkan: ' : 'Layanan dinonaktifkan: ').$now['name'];
            } elseif ($now['enabled'] && $old['limit'] !== $now['limit']) {
                $lines[] = 'Limit '.$now['name'].': '.($old['limit'] ?? 'tanpa batas').' → '.($now['limit'] ?? 'tanpa batas');
            }
        }

        return $lines;
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
