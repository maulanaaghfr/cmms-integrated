<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Data\ProvisionTenantData;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AuditService;
use App\Services\TenantProvisioningService;
use App\Support\ApiData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PlatformController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly TenantProvisioningService $provisioning,
    ) {}

    public function tenants(Request $request): mixed
    {
        $query = Tenant::query()->with('domains');
        if ($request->filled('search')) {
            $search = '%'.$request->string('search').'%';
            $query->where(fn ($q) => $q->where('name', 'ilike', $search)->orWhere('code', 'ilike', $search));
        }

        return ApiData::paginated($query->orderBy('name')->paginate($request->integer('per_page', 20)));
    }

    public function users(Request $request): mixed
    {
        $query = User::query()->where('platform_role', 'SUPER_ADMIN');
        if ($request->filled('search')) {
            $search = '%'.$request->string('search').'%';
            $query->where(fn ($q) => $q->where('full_name', 'ilike', $search)->orWhere('email', 'ilike', $search));
        }

        return ApiData::paginated(
            $query->select(['id', 'full_name', 'email', 'status', 'platform_role', 'last_login_at', 'created_at'])
                ->orderBy('full_name')
                ->paginate(min(max($request->integer('per_page', 20), 1), 100))
        );
    }

    public function revenue(): mixed
    {
        $central = DB::connection(config('tenancy.database.central_connection'));
        $mrr = (float) $central->table('subscriptions')
            ->whereIn('status', ['ACTIVE', 'GRACE'])
            ->selectRaw("COALESCE(SUM(CASE WHEN billing_period = 'ANNUAL' THEN price_snapshot / 12 ELSE price_snapshot END), 0) AS value")
            ->value('value');
        $paidTotal = (float) $central->table('invoices')->where('status', 'PAID')->sum('amount_paid');
        $paidThisMonth = (float) $central->table('invoices')->where('status', 'PAID')->whereBetween('paid_at', [now()->startOfMonth(), now()->endOfMonth()])->sum('amount_paid');
        $trend = $central->table('invoices')->where('status', 'PAID')->where('paid_at', '>=', now()->subMonths(5)->startOfMonth())
            ->selectRaw("to_char(date_trunc('month', paid_at), 'YYYY-MM') as month, COALESCE(SUM(amount_paid), 0) as revenue")
            ->groupByRaw("date_trunc('month', paid_at)")->orderByRaw("date_trunc('month', paid_at)")->get();

        return ApiData::item(['mrr' => $mrr, 'paid_total' => $paidTotal, 'paid_this_month' => $paidThisMonth, 'trend' => $trend]);
    }

    public function tenant(Tenant $tenant): mixed
    {
        $tenant->load('domains');
        $usage = ['users' => null, 'assets' => null, 'sites' => null];
        if ($tenant->database_status === 'READY') {
            $usage = $tenant->run(fn () => [
                'users' => DB::table('tenant_users')->where('status', 'ACTIVE')->count(),
                'assets' => DB::table('assets')->where('is_active', true)->count(),
                'sites' => DB::table('sites')->where('is_active', true)->count(),
            ]);
        }

        return ApiData::item(['tenant' => $tenant, 'usage' => $usage]);
    }

    public function createTenant(Request $request): mixed
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:60', 'regex:/^[A-Za-z0-9_-]+$/', Rule::unique('tenants', 'code')],
            'name' => ['required', 'string', 'max:255'],
            'domain' => ['required', 'string', 'max:255', Rule::unique('domains', 'domain')],
            'email' => ['required', 'email', 'max:320'],
            'phone' => ['nullable', 'string', 'max:32'],
            'industry' => ['nullable', 'string', 'max:100'],
            'timezone' => ['required', 'timezone:all'],
            'admin.full_name' => ['required', 'string', 'max:255'],
            'admin.email' => ['required', 'email', 'max:320'],
            'admin.phone' => ['nullable', 'string', 'max:32'],
            'admin.temporary_password' => ['required', 'string', 'min:8'],
            'plan_id' => ['required', 'ulid', Rule::exists('plans', 'id')->where('status', 'PUBLISHED')],
            'trial_days' => ['nullable', 'integer', 'min:0', 'max:365'],
        ]);
        $adminEmail = mb_strtolower($data['admin']['email']);
        $user = User::query()->where('email', $adminEmail)->first();
        if (! $user) {
            $user = User::create([
                'email' => $adminEmail,
                'password_hash' => Hash::make($data['admin']['temporary_password']),
                'full_name' => $data['admin']['full_name'],
                'phone' => $data['admin']['phone'] ?? null,
                'status' => 'ACTIVE',
                'must_change_password' => true,
            ]);
        }
        $user->email_verified_at ??= now();
        $user->save();

        $requestId = 'platform:'.($request->header('Idempotency-Key') ?: (string) Str::ulid());
        $attempt = $this->provisioning->start(new ProvisionTenantData(
            requestId: $requestId,
            source: 'PLATFORM_ADMIN',
            actorUserId: $request->user()->id,
            ownerUserId: $user->id,
            companyName: $data['name'],
            companyEmail: $data['email'],
            companyPhone: $data['phone'] ?? null,
            industry: $data['industry'] ?? null,
            timezone: $data['timezone'],
            code: $data['code'],
            slug: Str::slug($data['code']),
            domain: $data['domain'],
            planId: $data['plan_id'],
            billingPeriod: 'MONTHLY',
            trialDays: $data['trial_days'] ?? (int) config('onboarding.trial_days'),
            context: ['ip' => $request->ip(), 'user_agent' => $request->userAgent()],
        ), synchronous: true);
        $tenant = Tenant::query()->findOrFail($attempt->tenant_id);
        $this->audit->platform($request, 'tenant.created', 'TENANT', $tenant->id, null, $tenant->toArray(), $tenant->id);

        return ApiData::item($tenant->fresh()->load('domains'), 201);
    }

    public function updateTenant(Request $request, Tenant $tenant): mixed
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'], 'email' => ['sometimes', 'email', 'max:320'],
            'phone' => ['nullable', 'string', 'max:32'], 'industry' => ['nullable', 'string', 'max:100'],
            'timezone' => ['sometimes', 'timezone:all'], 'status' => ['sometimes', Rule::in(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CLOSED'])],
        ]);
        $before = $tenant->toArray();
        $tenant->fill($data)->save();
        $this->audit->platform($request, 'tenant.updated', 'TENANT', $tenant->id, $before, $tenant->fresh()->toArray(), $tenant->id);

        return ApiData::item($tenant->fresh());
    }

    public function retryProvisioning(Request $request, Tenant $tenant): mixed
    {
        if ($tenant->database_status === 'READY') {
            throw new ApiException('TENANT_ALREADY_READY', 'Tenant database is already ready.', 409);
        }
        $requestId = 'platform-retry:'.$tenant->id.':'.($request->header('Idempotency-Key') ?: (string) Str::ulid());
        $this->provisioning->retry($tenant, $requestId, 'PLATFORM_ADMIN', synchronous: true);

        $this->audit->platform($request, 'tenant.provisioning_retried', 'TENANT', $tenant->id, null, ['database_status' => 'READY'], $tenant->id);

        return ApiData::item($tenant->fresh());
    }
}
