import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, CheckCircle2, AlertTriangle, ArrowRight, ScanLine, Flame, CalendarClock } from "lucide-react";
import { useApp } from "../../store/store";
import { SlaBadge, slaState, ScannerSheet } from "../../components/mobile-kit";
import { listWorkOrders } from "../../lib/workorders";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const priorityDot = { CRITICAL: "bg-destructive", HIGH: "bg-[hsl(var(--warning))]", MEDIUM: "bg-accent", LOW: "bg-muted-foreground" };

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
}

export default function TechHome() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listWorkOrders({ per_page: 100 });
      setWorkOrders(res.data || []);
    } catch {
      // silent — show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ACTIVE = ["OPEN", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"];
  const mine = useMemo(() =>
    workOrders.filter((w) => w.current_assignee_id === user?.tenantUserId),
    [workOrders, user]
  );
  const active = useMemo(() => mine.filter((w) => ACTIVE.includes(w.status)), [mine]);
  const completedCount = mine.filter((w) => ["COMPLETED", "CLOSED"].includes(w.status)).length;

  // "Perlu perhatian" = overdue on SLA, or CRITICAL/HIGH priority — these
  // surface above the regular list so a tech's day starts with what matters.
  const urgent = useMemo(() => {
    return active
      .filter((w) => slaState(w).tone === "danger" || ["CRITICAL", "HIGH"].includes(w.priority))
      .sort((a, b) => (a.priority === "CRITICAL" ? -1 : 1) - (b.priority === "CRITICAL" ? -1 : 1));
  }, [active]);
  const urgentIds = new Set(urgent.map((w) => w.id));
  const others = active.filter((w) => !urgentIds.has(w.id));

  const loadPct = Math.min(Math.round((active.length / 5) * 100), 100);
  const workloadTone = loadPct >= 100 ? "text-destructive" : loadPct >= 60 ? "text-[hsl(var(--warning))]" : "text-primary";

  const handleAssetQr = (rawValue) => {
    try {
      const url = new URL(rawValue, window.location.origin);
      const pathMatch = url.pathname.match(/\/assets\/([^/?#]+)/);
      const assetId = pathMatch?.[1] || url.searchParams.get("asset_id");
      if (!assetId) throw new Error("QR bukan QR Asset AITOMA.");
      navigate(`/assets/${encodeURIComponent(assetId)}`);
      toast.success("QR Asset berhasil dipindai.");
    } catch (err) {
      toast.error(err.message || "QR Asset tidak valid.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()},</p>
          <h1 className="font-display text-2xl font-extrabold text-foreground">{(user?.name || "").split(" ")[0]} 👋</h1>
        </div>
        <button
          onClick={() => setScannerOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm active:scale-95"
          title="Scan QR Asset"
        >
          <ScanLine className="h-5 w-5" />
        </button>
      </div>
      <ScannerSheet open={scannerOpen} onClose={() => setScannerOpen(false)} onDetect={handleAssetQr} title="Scan QR Asset / Mesin" />

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile icon={ClipboardList} value={active.length} label="Aktif" tone="primary" />
        <StatTile icon={AlertTriangle} value={urgent.length} label="Prioritas" tone="warning" />
        <StatTile icon={CheckCircle2} value={completedCount} label="Selesai" tone="success" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 soft-card">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Beban kerja hari ini</span>
          <span className={`font-semibold ${workloadTone}`}>{loadPct}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full transition-all ${loadPct >= 100 ? "bg-destructive" : loadPct >= 60 ? "bg-[hsl(var(--warning))]" : "bg-primary"}`} style={{ width: `${loadPct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {loadPct >= 100 ? "Beban penuh — selesaikan WO berjalan sebelum menerima yang baru." : `${active.length} dari kapasitas ideal 5 WO aktif.`}
        </p>
      </div>

      {!loading && urgent.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-destructive" />
            <h2 className="font-display text-sm font-bold text-foreground">Perlu Perhatian</h2>
          </div>
          <div className="space-y-2.5">
            {urgent.slice(0, 4).map((w) => <WorkOrderCard key={w.id} w={w} highlight />)}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-foreground">Work Order Ditugaskan</h2>
          <Link to="/work-orders" className="flex items-center gap-1 text-xs font-semibold text-primary">Lihat semua <ArrowRight className="h-3 w-3" /></Link>
        </div>
        <div className="space-y-2.5">
          {loading && (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => <div key={i} className="h-[68px] animate-pulse rounded-2xl border border-border bg-muted/50" />)}
            </div>
          )}
          {!loading && active.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Tidak ada work order aktif. 🎉</div>
          )}
          {!loading && others.slice(0, 5).map((w) => <WorkOrderCard key={w.id} w={w} />)}
          {!loading && urgent.length > 0 && others.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Semua WO aktifmu sudah tampil di atas.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkOrderCard({ w, highlight }) {
  return (
    <Link
      to="/work-orders"
      state={{ open: w.id }}
      className={`block rounded-2xl border p-4 soft-card active:scale-[0.99] ${highlight ? "border-destructive/30 bg-destructive/[0.03]" : "border-border bg-card"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${priorityDot[w.priority] || "bg-muted-foreground"}`} />
          <div>
            <div className="text-sm font-semibold text-foreground">{w.title}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {w.work_order_number}
              {w.due_at && (
                <span className="inline-flex items-center gap-0.5">
                  <CalendarClock className="h-3 w-3" /> {new Date(w.due_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                </span>
              )}
            </div>
          </div>
        </div>
        <SlaBadge w={w} />
      </div>
    </Link>
  );
}

function StatTile({ icon: Icon, value, label, tone }) {
  const tones = { primary: "bg-primary/10 text-primary", warning: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]", success: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" };
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center soft-card">
      <div className={`mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></div>
      <div className="font-display text-lg font-extrabold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}