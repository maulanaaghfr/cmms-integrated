import React, { useCallback, useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useApp } from "../../store/store";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../../lib/dashboard";

const iconTone = {
  assignment: "text-primary", status: "text-accent", sla: "text-[hsl(var(--warning))]",
  review: "text-[hsl(var(--warning))]", request: "text-primary", welcome: "text-[hsl(var(--success))]",
};

export default function MobileNotifications() {
  const { user } = useApp();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

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
      <div className="space-y-2.5">
        {loading && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">Memuat...</p>
          </div>
        )}
        {!loading && notifications.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
            <Bell className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Belum ada notifikasi.</p>
          </div>
        )}
        {notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => handleMarkRead(n.id)}
            className={`flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left soft-card transition ${n.read_at ? "opacity-60" : ""}`}
          >
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted ${iconTone[n.type] || "text-primary"}`}>
              {n.read_at ? <Bell className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                {n.title}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{n.message || n.body}</div>
              <div className="mt-1 text-[11px] text-muted-foreground/70">
                {new Date(n.created_at).toLocaleString("id-ID")}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
