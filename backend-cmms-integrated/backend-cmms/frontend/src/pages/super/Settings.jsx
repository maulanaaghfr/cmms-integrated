import React, { useCallback, useEffect, useState } from "react";
import { Server, ShieldCheck, Database, Activity, Globe } from "lucide-react";
import { PageHeader, Card, Pill, Reveal } from "../../components/kit";
import { listPlatformTenants } from "../../lib/dashboard";

const health = [
  { icon: Server, label: "API Gateway", status: "Operational", tone: "success", detail: "99.98% uptime" },
  { icon: Database, label: "Database Cluster", status: "Operational", tone: "success", detail: "Latency 12ms" },
  { icon: Activity, label: "AI Engine", status: "Operational", tone: "success", detail: "Model v2.4 aktif" },
  { icon: Globe, label: "CDN & Edge", status: "Degraded", tone: "warning", detail: "1 region lambat" },
];

export default function Settings() {
  const [tenants, setTenants] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await listPlatformTenants();
      setTenants(res.data || []);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeCount = tenants.filter((t) => t.status === "ACTIVE").length;
  const readyCount = tenants.filter((t) => t.database_status === "READY").length;

  return (
    <Reveal>
      <PageHeader title="System Settings" subtitle="Konfigurasi platform, kesehatan sistem, dan preferensi global." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {health.map((h) => (
          <Card key={h.label} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <h.icon className="h-5 w-5" />
              </div>
              <Pill tone={h.tone}>{h.status}</Pill>
            </div>
            <div>
              <div className="font-semibold text-foreground">{h.label}</div>
              <div className="text-xs text-muted-foreground">{h.detail}</div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 flex items-center gap-2 font-display text-base font-bold text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" /> Ringkasan Platform
          </h3>
          <div className="space-y-3 text-sm">
            {[
              ["Total Tenant Terdaftar", tenants.length],
              ["Tenant Aktif", activeCount],
              ["Database Ready", readyCount],
              ["Region Aktif", "Jakarta · Singapore"],
              ["Versi Platform", "AITOMA CMMS v3.0"],
              ["Mata Uang Default", "IDR (Rupiah)"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-semibold text-foreground">{v}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="mb-2 font-display text-base font-bold text-foreground">Informasi Sistem</h3>
          <p className="text-sm text-muted-foreground">
            Platform AITOMA CMMS berjalan di atas Laravel + PostgreSQL dengan arsitektur multi-tenant.
            Setiap tenant memiliki database terpisah yang dikelola secara otomatis.
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">Backend</span>
              <span className="font-semibold">Laravel 11 + Sanctum</span>
            </div>
            <div className="flex justify-between border-b border-border/60 pb-2">
              <span className="text-muted-foreground">Database</span>
              <span className="font-semibold">PostgreSQL (per-tenant)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frontend</span>
              <span className="font-semibold">React + Vite</span>
            </div>
          </div>
        </Card>
      </div>
    </Reveal>
  );
}
