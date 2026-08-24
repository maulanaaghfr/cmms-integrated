import React, { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Percent, Wallet } from "lucide-react";
import { toast } from "sonner";
import { idr } from "../../store/store";
import { PageHeader, Card, StatCard, Table, Pill, Button, Reveal, statusTone } from "../../components/kit";
import { getPlatformRevenue, listPlatformTenants } from "../../lib/dashboard";

export default function Revenue() {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState([]);
  const [revenue, setRevenue] = useState({ mrr: 0, paid_total: 0, paid_this_month: 0, trend: [] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tenantResponse, revenueResponse] = await Promise.all([listPlatformTenants(), getPlatformRevenue()]);
      setTenants(tenantResponse.data || []);
      setRevenue(revenueResponse.data || { mrr: 0, paid_total: 0, paid_this_month: 0, trend: [] });
    } catch (err) {
      toast.error(err.message || "Gagal memuat data revenue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derive metrics from tenant data
  const trialTenants = tenants.filter((t) => t.status === "TRIAL");

  // Build industry breakdown from tenant data
  const byIndustry = Object.values(
    tenants.reduce((acc, t) => {
      const ind = t.industry || "Other";
      acc[ind] = acc[ind] || { name: ind, count: 0 };
      acc[ind].count += 1;
      return acc;
    }, {})
  );

  const trendWithCurrent = (revenue.trend || []).map((row) => ({ m: row.month, mrr: Number(row.revenue || 0) }));

  const tip = { borderRadius: 12, border: "1px solid hsl(var(--border))" };

  const columns = [
    { key: "name", header: "Perusahaan", render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: "code", header: "Kode", render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.code}</span> },
    { key: "industry", header: "Industri", render: (r) => r.industry || "-" },
    { key: "status", header: "Status", render: (r) => {
      const s = String(r.status || "").split("_").map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join(" ");
      return <Pill tone={statusTone(s)}>{s}</Pill>;
    } },
    { key: "db", header: "Database", render: (r) => <Pill tone={r.database_status === "READY" ? "success" : "warning"}>{r.database_status || "-"}</Pill> },
  ];

  return (
    <Reveal>
      <PageHeader
        title="Revenue & Billing"
        subtitle="Pantau pertumbuhan tenant dan status platform."
        action={<Button variant="ghost" onClick={() => toast.success("Laporan diekspor.")}><Download className="h-4 w-4" /> Export</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={TrendingUp} label="MRR Aktif" value={idr(revenue.mrr)} tone="primary" />
        <StatCard icon={Wallet} label="Pembayaran Bulan Ini" value={idr(revenue.paid_this_month)} tone="success" />
        <StatCard icon={Percent} label="Tenant Trial" value={trialTenants.length} tone="warning" />
        <StatCard icon={TrendingDown} label="Total Pembayaran" value={idr(revenue.paid_total)} tone="accent" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 font-display text-base font-bold text-foreground">Pendapatan Terealisasi</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendWithCurrent}>
              <defs>
                <linearGradient id="mrr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(152 62% 40%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(152 62% 40%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={(v) => `${v / 1000000}jt`} tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v) => idr(v)} contentStyle={tip} />
              <Area type="monotone" dataKey="mrr" stroke="hsl(152 62% 40%)" strokeWidth={2.5} fill="url(#mrr)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="mb-4 font-display text-base font-bold text-foreground">Tenant per Industri</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byIndustry} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="count" name="Tenant" radius={[0, 6, 6, 0]} fill="hsl(214 95% 52%)" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="mt-6">
        <h3 className="mb-4 font-display text-base font-bold text-foreground">Daftar Tenant</h3>
        <Table columns={columns} rows={tenants} empty={loading ? "Memuat..." : "Belum ada tenant."} />
      </Card>
    </Reveal>
  );
}
