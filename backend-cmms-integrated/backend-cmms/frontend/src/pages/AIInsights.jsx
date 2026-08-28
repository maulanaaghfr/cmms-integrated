import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Sparkles, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, PageHeader, Pill, Reveal, StatCard, Table } from "../components/kit";
import { getInsights } from "../lib/dashboard";

export default function AIInsights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await getInsights(90);
      setData(response?.data || null);
    } catch (requestError) {
      setError(requestError.message || "Gagal memuat insight.");
      toast.error(requestError.message || "Gagal memuat insight.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return <Reveal>
    <PageHeader title="AI Insights" subtitle="Insight berbasis aturan (rule-based), dihitung langsung dari riwayat work order 90 hari terakhir. Belum memakai model AI eksternal." />

    <Card className="mb-6 bg-gradient-to-br from-primary/10 to-accent/5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-6 w-6" /></div>
        <div>
          <div className="flex items-center gap-2"><h2 className="font-display text-lg font-bold">Rule-based insight aktif</h2><Pill tone="success">Aktif</Pill></div>
          <p className="mt-2 text-sm text-muted-foreground">Angka di bawah dihitung langsung dari database (bukan hasil model AI), jadi selalu bisa diverifikasi ke data work order aslinya.</p>
          {error && <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</p>}
        </div>
      </div>
    </Card>

    {!loading && data && <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={AlertTriangle} label="WO Overdue (belum selesai)" value={data.summary.overdue_open_work_orders} tone="warning" />
        <StatCard icon={Clock} label="Rata-rata Waktu Perbaikan" value={data.summary.fleet_avg_repair_hours != null ? `${data.summary.fleet_avg_repair_hours} jam` : "—"} tone="primary" />
        <StatCard icon={TrendingUp} label="Aset dengan Aktivitas WO" value={data.summary.assets_with_activity} tone="accent" />
      </div>

      <Card>
        <h3 className="mb-4 font-display text-base font-bold text-foreground">Top 10 Asset Paling Bermasalah (90 hari terakhir)</h3>
        <Table
          columns={[
            { key: "asset_name", label: "Asset" },
            { key: "criticality", label: "Kritikalitas" },
            { key: "work_order_count", label: "Jumlah WO" },
            { key: "avg_repair_hours", label: "Rata-rata Perbaikan (jam)" },
            { key: "overdue_count", label: "Overdue" },
          ]}
          rows={data.top_problem_assets.map((a) => ({
            id: a.asset_id,
            asset_name: `${a.asset_name} (${a.asset_code})`,
            criticality: <Pill tone={a.criticality === "HIGH" || a.criticality === "CRITICAL" ? "danger" : "muted"}>{a.criticality}</Pill>,
            work_order_count: a.work_order_count,
            avg_repair_hours: a.avg_repair_hours ?? "—",
            overdue_count: a.overdue_count,
          }))}
          empty="Belum ada work order dalam periode ini."
        />
      </Card>
    </>}
  </Reveal>;
}