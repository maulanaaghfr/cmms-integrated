# Frontend/backend integration notes

## Dashboard

- Wired tenant dashboard to `GET /api/v1/dashboard/summary`.
- Removed dashboard reads of mock assets, work orders, inventory, and AI-insight arrays. The UI now shows only real asset-status counts, work-order counts, approval queues, and the server-provided latest work orders.
- Wired the platform dashboard to `GET /api/v1/platform/tenants`; it intentionally does not show invented revenue or platform-user metrics. Those require the aggregate endpoints specified in the task brief.
- Dashboard has content-shaped loading, error/retry, and empty states.
- `store.jsx` mock collections remain temporarily because other pages still consume them; they must be removed module-by-module after those consumers are migrated.
