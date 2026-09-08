import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Search, Play, Square, Check, Package, Camera, PenLine, MessageSquare,
  ChevronRight, ListChecks, Clock, ScanLine, X, CheckCircle2,
} from "lucide-react";
import { useApp } from "../../store/store";
import { Sheet, ScannerSheet, SignaturePad, GpsButton, PhotoCapture, SlaBadge } from "../../components/mobile-kit";
import { listWorkOrders, getWorkOrder, workOrderAction, startTimer, stopTimer, recordWorkOrderPart, updateWorkOrderChecklist, signWorkOrder } from "../../lib/workorders";
import { addComment, uploadAttachment } from "../../lib/requests";
import { listWarehouses } from "../../lib/inventory";

const FILTERS = [
  { key: "active", label: "Aktif", statuses: ["SCHEDULED", "IN_PROGRESS", "ASSIGNED"] },
  { key: "new", label: "Baru", statuses: ["OPEN", "PENDING_APPROVAL"] },
  { key: "hold", label: "On Hold", statuses: ["ON_HOLD"] },
  { key: "done", label: "Selesai", statuses: ["COMPLETED", "CLOSED", "CANCELLED"] },
];
const priorityDot = { CRITICAL: "bg-destructive", HIGH: "bg-[hsl(var(--warning))]", MEDIUM: "bg-accent", LOW: "bg-muted-foreground" };

// The flow a technician actually walks through, used to render a small
// progress stepper at the top of the detail sheet so it's obvious at a
// glance where a WO currently sits and what's next.
const FLOW_STEPS = [
  { key: "ASSIGNED", label: "Ditugaskan" },
  { key: "IN_PROGRESS", label: "Dikerjakan" },
  { key: "COMPLETED", label: "Selesai" },
  { key: "CLOSED", label: "Ditutup" },
];
function flowIndex(status) {
  if (status === "ON_HOLD") return 1; // still "in progress" territory
  const i = FLOW_STEPS.findIndex((s) => s.key === status);
  return i === -1 ? 0 : i;
}

export default function TechWorkOrders() {
  const { user } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [assetScannerOpen, setAssetScannerOpen] = useState(false);
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

  const handleAssetQr = (rawValue) => {
    try {
      const url = new URL(rawValue, window.location.origin);
      // Current format: /assets/<id> (path). Also accept the legacy
      // /assets?asset_id=<id> format from QR codes printed before this page existed.
      const pathMatch = url.pathname.match(/\/assets\/([^/?#]+)/);
      const assetId = pathMatch?.[1] || url.searchParams.get("asset_id");
      if (!assetId) throw new Error("QR bukan QR Asset AITOMA.");
      navigate(`/assets/${encodeURIComponent(assetId)}`);
      toast.success("QR Asset berhasil dipindai.");
    } catch (err) {
      toast.error(err.message || "QR Asset tidak valid.");
    }
  };

  useEffect(() => {
    if (openId) loadDetail(openId);
    else setDetail(null);
  }, [openId, loadDetail]);

  const counted = useMemo(() => {
    const counts = {};
    for (const f of FILTERS) counts[f.key] = workOrders.filter((w) => f.statuses.includes(w.status)).length;
    return counts;
  }, [workOrders]);

  const rows = useMemo(() => {
    const active = FILTERS.find((f) => f.key === filter);
    let r = active ? workOrders.filter((w) => active.statuses.includes(w.status)) : workOrders;
    if (q.trim()) {
      const needle = q.toLowerCase();
      r = r.filter((w) => (w.title || "").toLowerCase().includes(needle) || (w.work_order_number || "").toLowerCase().includes(needle));
    }
    // Sort by urgency: CRITICAL/HIGH first, then earliest due date.
    const weight = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...r].sort((a, b) => {
      const p = (weight[a.priority] ?? 4) - (weight[b.priority] ?? 4);
      if (p !== 0) return p;
      if (a.due_at && b.due_at) return new Date(a.due_at) - new Date(b.due_at);
      return 0;
    });
  }, [workOrders, filter, q]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 lg:space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold text-foreground sm:text-2xl">Work Order Saya</h1>
        <button onClick={() => setAssetScannerOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 active:scale-95 sm:text-sm">
          <ScanLine className="h-4 w-4" /> Scan QR Asset
        </button>
      </div>
      <ScannerSheet open={assetScannerOpen} onClose={() => setAssetScannerOpen(false)} onDetect={handleAssetQr} title="Scan QR Asset / Mesin" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari work order..."
            className="w-full rounded-xl border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto sm:shrink-0 sm:overflow-visible">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
              {f.label}
              {counted[f.key] > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] ${filter === f.key ? "bg-primary-foreground/20" : "bg-foreground/10"}`}>{counted[f.key]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {loading && [0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-2xl border border-border bg-muted/50" />)}
        {!loading && rows.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">Tidak ada work order pada filter ini.</div>}
        {rows.map((w) => (
          <button key={w.id} onClick={() => setOpenId(w.id)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left soft-card transition hover:border-primary/25 hover:shadow-md active:scale-[0.99]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${priorityDot[w.priority] || "bg-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{w.title}</div>
              <div className="text-xs text-muted-foreground">{w.work_order_number} · {STATUS_LABEL[w.status] || w.status}</div>
            </div>
            <SlaBadge w={w} />
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
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

const STATUS_LABEL = {
  OPEN: "Baru", PENDING_APPROVAL: "Menunggu Persetujuan", SCHEDULED: "Dijadwalkan", ASSIGNED: "Ditugaskan",
  IN_PROGRESS: "Dikerjakan", ON_HOLD: "Ditahan", COMPLETED: "Selesai", CLOSED: "Ditutup", CANCELLED: "Dibatalkan",
};

function FlowStepper({ status }) {
  if (status === "CANCELLED") {
    return <div className="mb-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-center text-xs font-semibold text-destructive">Work order ini dibatalkan.</div>;
  }
  const idx = flowIndex(status);
  return (
    <div className="mb-4 flex items-center">
      {FLOW_STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex flex-col items-center gap-1">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition lg:h-7 lg:w-7 ${
              i < idx ? "bg-primary text-primary-foreground" : i === idx ? "bg-primary/15 text-primary ring-2 ring-primary/40" : "bg-muted text-muted-foreground"
            }`}>
              {i < idx ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span className={`text-[9px] font-semibold lg:text-[10px] ${i <= idx ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
          </div>
          {i < FLOW_STEPS.length - 1 && <div className={`mx-1 h-0.5 flex-1 rounded-full ${i < idx ? "bg-primary" : "bg-muted"}`} />}
        </React.Fragment>
      ))}
      {status === "ON_HOLD" && (
        <span className="ml-2 shrink-0 rounded-full bg-[hsl(var(--warning))]/10 px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--warning))]">Ditahan</span>
      )}
    </div>
  );
}

function WorkOrderMobileDetail({ detail: d, onClose, onRefresh, user }) {
  const [tab, setTab] = useState("overview");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState([]);
  const [photos, setPhotos] = useState({ BEFORE: [], DURING: [], AFTER: [] });
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completionNote, setCompletionNote] = useState("");

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

  const submitCompletion = async () => {
    setSaving(true);
    try {
      await workOrderAction(d.id, "complete", { completion_note: completionNote.trim() || null });
      toast.success("Work order diselesaikan.");
      setCompleteOpen(false);
      setCompletionNote("");
      onRefresh();
    } catch (err) {
      toast.error(err.message || "Gagal menyelesaikan work order.");
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
    { k: "checklist", label: "Checklist", icon: Check, badge: (d.checklist || []).filter((c) => !c.is_completed).length },
    { k: "evidence", label: "Bukti Foto", icon: Camera },
    { k: "time", label: "Timer", icon: Clock },
    { k: "notes", label: "Catatan", icon: MessageSquare },
    { k: "parts", label: "Part / Barcode", icon: Package },
  ];

  const isAssignee = d.current_assignee_id === user?.tenantUserId;

  useEffect(() => {
    if (tab !== "parts" || warehouses.length) return;
    listWarehouses().then((res) => {
      const rows = res.data || [];
      setWarehouses(rows);
      setWarehouseId(rows[0]?.id || "");
    }).catch((err) => toast.error(err.message || "Gagal memuat gudang."));
  }, [tab, warehouses.length]);

  const updateChecklist = async (item, checked) => {
    setSaving(true);
    try {
      await updateWorkOrderChecklist(d.id, item.id, { is_completed: checked, note: item.note || null });
      toast.success(checked ? "Checklist selesai." : "Checklist dibuka kembali.");
      onRefresh();
    } catch (err) { toast.error(err.message || "Gagal menyimpan checklist."); }
    finally { setSaving(false); }
  };

  const dataUrlToFile = async (dataUrl, name) => {
    const res = await fetch(dataUrl);
    return new File([await res.blob()], name, { type: "image/png" });
  };

  const addPhoto = async (role, photo) => {
    setPhotos((current) => ({ ...current, [role]: [...current[role], photo] }));
    try {
      await uploadAttachment("WORK_ORDER", d.id, await dataUrlToFile(photo.url, `${role.toLowerCase()}-${Date.now()}.png`), role);
      toast.success(`Foto ${role.toLowerCase()} tersimpan.`);
      onRefresh();
    } catch (err) { toast.error(err.message || "Gagal menyimpan foto."); }
  };

  const saveSignature = async (signatureData) => {
    setSaving(true);
    try {
      await signWorkOrder(d.id, { signature_data: signatureData });
      setSignatureOpen(false);
      toast.success("Tanda tangan digital tersimpan.");
      onRefresh();
    } catch (err) { toast.error(err.message || "Gagal menyimpan tanda tangan."); }
    finally { setSaving(false); }
  };

  const recordPart = async () => {
    if (!barcode.trim()) return toast.error("Scan atau masukkan barcode part.");
    if (!warehouseId) return toast.error("Pilih gudang asal part.");
    setSaving(true);
    try {
      await recordWorkOrderPart(d.id, { barcode: barcode.trim().toUpperCase(), warehouse_id: warehouseId, quantity: Number(quantity) });
      toast.success("Pemakaian part dicatat dan stok dikurangi.");
      setBarcode("");
      setQuantity(1);
      onRefresh();
    } catch (err) {
      toast.error(err.message || "Gagal mencatat pemakaian part.");
    } finally {
      setSaving(false);
    }
  };

  const pendingChecklist = (d.checklist || []).filter((c) => !c.is_completed).length;

  return (
    <Sheet open onClose={onClose} title={`${d.work_order_number || d.id} — ${d.title}`} size="xl">
      <FlowStepper status={d.status} />

      <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto border-b border-border pb-2 lg:flex-wrap lg:overflow-visible">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${tab === t.k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
            {!!t.badge && <span className={`rounded-full px-1.5 text-[10px] ${tab === t.k ? "bg-primary-foreground/20" : "bg-foreground/10"}`}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-3">
          <Row label="Nomor" value={d.work_order_number} />
          <Row label="Prioritas" value={d.priority} />
          <Row label="Status" value={STATUS_LABEL[d.status] || d.status} />
          <Row label="Batas Waktu" value={d.due_at ? new Date(d.due_at).toLocaleDateString("id-ID") : "-"} />
          <Row label="Deskripsi" value={d.description || "-"} />
          {d.completion_note && <Row label="Catatan Penyelesaian" value={d.completion_note} />}
          <div className="pt-2">
            <GpsButton targetCoords={null} label="Bagikan Lokasi Saya" />
          </div>

          {isAssignee && d.status === "IN_PROGRESS" && pendingChecklist > 0 && (
            <div className="rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 px-3 py-2 text-xs text-[hsl(var(--warning))]">
              {pendingChecklist} item checklist belum selesai — cek tab Checklist sebelum menyelesaikan WO.
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {d.status === "ASSIGNED" && isAssignee && (
              <button onClick={() => act("acknowledge")} disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-60">
                <Check className="h-3.5 w-3.5" /> Konfirmasi
              </button>
            )}
            {d.status === "ASSIGNED" && isAssignee && (
              <button onClick={() => act("start")} disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-60">
                <Play className="h-3.5 w-3.5" /> Mulai
              </button>
            )}
            {d.status === "IN_PROGRESS" && isAssignee && (
              <button onClick={() => { setCompletionNote(""); setCompleteOpen(true); }} disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-[hsl(var(--success))] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:opacity-60">
                <CheckCircle2 className="h-3.5 w-3.5" /> Selesaikan
              </button>
            )}
          </div>

          {completeOpen && (
            <div className="rounded-2xl border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5 p-3 space-y-2.5">
              <p className="text-xs font-bold text-foreground">Catatan penyelesaian (opsional)</p>
              <textarea
                value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} rows={3}
                placeholder="Contoh: penggantian bearing selesai, mesin sudah diuji jalan normal."
                className="w-full resize-none rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex gap-2">
                <button onClick={() => setCompleteOpen(false)} disabled={saving} className="flex-1 rounded-xl border bg-background py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted/40 disabled:opacity-60">Batal</button>
                <button onClick={submitCompletion} disabled={saving} className="flex-1 rounded-xl bg-[hsl(var(--success))] py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60">
                  {saving ? "Menyimpan..." : "Konfirmasi Selesai"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "checklist" && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border p-3 text-xs text-muted-foreground">Semua checklist wajib diselesaikan sebelum WO dapat dikirim ke approval Manager.</div>
          {(d.checklist || []).length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">Belum ada checklist pada WO ini.</p>}
          <div className="grid gap-2 lg:grid-cols-2">
            {(d.checklist || []).map((item) => (
              <label key={item.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <input type="checkbox" checked={!!item.is_completed} disabled={!isAssignee || d.status !== "IN_PROGRESS" || saving} onChange={(e) => updateChecklist(item, e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
                <span className={item.is_completed ? "text-sm text-muted-foreground line-through" : "text-sm font-medium text-foreground"}>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {tab === "evidence" && (
        <div className="space-y-5 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
          {['BEFORE', 'DURING', 'AFTER'].map((role) => (
            <div key={role} className="rounded-2xl border border-border p-3">
              <p className="mb-2 text-xs font-bold text-foreground">Foto {role.toLowerCase()}</p>
              <PhotoCapture photos={photos[role]} onAdd={(photo) => addPhoto(role, photo)} onRemove={(i) => setPhotos((current) => ({ ...current, [role]: current[role].filter((_, index) => index !== i) }))} />
              <p className="mt-2 text-[11px] text-muted-foreground">Foto disimpan ke audit trail Work Order.</p>
            </div>
          ))}
          <div className="rounded-2xl border border-border p-3 lg:col-span-3">
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-foreground">Tanda tangan teknisi</p><PenLine className="h-4 w-4 text-primary" /></div>
            {d.signatures?.length ? <p className="text-xs text-emerald-600">Tersimpan pada {new Date(d.signatures[0].signed_at).toLocaleString("id-ID")}</p> : <button onClick={() => setSignatureOpen(true)} disabled={!isAssignee || d.status !== "IN_PROGRESS"} className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-50 lg:w-auto lg:px-6">Ambil Tanda Tangan</button>}
            {signatureOpen && <div className="mt-3 lg:max-w-sm"><SignaturePad onSave={saveSignature} /></div>}
          </div>
        </div>
      )}

      {tab === "time" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border p-4 text-center">
            <div className="text-xs text-muted-foreground">Status Timer</div>
            <div className="font-display text-lg font-extrabold text-foreground mt-1">{STATUS_LABEL[d.status] || d.status}</div>
            <div className="mt-3 flex justify-center gap-2">
              {d.status === "IN_PROGRESS" && isAssignee && (
                <>
                  <button onClick={() => act("timer/start")} disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-60">
                    <Play className="h-4 w-4" /> Start Timer
                  </button>
                  <button onClick={() => act("timer/stop")} disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl border bg-background px-5 py-2.5 text-sm font-semibold transition hover:bg-muted/40 disabled:opacity-60">
                    <Square className="h-4 w-4" /> Stop
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="grid gap-1.5 lg:grid-cols-2">
            {(d.labor_entries || []).length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground lg:col-span-2">Belum ada catatan waktu kerja.</p>
            )}
            {(d.labor_entries || []).map((l, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span>{new Date(l.started_at).toLocaleTimeString("id-ID")} → {l.ended_at ? new Date(l.ended_at).toLocaleTimeString("id-ID") : "berjalan"}</span>
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
              onKeyDown={(e) => { if (e.key === "Enter" && !saving) sendNote(); }}
              placeholder="Catatan lapangan..."
              className="flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button onClick={sendNote} disabled={saving || !note.trim()} className="rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-60">Kirim</button>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {(d.comments || []).length === 0 && <p className="text-xs text-muted-foreground">Belum ada catatan.</p>}
            {(d.comments || []).map((c, i) => {
              const isMe = c.author_id === user?.tenantUserId;
              return (
                <div key={i} className={`rounded-xl border p-3 ${isMe ? "border-primary/20 bg-primary/[0.03]" : "border-border"}`}>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{isMe ? "Anda" : c.author_name || "Teknisi"}</span>
                    <span>{new Date(c.created_at).toLocaleTimeString("id-ID")}</span>
                  </div>
                  <p className="mt-1 text-sm">{c.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "parts" && (
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {isAssignee && d.status === "IN_PROGRESS" ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">Scan part yang dipakai</p>
              <div className="flex gap-2">
                <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode / kode part"
                  className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
                <button onClick={() => setScannerOpen(true)} className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-105"><ScanLine className="h-4 w-4" /> Scan</button>
              </div>
              <div className="grid grid-cols-[1fr_88px] gap-2">
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-xl border bg-background px-3 py-2.5 text-sm">
                  <option value="">Pilih gudang...</option>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-xl border bg-background px-3 py-2.5 text-sm" />
              </div>
              <button onClick={recordPart} disabled={saving} className="w-full rounded-xl bg-[hsl(var(--success))] py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60">
                {saving ? "Mencatat..." : "Gunakan Part"}
              </button>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">Part hanya dapat dicatat oleh teknisi yang ditugaskan saat WO sedang dikerjakan.</p>
          )}
          <div className="space-y-2">
            {(d.parts || []).length === 0 && <p className="text-xs text-muted-foreground">Belum ada part yang digunakan.</p>}
            {(d.parts || []).map((part) => (
              <div key={part.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <div><p className="font-semibold text-foreground">{part.name}</p><p className="text-xs text-muted-foreground">{part.code} · {part.warehouse_name}</p></div>
                <span className="font-semibold text-foreground">×{part.quantity} {part.unit}</span>
              </div>
            ))}
          </div>
          <ScannerSheet open={scannerOpen} onClose={() => setScannerOpen(false)} onDetect={setBarcode} title="Scan barcode spare part" />
        </div>
      )}

      <button onClick={onClose} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border bg-background py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted/40 lg:w-auto lg:px-8">
        <X className="h-4 w-4" /> Tutup
      </button>
    </Sheet>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}