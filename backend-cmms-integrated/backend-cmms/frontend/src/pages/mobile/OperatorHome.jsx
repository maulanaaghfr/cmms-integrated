import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardPlus, Boxes, ArrowRight, Gauge } from "lucide-react";
import { useApp } from "../../store/store";
import { Sheet } from "../../components/mobile-kit";
import { listAssets } from "../../lib/assets";
import { listRequests } from "../../lib/requests";

const statusTone2 = { OPERATIONAL: "success", UNDER_MAINTENANCE: "warning", DOWN: "danger", STANDBY: "accent" };
const toneCls = {
  success: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  danger: "bg-destructive/10 text-destructive",
  accent: "bg-accent/10 text-accent",
};

export default function OperatorHome() {
  const { user } = useApp();
  const [eqOpen, setEqOpen] = useState(false);
  const [assets, setAssets] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsRes, reqRes] = await Promise.all([listAssets(), listRequests()]);
      setAssets(assetsRes.data || []);
      setRequests(reqRes.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ACTIVE_STATUSES = ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "IN_PROGRESS"];
  const openReq = requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Halo,</p>
        <h1 className="font-display text-2xl font-extrabold text-foreground">{(user?.name || "").split(" ")[0]} 👋</h1>
      </div>

      <Link to="/requests" className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-lg shadow-primary/25 active:scale-[0.99]">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><ClipboardPlus className="h-5 w-5" /></div>
        <div className="flex-1">
          <div className="font-display text-sm font-bold">Ajukan Permintaan Maintenance</div>
          <div className="text-xs text-white/80">Laporkan masalah peralatan dengan foto</div>
        </div>
        <ArrowRight className="h-4 w-4" />
      </Link>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-border bg-card p-3.5 text-center soft-card">
          <div className="font-display text-xl font-extrabold text-foreground">{requests.length}</div>
          <div className="text-[11px] text-muted-foreground">Total Permintaan</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3.5 text-center soft-card">
          <div className="font-display text-xl font-extrabold text-foreground">{openReq}</div>
          <div className="text-[11px] text-muted-foreground">Sedang Diproses</div>
        </div>
      </div>

      <button onClick={() => setEqOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 soft-card active:scale-[0.99]">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><Boxes className="h-5 w-5" /></div>
        <div className="flex-1 text-left">
          <div className="font-display text-sm font-bold text-foreground">Info Peralatan</div>
          <div className="text-xs text-muted-foreground">{assets.length} unit terdaftar</div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </button>

      <div>
        <h2 className="mb-2 font-display text-sm font-bold text-foreground">Permintaan Terbaru</h2>
        <div className="space-y-2.5">
          {loading && <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Memuat...</div>}
          {!loading && requests.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Belum ada permintaan.</div>
          )}
          {requests.slice(0, 4).map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4 soft-card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{r.title}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{r.status}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{r.request_number}</div>
            </div>
          ))}
        </div>
      </div>

      <Sheet open={eqOpen} onClose={() => setEqOpen(false)} title="Info Peralatan">
        <div className="space-y-2.5">
          {assets.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{a.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneCls[statusTone2[a.status]] || "bg-muted text-muted-foreground"}`}>{a.status}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Gauge className="h-3 w-3" /> {a.code} · {a.criticality}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
