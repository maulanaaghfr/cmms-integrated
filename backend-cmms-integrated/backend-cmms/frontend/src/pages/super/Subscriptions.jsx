import React, { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { idr } from "../../store/store";
import {
  PageHeader, Card, Pill, StatCard, Reveal,
} from "../../components/kit";
import { apiCentral } from "../../lib/api";
import { listPlatformTenants } from "../../lib/dashboard";
import { Users2, Building2, CreditCard } from "lucide-react";

export default function Subscriptions() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [tenants, setTenants] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, tenantsRes] = await Promise.all([
        apiCentral("/platform/plans", { params: { per_page: 50 } }),
        listPlatformTenants(),
      ]);
      setPlans(plansRes.data || []);
      setTenants(tenantsRes.data || []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat data subscription.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeTenants = tenants.filter((t) => t.status === "ACTIVE").length;
  const avgPrice = plans.length
    ? plans.reduce((s, p) => s + Number(p.monthly_price || 0), 0) / plans.length
    : 0;

  return (
    <Reveal>
      <PageHeader
        title="Subscription Management"
        subtitle="Kelola paket harga & fitur langganan platform."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={CreditCard} label="Total Plan" value={plans.length} tone="primary" />
        <StatCard icon={Building2} label="Tenant Aktif" value={activeTenants} tone="accent" />
        <StatCard icon={Users2} label="Rata-rata Harga" value={idr(avgPrice)} tone="success" />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Memuat...</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-lg font-bold text-foreground">{p.name}</div>
                <Pill tone={p.status === "PUBLISHED" ? "success" : "muted"} className="mt-1">{p.status}</Pill>
              </div>
            </div>
            <div className="mt-3 font-display text-3xl font-extrabold text-foreground">
              {idr(p.monthly_price)}
              <span className="text-sm font-medium text-muted-foreground">/bln</span>
            </div>
            {p.max_users && (
              <div className="mt-1 text-xs text-muted-foreground">
                Hingga {p.max_assets >= 9999 ? "∞" : p.max_assets || "∞"} aset · {p.max_users >= 9999 ? "∞" : p.max_users || "∞"} user
              </div>
            )}
            {p.description && (
              <p className="mt-3 text-sm text-muted-foreground">{p.description}</p>
            )}
          </Card>
        ))}
        {!loading && plans.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            Belum ada plan terdaftar. Buat plan melalui API platform.
          </p>
        )}
      </div>
    </Reveal>
  );
}
