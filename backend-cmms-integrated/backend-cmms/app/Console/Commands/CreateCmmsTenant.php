<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CreateCmmsTenant extends Command
{
    protected $signature = 'cmms:tenant:create
        {code : Unique internal company code}
        {domain : Tenant hostname, for example acme.localhost}
        {--name= : Company name}
        {--email=admin@example.test : Company contact email}
        {--industry= : Industry label}
        {--timezone=Asia/Jakarta : Tenant IANA timezone}';

    protected $description = 'Create a tenant, its isolated database, schema, and MVP master data';

    public function handle(): int
    {
        $code = Str::upper(trim((string) $this->argument('code')));
        $domain = Str::lower(trim((string) $this->argument('domain')));
        $name = trim((string) ($this->option('name') ?: Str::headline(Str::lower($code))));
        $email = Str::lower(trim((string) $this->option('email')));
        $timezone = trim((string) $this->option('timezone'));

        $validator = Validator::make(compact('code', 'domain', 'name', 'email', 'timezone'), [
            'code' => ['required', 'regex:/^[A-Z0-9_-]+$/', Rule::unique('tenants', 'code')],
            'domain' => ['required', 'regex:/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/', Rule::unique('domains', 'domain')],
            'name' => ['required', 'max:255'],
            'email' => ['required', 'email'],
            'timezone' => ['required', 'timezone:all'],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $tenantId = (string) Str::ulid();
        $tenant = Tenant::create([
            'id' => $tenantId,
            'code' => $code,
            'name' => $name,
            'slug' => Str::slug($code),
            'email' => $email,
            'industry' => $this->option('industry'),
            'timezone' => $timezone,
            'status' => 'TRIAL',
            'database_name' => config('tenancy.database.prefix').$tenantId.config('tenancy.database.suffix'),
            'database_status' => 'PROVISIONING',
        ]);

        $tenant->domains()->create(['domain' => $domain, 'is_primary' => true]);

        $this->components->info("Tenant {$tenant->id} created and provisioned.");
        $this->line("Database: {$tenant->database_name}");
        $this->line("Domain: {$domain}");

        return self::SUCCESS;
    }
}
