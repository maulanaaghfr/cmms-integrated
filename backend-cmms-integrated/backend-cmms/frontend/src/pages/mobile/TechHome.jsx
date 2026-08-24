import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { useApp } from "../../store/store";
import { SlaBadge } from "../../components/mobile-kit";
import { listWorkOrders } from "../../lib/workorders";

const priorityDot = { CRITICAL: "bg-destructive", HIGH: "bg-[hsl(var(--warning))]", MEDIUM: "bg-accent", LOW: "bg-muted-foreground" };

export default function TechHome() {
  const { user } = useApp();
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);

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
  const active = mine.filter((w) => ACTIVE.includes(w.status));
  const completedCount = mine.filter((w) => ["COMPLETED", "CLOSED"].includes(w.status)).length;
  const critical = active.filter((w) => ["CRITICAL", "HIGH"].includes(w.priority)).length;
  const loadPct = Math.min(Math.round((active.length / 5) * 100), 100);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Halo,</p>
        <h1 className="font-display text-2xl font-extrabold text-foreground">{(user?.name || "").split(" ")[0]} 👋</h1>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile icon={ClipboardList} value={active.length} label="Aktif" tone="primary" />
        <StatTile icon={AlertTriangle} value={critical} label="Prioritas" tone="warning" />
        <StatTile icon={CheckCircle2} value={completedCount} label="Selesai" tone="success" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 soft-card">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Beban kerja</span><span className="font-semibold text-foreground">{loadPct}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${loadPct}%` }} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-foreground">Work Order Ditugaskan</h2>
          <Link to="/work-orders" className="flex items-center gap-1 text-xs font-semibold text-primary">Lihat semua <ArrowRight className="h-3 w-3" /></Link>
        </div>
        <div className="space-y-2.5">
          {loading && <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Memuat...</div>}
          {!loading && active.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Tidak ada work order aktif. 🎉</div>
          )}
          {active.slice(0, 5).map((w) => (
            <Link key={w.id} to="/work-orders" className="block rounded-2xl border border-border bg-card p-4 soft-card active:scale-[0.99]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${priorityDot[w.priority] || "bg-muted-foreground"}`} />
                  <div>
                    <div className="text-sm font-semibold text-foreground">{w.title}</div>
                    <div className="text-xs text-muted-foreground">{w.work_order_number}</div>
                  </div>
                </div>
                <SlaBadge w={w} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
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
