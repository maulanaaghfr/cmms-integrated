import React, { useCallback, useEffect, useState } from "react";
import { Bell, CalendarDays, Check, ClipboardList, Wrench } from "lucide-react";
import { Button, Card, Reveal, Tabs } from "../components/kit";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../lib/dashboard";

const iconFor = (type) => {
  if (type === "request" || type === "review") return Check;
  if (type === "sla") return CalendarDays;
  if (type === "assignment") return Wrench;
  return ClipboardList;
};

const relativeTime = (value) => {
  if (!value) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes || 1}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setNotifications((await listNotifications()).data || []); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const unread = notifications.filter((item) => !item.read_at).length;
  const shown = filter === "unread" ? notifications.filter((item) => !item.read_at) : notifications;
  const read = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    } catch { /* keep the notification visible if request fails */ }
  };
  const readAll = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    } catch { /* API errors are handled by existing notification data */ }
  };
  return <Reveal className="mx-auto max-w-6xl">
    <div className="mb-5 flex items-end justify-between">
      <div><h2 className="font-display text-xl font-extrabold">Notifications</h2><p className="mt-1 text-sm text-muted-foreground">{unread} unread notifications</p></div>
      <Button variant="ghost" className="px-3 py-2 text-xs" onClick={readAll} disabled={!unread}><Check className="h-3.5 w-3.5" /> Mark all read</Button>
    </div>
    <Tabs tabs={[{ key: "all", label: `All (${notifications.length})` }, { key: "unread", label: `Unread (${unread})` }]} active={filter} onChange={setFilter} />
    <Card className="mt-3 overflow-hidden p-0">
      {loading && <p className="p-8 text-center text-sm text-muted-foreground">Loading notifications…</p>}
      {!loading && shown.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No notifications found.</p>}
      {shown.map((item) => {
        const Icon = iconFor(item.type);
        return <button key={item.id} onClick={() => !item.read_at && read(item.id)} className={`flex w-full items-center gap-3 border-b border-border/60 px-4 py-3.5 text-left last:border-0 hover:bg-muted/50 ${item.read_at ? "bg-card" : "bg-primary/[0.025]"}`}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${item.read_at ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{item.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.message || item.body}</span></span>
          <span className="text-[11px] text-muted-foreground">{relativeTime(item.created_at)}</span>
          {!item.read_at && <span className="h-2 w-2 rounded-full bg-sky-500" />}
        </button>;
      })}
    </Card>
  </Reveal>;
}
