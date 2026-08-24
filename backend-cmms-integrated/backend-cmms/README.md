# AITOMA CMMS Backend

Backend CMMS multi-tenant berbasis Laravel 13, PostgreSQL, dan
[Tenancy for Laravel](https://tenancyforlaravel.com/docs/v3/quickstart/).
Satu client/company memiliki satu database operasional terpisah.

Implementasi mengikuti scope MVP satu bulan dan `erd_new.dbml`: auth, multitenancy,
organization/team, asset, request, work order, attachment, notification, PM Lite,
subscription, invoice, dan billing gateway Duitku.

## Requirements

- PHP 8.3 atau lebih baru.
- Composer 2.
- PostgreSQL.
- User PostgreSQL aplikasi dapat membuat database untuk onboarding client.

## Initial setup

~~~powershell
Copy-Item .env.example .env
composer install
php artisan key:generate
~~~

Atur koneksi central pada **.env**:

~~~dotenv
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=aitoma_cmms_central
DB_USERNAME=postgres
DB_PASSWORD=
TENANCY_CENTRAL_DOMAINS=127.0.0.1,localhost
TENANCY_DATABASE_PREFIX=aitoma_tenant_
~~~

Buat database central, lalu jalankan:

~~~powershell
php artisan migrate
php artisan cmms:seed-central
php artisan tenants:migrate
~~~

Seeder package **stancl/tenancy v3.10** bertabrakan dengan nama command
**db:seed** milik Laravel 13. Proyek menyediakan **cmms:seed-central** dan job
tenant sendiri tanpa memodifikasi source vendor.

Buat akun Super Admin pertama:

~~~powershell
php artisan cmms:admin:create admin@aitoma.id --name="AITOMA Admin"
~~~

Jalankan server dan buka Swagger:

~~~powershell
php artisan serve --host=127.0.0.1 --port=8000
~~~

- Swagger UI: `http://localhost:8000/api/documentation`
- OpenAPI JSON: `http://localhost:8000/api/documentation/openapi.json`

## Client provisioning

Command berikut membuat tenant, database PostgreSQL terpisah, migration V1.0,
default roles, workflow, dan reference data:

~~~powershell
php artisan cmms:tenant:create ACME acme.localhost --name="PT ACME Indonesia" --email=admin@acme.example --industry="Food & Beverage"
~~~

Nama database: **aitoma_tenant_{TENANT_ULID}**.

Migration atau reseed tenant existing:

~~~powershell
php artisan tenants:migrate
php artisan tenants:migrate --tenants=01EXAMPLE...
php artisan cmms:tenant:seed
php artisan cmms:tenant:seed --tenant=01EXAMPLE...
~~~

Tenant dikenali dari hostname. Central routes hanya tersedia pada hostname di
**TENANCY_CENTRAL_DOMAINS**.

## Scope database MVP

Central database menyimpan:

- users, tenant, domain, dan membership directory;
- platform/tenant-role templates dan permission catalog;
- semantic state, priority, criticality, language, currency;
- feature, draft plan/version/price/entitlement;
- subscription dan per-client feature/limit override.

Setiap tenant database menyimpan:

- user projection, role, site/location/department/team/scope;
- maintenance configuration dan dynamic status workflow;
- asset, hierarchy, component, team/operator assignment;
- authenticated request dan approval review;
- WO, Manager approval, assignment, status history, labor timer, and verification;
- labor timer, downtime, failure, custom field values;
- optional WO photo/video metadata, comments, notifications, audit.

Checklist, meter-based PM, inventory, procurement, dan predictive-monitoring
integration ditunda. Time-based PM dan billing transaction Duitku sudah aktif.

Dokumentasi integrasi utama:

- [Frontend/backend handoff](docs/FRONTEND_BACKEND_HANDOFF.md)
- Swagger UI: `http://localhost:8000/api/documentation`
- Postman reference: `docs/postman/AITOMA_CMMS_API_V1_BY_FEATURE.postman_collection.json`
- Postman Happy Flow: `docs/postman/AITOMA_CMMS_API_V1.postman_collection.json`
- Postman local environment: `docs/postman/AITOMA_CMMS_LOCAL.postman_environment.json`

## Tests

~~~powershell
php artisan test
~~~

Integration test membuat dua tenant/database sementara, membuktikan isolasi,
lalu menghapus keduanya:

~~~powershell
$env:RUN_TENANCY_INTEGRATION='true'
$env:DB_CONNECTION='pgsql'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='5432'
$env:DB_DATABASE='aitoma_cmms_central'
$env:DB_USERNAME='postgres'
php artisan test --filter=PostgresTenantIsolationTest
~~~

## Useful checks

~~~powershell
php artisan about
php artisan route:list
php artisan migrate:status
php artisan tenants:list
php artisan tenants:migrate
vendor/bin/pint --test
~~~
