# Self-Service Onboarding Runbook

## Status implementasi

Self-service onboarding sudah mencakup:

- daftar paket public;
- registrasi akun dan perusahaan;
- email verification melalui Resend dari `noreply@aitoma.id`;
- resend verification dengan token lama otomatis tidak berlaku;
- login hanya setelah email self-service terverifikasi;
- start trial;
- provisioning database-per-tenant melalui queue;
- Company Admin projection ke database tenant;
- status polling, retry, dan cancel sebelum provisioning;
- flow Super Admin memakai `TenantProvisioningService` dan `ProvisionTenantJob` yang sama;
- Swagger dan Postman coverage;
- halaman React `/register` dan `/verify-email`.

## Konfigurasi backend

Tambahkan pada `.env`:

```dotenv
RESEND_API_KEY=re_xxxxxxxxx
ONBOARDING_MAILER=resend
MAIL_FROM_ADDRESS=noreply@aitoma.id
MAIL_FROM_NAME="AITOMA CMMS"

FRONTEND_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000
ONBOARDING_TRIAL_DAYS=30
ONBOARDING_REGISTRATION_TTL_HOURS=72
ONBOARDING_VERIFICATION_TTL_MINUTES=60
ONBOARDING_TERMS_VERSION=2026-08-01
ONBOARDING_PRIVACY_VERSION=2026-08-01

TENANCY_TENANT_DOMAIN_SUFFIX=localhost
TENANCY_TENANT_SCHEME=http
TENANCY_TENANT_PORT=8000
DB_TIMEZONE=UTC
```

`aitoma.id` harus sudah verified pada dashboard Resend. Setelah domain verified, Resend dapat mengirim dari `noreply@aitoma.id`.

Jalankan:

```powershell
php artisan config:clear
php artisan migrate --force
php artisan queue:work --tries=3 --timeout=900
php artisan serve
```

Queue worker wajib aktif untuk:

- mengirim email verification melalui Resend;
- membuat database tenant;
- menjalankan tenant migration dan seeder;
- membuat Company Admin pada tenant;
- mengirim email bahwa workspace sudah siap.

## Konfigurasi frontend

Buat `cmms-aitoma/apps/web/.env`:

```dotenv
VITE_CMMS_CENTRAL_API_URL=http://localhost:8000/api/v1
VITE_CMMS_APP_URL=/
```

Kemudian jalankan dari root `cmms-aitoma`:

```powershell
npm run dev
```

Halaman:

- `http://localhost:3000/register`
- `http://localhost:3000/verify-email?token=...`

## Persiapan paket

Self-service hanya menampilkan plan yang memenuhi semua kondisi:

- `status = PUBLISHED`;
- `is_public = true`;
- `effective_from` belum lewat atau null;
- `effective_until` belum tercapai atau null.

Plan published bersifat immutable. Jika plan published existing masih private, buat draft version baru, set `is_public = true`, assign features, lalu publish melalui endpoint Super Admin.

## Flow API

```text
GET  /api/v1/public/plans
POST /api/v1/onboarding/register
POST /api/v1/onboarding/resend-verification
POST /api/v1/onboarding/verify-email
POST /api/v1/auth/login
GET  /api/v1/onboarding/{id}
PATCH /api/v1/onboarding/{id}
POST /api/v1/onboarding/{id}/provision
GET  /api/v1/onboarding/{id}/status
POST /api/v1/onboarding/{id}/retry
POST /api/v1/onboarding/{id}/cancel
```

`register`, `provision`, dan `retry` memakai header `Idempotency-Key` agar pengulangan request tidak membuat tenant atau database ganda.

Database tenant belum dibuat saat registrasi. Database baru dibuat setelah:

1. email terverifikasi;
2. user login;
3. endpoint `provision` dipanggil;
4. queue worker memproses `ProvisionTenantJob`.

## Menjalankan Postman

Import:

- `docs/postman/AITOMA_CMMS_API_V1.postman_collection.json`
- `docs/postman/AITOMA_CMMS_LOCAL.postman_environment.json`

Gunakan folder `09 - Self-Service Onboarding (Manual Email)` dan isi:

- `runSelfServiceOnboarding = true`;
- `selfServiceEmail` dengan inbox yang dapat menerima email;
- `selfServicePassword`;
- `selfServiceVerificationToken` dengan token query dari link email Resend.

## Test

```powershell
php artisan test

$env:RUN_TENANCY_INTEGRATION='true'
$env:DB_CONNECTION='pgsql'
$env:DB_DATABASE='aitoma_cmms_central'
php artisan test tests\Feature\PostgresSelfServiceOnboardingTest.php
```

Integration test membuat database tenant disposable, memigrasikan, melakukan seed, memverifikasi Company Admin, lalu membersihkannya kembali.
