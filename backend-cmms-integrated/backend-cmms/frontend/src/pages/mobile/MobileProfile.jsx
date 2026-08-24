import React, { useCallback, useEffect, useState } from "react";
import { LogOut, ShieldCheck, Clock3, Award } from "lucide-react";
import { useApp, ROLES } from "../../store/store";
import { listWorkOrders } from "../../lib/workorders";

export default function MobileProfile() {
  const { user, logout } = useApp();
  const [workOrders, setWorkOrders] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await listWorkOrders({ per_page: 100 });
      setWorkOrders(res.data || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const myCompleted = workOrders.filter((w) =>
    w.current_assignee_id === user?.tenantUserId && ["COMPLETED", "CLOSED"].includes(w.status)
  ).length;

  const myActive = workOrders.filter((w) =>
    w.current_assignee_id === user?.tenantUserId && ["ASSIGNED", "IN_PROGRESS"].includes(w.status)
  ).length;

  const roleLabel = ROLES[user?.role]?.label || user?.role || "-";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 soft-card">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {(user?.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="font-display text-base font-bold text-foreground">{user?.name}</div>
          <div className="text-xs text-muted-foreground">{roleLabel} · {user?.company}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <MiniStat icon={ShieldCheck} value={myCompleted} label="WO Selesai" />
        <MiniStat icon={Clock3} value={myActive} label="WO Aktif" />
        <MiniStat icon={Award} value={user?.email ? user.email.split("@")[0] : "-"} label="Username" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 soft-card space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Info Akun</p>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Email</span>
          <span className="font-medium text-foreground">{user?.email || "-"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Peran</span>
          <span className="font-medium text-foreground">{roleLabel}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Perusahaan</span>
          <span className="font-medium text-foreground">{user?.company || "-"}</span>
        </div>
      </div>

      <button
        onClick={logout}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 py-3 text-sm font-semibold text-destructive active:scale-[0.99]"
      >
        <LogOut className="h-4 w-4" /> Keluar
      </button>
    </div>
  );
}

function MiniStat({ icon: Icon, value, label }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center soft-card">
      <Icon className="mx-auto mb-1 h-4 w-4 text-primary" />
      <div className="font-display text-sm font-extrabold text-foreground truncate">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
