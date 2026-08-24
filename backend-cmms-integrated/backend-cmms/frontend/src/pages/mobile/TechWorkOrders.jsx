import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  Search, Play, Square, Check, Package, Camera, PenLine, MessageSquare,
  ChevronRight, ListChecks, Clock, ScanLine, X,
} from "lucide-react";
import { useApp } from "../../store/store";
import { Sheet, ScannerSheet, SignaturePad, GpsButton, PhotoCapture, SlaBadge } from "../../components/mobile-kit";
import { listWorkOrders, getWorkOrder, workOrderAction, startTimer, stopTimer } from "../../lib/workorders";
import { addComment } from "../../lib/requests";

const FILTERS = [
  { key: "active", label: "Aktif" },
  { key: "new", label: "Baru" },
  { key: "hold", label: "On Hold" },
  { key: "done", label: "Selesai" },
];
const priorityDot = { CRITICAL: "bg-destructive", HIGH: "bg-[hsl(var(--warning))]", MEDIUM: "bg-accent", LOW: "bg-muted-foreground" };

export default function TechWorkOrders() {
  const { user } = useApp();
  const location = useLocation();
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(location.state?.open || null);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listWorkOrders({ per_page: 100 });
      setWorkOrders(res.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id) => {
    try {
      const res = await getWorkOrder(id);
      setDetail(res.data);
    } catch (err) {
      toast.error(err.message || "Gagal memuat detail work order.");
    }
  }, []);

  useEffect(() => {
    if (openId) loadDetail(openId);
    else setDetail(null);
  }, [openId, loadDetail]);

  const rows = useMemo(() => {
    let r = workOrders;
    if (filter === "active") r = r.filter((w) => ["IN_PROGRESS", "ASSIGNED"].includes(w.status));
    if (filter === "new") r = r.filter((w) => ["OPEN", "PENDING_APPROVAL"].includes(w.status));
    if (filter === "hold") r = r.filter((w) => w.status === "ON_HOLD");
    if (filter === "done") r = r.filter((w) => ["COMPLETED", "CLOSED", "CANCELLED"].includes(w.status));
    if (q.trim()) r = r.filter((w) => (w.title || "").toLowerCase().includes(q.toLowerCase()) || (w.work_order_number || "").toLowerCase().includes(q.toLowerCase()));
    return r;
  }, [workOrders, filter, q]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-extrabold text-foreground">Work Order Saya</h1>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari work order..."
          className="w-full rounded-xl border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {loading && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Memuat...</div>}
        {!loading && rows.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Tidak ada work order pada filter ini.</div>}
        {rows.map((w) => (
          <button key={w.id} onClick={() => setOpenId(w.id)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left soft-card active:scale-[0.99]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${priorityDot[w.priority] || "bg-muted-foreground"}`} />
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground">{w.title}</div>
              <div className="text-xs text-muted-foreground">{w.work_order_number} · {w.status}</div>
            </div>
            <SlaBadge w={w} />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      {detail && (
        <WorkOrderMobileDetail
          detail={detail}
          onClose={() => { setOpenId(null); setDetail(null); }}
          onRefresh={() => { load(); if (openId) loadDetail(openId); }}
          user={user}
        />
      )}
    </div>
  );
}

function WorkOrderMobileDetail({ detail: d, onClose, onRefresh, user }) {
  const [tab, setTab] = useState("overview");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const act = async (action, body = {}) => {
    setSaving(true);
    try {
      if (action === "timer/start") await startTimer(d.id, body.notes);
      else if (action === "timer/stop") await stopTimer(d.id, body.notes);
      else await workOrderAction(d.id, action, body);
      toast.success("Status diperbarui.");
      onRefresh();
    } catch (err) {
      toast.error(err.message || "Aksi gagal.");
    } finally {
      setSaving(false);
    }
  };

  const sendNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await addComment("WORK_ORDER", d.id, { body: note.trim() });
      setNote("");
      toast.success("Catatan disimpan.");
      onRefresh();
    } catch (err) {
      toast.error(err.message || "Gagal menyimpan catatan.");
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { k: "overview", label: "Info", icon: ListChecks },
    { k: "time", label: "Timer", icon: Clock },
    { k: "notes", label: "Catatan", icon: MessageSquare },
  ];

  const isAssignee = d.current_assignee_id === user?.tenantUserId;

  return (
    <Sheet open onClose={onClose} title={`${d.work_order_number || d.id} — ${d.title}`}>
      <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto border-b border-border pb-2">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${tab === t.k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-3">
          <Row label="Nomor" value={d.work_order_number} />
          <Row label="Prioritas" value={d.priority} />
          <Row label="Status" value={d.status} />
          <Row label="Batas Waktu" value={d.due_at ? new Date(d.due_at).toLocaleDateString("id-ID") : "-"} />
          <Row label="Deskripsi" value={d.description || "-"} />
          <div className="pt-2">
            <GpsButton targetCoords={null} label="Bagikan Lokasi Saya" />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {d.status === "ASSIGNED" && isAssignee && (
              <button onClick={() => act("acknowledge")} disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                <Check className="h-3.5 w-3.5" /> Konfirmasi
              </button>
            )}
            {d.status === "ASSIGNED" && isAssignee && (
              <button onClick={() => act("start")} disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                <Play className="h-3.5 w-3.5" /> Mulai
              </button>
            )}
            {d.status === "IN_PROGRESS" && isAssignee && (
              <button onClick={() => { const note = window.prompt("Catatan penyelesaian"); if (note !== null) act("complete", { completion_note: note }); }} disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-[hsl(var(--success))] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
                <Check className="h-3.5 w-3.5" /> Selesaikan
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "time" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border p-4 text-center">
            <div className="text-xs text-muted-foreground">Status Timer</div>
            <div className="font-display text-lg font-extrabold text-foreground mt-1">{d.status}</div>
            <div className="mt-3 flex justify-center gap-2">
              {d.status === "IN_PROGRESS" && (
                <>
                  <button onClick={() => act("timer/start")} disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                    <Play className="h-4 w-4" /> Start Timer
                  </button>
                  <button onClick={() => act("timer/stop")} disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl border bg-background px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
                    <Square className="h-4 w-4" /> Stop
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            {(d.time_logs || []).map((l, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span>{new Date(l.started_at).toLocaleTimeString("id-ID")} → {l.stopped_at ? new Date(l.stopped_at).toLocaleTimeString("id-ID") : "berjalan"}</span>
                <span className="font-mono text-muted-foreground">{l.duration_minutes ? `${l.duration_minutes}m` : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan lapangan..."
              className="flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button onClick={sendNote} disabled={saving} className="rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">Kirim</button>
          </div>
          <div className="space-y-2">
            {(d.comments || []).length === 0 && <p className="text-xs text-muted-foreground">Belum ada catatan.</p>}
            {(d.comments || []).map((c, i) => (
              <div key={i} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{c.author_name || c.created_by}</span>
                  <span>{new Date(c.created_at).toLocaleTimeString("id-ID")}</span>
                </div>
                <p className="mt-1 text-sm">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onClose} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border bg-background py-2.5 text-sm font-semibold text-muted-foreground">
        <X className="h-4 w-4" /> Tutup
      </button>
    </Sheet>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
