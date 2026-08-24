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

class ManufacturerController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    public function index(Request $request): mixed
    {
        $query = DB::table('manufacturers')
            ->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = '%'.$request->string('search').'%';
                $q->where(fn ($q2) => $q2->where('name', 'ilike', $search)
                    ->orWhere('contact_person', 'ilike', $search));
            });

        return ApiData::paginated($query->orderBy('name')->paginate($request->integer('per_page', 50)));
    }

    public function show(string $manufacturer): mixed
    {
        return ApiData::item($this->find($manufacturer));
    }

    public function store(Request $request): mixed
    {
        $data = $this->validatedData($request);
        $id = (string) Str::ulid();
        DB::table('manufacturers')->insert([
            'id' => $id,
            ...$data,
            'is_active' => true,
            'archived_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->audit->tenant($request, 'manufacturer.created', 'MANUFACTURER', $id, null, $data);

        return ApiData::item($this->find($id), 201);
    }

    public function update(Request $request, string $manufacturer): mixed
    {
        $before = $this->find($manufacturer);
        $data = $this->validatedData($request, true, $manufacturer);
        DB::table('manufacturers')->where('id', $manufacturer)->update([...$data, 'updated_at' => now()]);
        $this->audit->tenant($request, 'manufacturer.updated', 'MANUFACTURER', $manufacturer, $before, $data);

        return ApiData::item($this->find($manufacturer));
    }

    public function archive(Request $request, string $manufacturer): mixed
    {
        $before = $this->find($manufacturer);
        DB::table('manufacturers')->where('id', $manufacturer)->update([
            'is_active' => false,
            'archived_at' => now(),
            'updated_at' => now(),
        ]);
        $this->audit->tenant($request, 'manufacturer.archived', 'MANUFACTURER', $manufacturer, $before);

        return response()->json(null, 204);
    }

    private function find(string $id): object
    {
        return DB::table('manufacturers')->where('id', $id)->first()
            ?? throw new ApiException('MANUFACTURER_NOT_FOUND', 'Manufacturer was not found.', 404);
    }

    private function validatedData(Request $request, bool $partial = false, ?string $ignore = null): array
    {
        $mode = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name'            => [$mode, 'string', 'max:255'],
            'contact_person'  => ['nullable', 'string', 'max:255'],
            'email'           => ['nullable', 'email', 'max:320'],
            'phone'           => ['nullable', 'string', 'max:64'],
            'address'         => ['nullable', 'string'],
            'website'         => ['nullable', 'string', 'max:255'],
            'quality_score'   => ['sometimes', 'integer', 'min:0', 'max:100'],
            'delivery_score'  => ['sometimes', 'integer', 'min:0', 'max:100'],
            'support_score'   => ['sometimes', 'integer', 'min:0', 'max:100'],
            'is_active'       => ['sometimes', 'boolean'],
        ]);
    }
}
