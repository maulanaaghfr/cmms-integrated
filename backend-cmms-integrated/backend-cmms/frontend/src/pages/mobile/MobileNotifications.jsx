import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellRing, ClipboardList, RefreshCcw, Timer, MessageSquareWarning, Sparkles, Inbox } from "lucide-react";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../../lib/dashboard";

const TYPE_META = {
  assignment: { icon: ClipboardList, tone: "text-primary bg-primary/10" },
  status: { icon: RefreshCcw, tone: "text-accent bg-accent/10" },
  sla: { icon: Timer, tone: "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10" },
  review: { icon: MessageSquareWarning, tone: "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10" },
  request: { icon: ClipboardList, tone: "text-primary bg-primary/10" },
  welcome: { icon: Sparkles, tone: "text-[hsl(var(--success))] bg-[hsl(var(--success))]/10" },
};
const defaultMeta = { icon: Bell, tone: "text-muted-foreground bg-muted" };

function groupLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Hari ini";
  if (sameDay(d, yesterday)) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

export default function MobileNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listNotifications();
      setNotifications(res.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unread = notifications.filter((n) => !n.read_at).length;

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    } catch {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch {
      // silent
    }
  };

  const filtered = tab === "unread" ? notifications.filter((n) => !n.read_at) : notifications;

  const groups = useMemo(() => {
    const map = new Map();
    for (const n of filtered) {
      const label = groupLabel(n.created_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(n);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-extrabold text-foreground">Notifikasi</h1>
        {unread > 0 && (
          <button onClick={handleMarkAllRead} className="text-xs font-semibold text-primary">
            Tandai semua dibaca
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("all")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${tab === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          Semua
        </button>
        <button
          onClick={() => setTab("unread")}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${tab === "unread" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          Belum dibaca
          {unread > 0 && <span className={`rounded-full px-1.5 text-[10px] ${tab === "unread" ? "bg-primary-foreground/20" : "bg-foreground/10"}`}>{unread}</span>}
        </button>
      </div>

      <div className="space-y-5">
        {loading && (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-2xl border border-border bg-muted/50" />)}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
            <Inbox className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{tab === "unread" ? "Semua notifikasi sudah dibaca." : "Belum ada notifikasi."}</p>
          </div>
        )}

        {!loading && groups.map(([label, items]) => (
          <div key={label}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
            <div className="space-y-2.5">
              {items.map((n) => {
                const meta = TYPE_META[n.type] || defaultMeta;
                const Icon = n.read_at ? Bell : BellRing;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleMarkRead(n.id)}
                    className={`flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left soft-card transition ${n.read_at ? "opacity-60" : ""}`}
                  >
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                        <span className="truncate">{n.title}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{n.message || n.body}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground/70">
                        {new Date(n.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}