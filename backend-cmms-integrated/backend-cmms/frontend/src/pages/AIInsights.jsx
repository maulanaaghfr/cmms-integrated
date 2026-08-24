import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, PageHeader, Pill, Reveal } from "../components/kit";
import { listAssets } from "../lib/assets";
import { listWorkOrders } from "../lib/workorders";

export default function AIInsights() {
  const [assets, setAssets] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [assetsResponse, workOrdersResponse] = await Promise.all([listAssets(), listWorkOrders()]);
      setAssets(assetsResponse?.data || []);
      setWorkOrders(workOrdersResponse?.data || []);
    } catch (requestError) {
      setError(requestError.message || "Gagal memuat data tenant untuk AI Insights.");
      toast.error(requestError.message || "Gagal memuat data tenant untuk AI Insights.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return <Reveal>
    <PageHeader title="AI Insights" subtitle="Status integrasi insight berbasis data tenant." />
    <Card className="bg-gradient-to-br from-primary/10 to-accent/5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-6 w-6" /></div>
        <div>
          <div className="flex items-center gap-2"><h2 className="font-display text-lg font-bold">AI engine belum dikonfigurasi</h2><Pill tone="muted">Tidak aktif</Pill></div>
          <p className="mt-2 text-sm text-muted-foreground">Tidak ada rekomendasi yang ditampilkan karena backend/model AI belum menyediakan insight yang dapat diverifikasi. Halaman ini tidak membuat work order dari data demo.</p>
          {!loading && !error && <p className="mt-3 text-xs text-muted-foreground">Data tenant tersedia untuk integrasi berikutnya: {assets.length} aset dan {workOrders.length} work order.</p>}
          {error && <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</p>}
        </div>
      </div>
    </Card>
  </Reveal>;
}
