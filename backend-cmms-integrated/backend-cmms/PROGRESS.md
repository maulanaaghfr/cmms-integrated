# Integrasi Frontend (cmms.zip) ke Backend Laravel — Status

## Yang sudah tersambung ke API asli ✅

- **Struktur project**: frontend React ada di `frontend/`, di dalam project Laravel yang sama.
  Sisa file tool builder (Horizons/PocketBase plugin, path build monorepo lama) sudah dibuang.
- **`frontend/src/lib/api.js`** — HTTP client: otomatis pilih base URL domain central
  (`localhost:8000`) atau domain tenant (`{tenant}.localhost:8000`), kirim Bearer token,
  dan parse format error Laravel-nya (`{"error":{"code","message"}}`).
- **`frontend/src/lib/auth.js`** — login, logout, restore sesi dari token tersimpan, dan
  **role mapping** dari role asli backend ke role yang dipakai UI:

  | Backend (`role_key` / `platform_role`) | Frontend (`user.role`) |
  |---|---|
  | `platform_role = SUPER_ADMIN` | `super_admin` |
  | `COMPANY_ADMIN` | `company_admin` |
  | `MANAGER` | `manager` |
  | `SUPERVISOR` | `manager` *(belum ada role terpisah di frontend)* |
  | `TECHNICIAN` | `technician` |
  | `OPERATOR` | `operator` |
  | `VIEWER` | `view_only` |

  Role `limited_admin`, `limited_technician`, `requester`, `provider` di demo lama **tidak
  ada** padanannya di backend — kalau memang dibutuhkan sebagai role asli, harus ditambah
  dulu ke constraint `tenant_memberships_role_check` + logic permission di backend.
- **Login (`/dashboard` gate)** — `store.jsx` & `Login.jsx` sudah manggil
  `POST /api/v1/auth/login` dan `GET /api/v1/auth/me` beneran, termasuk:
  - restore sesi otomatis saat reload halaman (selama token masih ada & valid)
  - pemilihan tenant kalau 1 akun terhubung ke lebih dari 1 perusahaan aktif
  - logout memanggil `POST /api/v1/auth/logout` (revoke token di server)

## Yang masih pakai data dummy (localStorage) ⚠️

Semua halaman data selain login masih baca/tulis ke `store.jsx` lokal (mock), **belum** ke
API: Dashboard, Assets, Work Orders, Requests, Preventive Maintenance, Inventory, Locations,
Manufacturers, Technicians, Users, Analytics, AI Insights, Billing, Procurement, dan semua
halaman `super/*` (Companies, Subscriptions, Revenue, Platform Users, Settings).

**Kenapa belum sekaligus:** skema data dummy di frontend jauh lebih kaya dari skema asli
di database. Contoh — `Assets` di dummy punya field dokumen, spesifikasi teknis, data
finansial (harga beli, nilai residu, dst), koordinat GPS, skor kesehatan. Tabel `assets` di
database Laravel cuma punya: site, location, kategori, kode, nama, status, criticality,
manufacturer, model, serial number, tanggal instalasi, barcode. Nyambungin tiap halaman ke
API asli berarti UI-nya juga harus disesuaikan ke field yang benar-benar ada — bukan cuma
ganti sumber data.

## Rekomendasi urutan lanjutan

1. **Dashboard** → `GET /api/v1/dashboard/summary` (paling kelihatan hasilnya)
2. **Assets** (+ Asset Categories) — CRUD paling lengkap contohnya di `AssetController`
3. **Work Orders** — alur status paling kompleks (assign/start/hold/complete/verify, dst)
4. **Requests, Locations/Sites, Users/Teams, Preventive Maintenance**
5. Modul yang **belum ada** endpoint-nya di backend sama sekali (Inventory, Procurement,
   Analytics/AI Insights, Billing detail untuk client) — perlu diputuskan dulu: bikin
   endpoint barunya di Laravel, atau untuk sekarang tetap dummy.

## Cara jalanin lokal

**Backend**
```bash
cd backend-cmms
cp .env.example .env
# isi DB_* sesuai Postgres lokal kamu
php artisan key:generate
php artisan migrate --seed
php artisan serve   # jalan di http://localhost:8000
```
Pastikan minimal ada satu tenant dengan domain `*.localhost` (mis. `nusantara.localhost`) —
domain `*.localhost` otomatis mengarah ke `127.0.0.1` di OS modern, tidak perlu edit hosts file.

**Frontend**
```bash
cd backend-cmms/frontend
npm install
npm run dev   # jalan di http://localhost:3000
```
`.env` sudah disiapkan dengan default yang cocok untuk setup lokal ini (lihat `.env.example`).

## Catatan lain

- Signup trial & forgot-password di halaman Login **masih demo/lokal** (ada label
  peringatan kuning di UI-nya) — backend punya alur onboarding sendiri (verifikasi email +
  provisioning tenant async) yang belum disambungkan.
- `frontend/src/components/Logo.jsx` masih memuat logo dari CDN Horizons (tool builder
  lama) — ganti ke aset lokal kalau mau lepas total dari dependency itu.
