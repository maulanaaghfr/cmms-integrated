import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  Search, Play, Square, Check, Package, Camera, PenLine, MessageSquare,
  ChevronRight, ListChecks, Clock, ScanLine, X,
} from "lucide-react";
import { useApp } from "../../store/store";
import { Sheet, ScannerSheet, SignaturePad, GpsButton, PhotoCapture, SlaBadge } from "../../components/mobile-kit";
import { listWorkOrders, getWorkOrder, workOrderAction, startTimer, stopTimer, recordWorkOrderPart, updateWorkOrderChecklist, signWorkOrder } from "../../lib/workorders";
import { addComment, uploadAttachment, downloadAttachment, deleteAttachment } from "../../lib/requests";
import { listWarehouses } from "../../lib/inventory";

const FILTERS = [
  { key: "active", label: "Aktif" },
  { key: "new", label: "Baru" },
  {key: "hold", label: "Ditunda"},
  { key: "done", label: "Selesai" },
];
const priorityDot = { CRITICAL: "bg-destructive", HIGH: "bg-[hsl(var(--warning))]", MEDIUM: "bg-accent", LOW: "bg-muted-foreground" };
const statusLabel = {
  OPEN: "Siap ditugaskan", ASSIGNED: "Sudah ditugaskan", IN_PROGRESS: "Sedang dikerjakan",
  ON_HOLD: "Ditunda sementara", COMPLETED: "Selesai - menunggu verifikasi", CLOSED: "Ditutup",
  CANCELLED: "Dibatalkan", PENDING_APPROVAL: "Menunggu persetujuan",
};

function normalizeWorkOrderDetail(data) {
  const entries = data?.time_logs || data?.labor_entries || [];
  const attachments = data?.attachments || [];
  const evidence = data?.evidence || {
    BEFORE: attachments.filter((item) => item.media_role === "BEFORE"),
    DURING: attachments.filter((item) => item.media_role === "DURING"),
    AFTER: attachments.filter((item) => item.media_role === "AFTER"),
  };

  return {
    ...data,
    time_logs: entries,
    labor_entries: entries,
    attachments,
    evidence,
    checklist: data?.checklist || [],
    signatures: data?.signatures || [],
    comments: data?.comments || [],
    parts: data?.parts || [],
  };
}

function savedLocationFromComments(comments = []) {
  const row = [...comments].reverse().find((item) =>
    String(item.body || "").startsWith("[LOCATION_SHARED]"),
  );
  if (!row) return null;

  try {
    return JSON.parse(String(row.body).replace("[LOCATION_SHARED]", "").trim());
  } catch {
    return null;
  }
}

async function attachmentAsPhoto(attachment) {
  const blob = await downloadAttachment(attachment.id);
  return {
    id: attachment.id,
    url: URL.createObjectURL(blob),
    at: attachment.created_at,
    coords: null,
  };
}

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
      setDetail(normalizeWorkOrderDetail(res.data));
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
  const countFor = (key) => workOrders.filter((w) => key === "active" ? ["IN_PROGRESS", "ASSIGNED"].includes(w.status) : key === "new" ? ["OPEN", "PENDING_APPROVAL"].includes(w.status) : key === "hold" ? w.status === "ON_HOLD" : ["COMPLETED", "CLOSED", "CANCELLED"].includes(w.status)).length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div><h1 className="font-display text-2xl font-extrabold text-slate-950">Work Order</h1><p className="mt-1 text-xs text-slate-500">Kelola dan pantau semua work order.</p></div>
        <div className="hidden items-center gap-2 lg:flex"><span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{workOrders.length} total WO</span></div>
      </div>
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari work order..."
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition ${filter === f.key ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
            {f.label} ({countFor(f.key)})
          </button>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full text-left text-xs"><thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">No WO</th><th className="px-4 py-3">Judul</th><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Prioritas</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Jatuh Tempo</th><th className="px-4 py-3">Teknisi</th><th /></tr></thead><tbody className="divide-y divide-slate-100">{loading && <tr><td colSpan="8" className="p-10 text-center text-slate-400">Memuat...</td></tr>}{!loading && !rows.length && <tr><td colSpan="8" className="p-10 text-center text-slate-400">Tidak ada work order pada filter ini.</td></tr>}{rows.map((w) => <tr key={w.id} onClick={() => setOpenId(w.id)} className="cursor-pointer hover:bg-slate-50"><td className="px-4 py-4 font-mono text-[10px] text-slate-500">{w.work_order_number || w.id}</td><td className="px-4 py-4"><div className="font-semibold text-slate-800">{w.title}</div><div className="text-[10px] text-slate-400">{w.category_name || "Maintenance"}</div></td><td className="px-4 py-4 text-slate-500">{w.asset_name || w.asset?.name || "—"}</td><td className="px-4 py-4"><span className={`rounded px-2 py-1 text-[10px] font-semibold ${w.priority === "CRITICAL" ? "bg-red-50 text-red-600" : w.priority === "HIGH" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{w.priority || "—"}</span></td><td className="px-4 py-4"><span className="rounded px-2 py-1 text-[10px] font-semibold bg-blue-50 text-blue-700">{statusLabel[w.status] || w.status}</span></td><td className="px-4 py-4 text-slate-500">{w.due_at ? new Date(w.due_at).toLocaleDateString("id-ID") : "—"}</td><td className="px-4 py-4 text-slate-500">{w.assignee_name || w.current_assignee_name || "Saya"}</td><td className="px-4 py-4 text-right"><button className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600">Detail</button></td></tr>)}</tbody></table>
      </div>

      <div className="space-y-2.5 lg:hidden">
        {loading && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Memuat...</div>}
        {!loading && rows.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Tidak ada work order pada filter ini.</div>}
        {rows.map((w) => (
          <button key={w.id} onClick={() => setOpenId(w.id)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left soft-card active:scale-[0.99]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${priorityDot[w.priority] || "bg-muted-foreground"}`} />
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground">{w.title}</div>
              <div className="text-xs text-muted-foreground">{w.work_order_number} · {statusLabel[w.status] || w.status}</div>
            </div>
            <SlaBadge w={w} />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      {detail && (
        <>
          <div className="lg:hidden"><WorkOrderMobileDetail detail={detail} onClose={() => { setOpenId(null); setDetail(null); }} onRefresh={() => { load(); if (openId) loadDetail(openId); }} user={user} /></div>
          <div className="hidden lg:block"><WorkOrderDesktopDetail detail={detail} onClose={() => { setOpenId(null); setDetail(null); }} onRefresh={() => { load(); if (openId) loadDetail(openId); }} user={user} /></div>
        </>
      )}
    </div>
  );
}

function WorkOrderDesktopDetail({ detail: d, onClose, onRefresh, user }) {
  const [tab, setTab] = useState("overview"); const [saving, setSaving] = useState(false); const [note, setNote] = useState(""); const [completionNote, setCompletionNote] = useState(""); const [barcode, setBarcode] = useState(""); const [quantity, setQuantity] = useState(1); const [warehouseId, setWarehouseId] = useState(""); const [warehouses, setWarehouses] = useState([]); const [photos, setPhotos] = useState({ BEFORE: [], DURING: [], AFTER: [] });

  useEffect(() => {
    let cancelled = false;
    const grouped = { BEFORE: [], DURING: [], AFTER: [] };

    Promise.all(
      (d.attachments || [])
        .filter((item) => grouped[item.media_role])
        .map(async (item) => {
          try {
            return [item.media_role, await attachmentAsPhoto(item)];
          } catch {
            return null;
          }
        }),
    ).then((rows) => {
      if (cancelled) return;
      rows.filter(Boolean).forEach(([role, photo]) => grouped[role].push(photo));
      setPhotos(grouped);
    });

    return () => {
      cancelled = true;
    };
  }, [d.id, d.attachments]);
  const isAssignee = d.current_assignee_id === user?.tenantUserId;
  const activeTimer = (d.time_logs || d.labor_entries || []).find((log) => !log.ended_at && !log.stopped_at);
  const completedChecklist = (d.checklist || []).filter((item) => item.is_completed).length; const checklistTotal = (d.checklist || []).length; const evidenceCount = Object.values(d.evidence || {}).reduce((sum, items) => sum + items.length, 0);
  const [timerNow, setTimerNow] = useState(Date.now());
  useEffect(() => { if (!activeTimer) return; const interval = window.setInterval(() => setTimerNow(Date.now()), 1000); return () => window.clearInterval(interval); }, [activeTimer?.started_at]);
  const timerSeconds = activeTimer ? Math.max(0, Math.floor((timerNow - new Date(activeTimer.started_at).getTime()) / 1000)) : 0;
  const formatTimer = (seconds) => `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const act = async (action, body = {}) => { setSaving(true); try { if (action === "timer/start") await startTimer(d.id); else if (action === "timer/stop") await stopTimer(d.id); else await workOrderAction(d.id, action, body); toast.success("Perubahan tersimpan."); onRefresh(); } catch (err) { toast.error(err.message || "Aksi gagal."); } finally { setSaving(false); } };
  useEffect(() => { if (tab === "parts" && !warehouses.length) listWarehouses().then((res) => { setWarehouses(res.data || []); setWarehouseId(res.data?.[0]?.id || ""); }).catch(() => {}); }, [tab, warehouses.length]);
  const updateChecklist = async (item, checked) => { setSaving(true); try { await updateWorkOrderChecklist(d.id, item.id, { is_completed: checked, note: item.note || null }); onRefresh(); } catch (err) { toast.error(err.message || "Checklist gagal disimpan."); } finally { setSaving(false); } };
  const saveNote = async () => { if (!note.trim()) return; setSaving(true); try { await addComment("WORK_ORDER", d.id, note.trim()); setNote(""); onRefresh(); } catch (err) { toast.error(err.message || "Catatan gagal disimpan."); } finally { setSaving(false); } };
  const recordPart = async () => { if (!barcode.trim() || !warehouseId) return toast.error("Barcode dan gudang wajib dipilih."); setSaving(true); try { await recordWorkOrderPart(d.id, { barcode: barcode.trim().toUpperCase(), warehouse_id: warehouseId, quantity: Number(quantity) }); setBarcode(""); onRefresh(); } catch (err) { toast.error(err.message || "Part gagal dicatat."); } finally { setSaving(false); } };
  const tabs = [["overview", "Info"], ["checklist", "Checklist"], ["evidence", "Bukti Foto"], ["timer", "Timer"], ["notes", "Catatan"], ["parts", "Part / Barcode"]];
  return <div className="mt-1 space-y-4"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><button onClick={onClose} className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">←</button><div><div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-2xl font-extrabold text-slate-950">{d.work_order_number || d.id}</h1><span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{statusLabel[d.status] || d.status}</span><span className="rounded bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600">{d.priority}</span></div><p className="mt-1 text-sm text-slate-500">{d.title}</p></div></div><div className="flex gap-2">{d.status === "IN_PROGRESS" && isAssignee && <button onClick={() => act("complete", { completion_note: completionNote || "Pekerjaan selesai." })} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Selesaikan WO</button>}<button onClick={() => setTab("overview")} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">⌖ Bagikan Lokasi</button></div></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center">{[["Ditugaskan", "ASSIGNED"], ["Dikerjakan", "IN_PROGRESS"], ["Selesai", "COMPLETED"], ["Ditutup", "CLOSED"]].map(([label, state], index, all) => { const current = Math.max(0, ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "CLOSED"].indexOf(d.status)); return <React.Fragment key={state}><div className={`flex items-center gap-2 text-xs font-semibold ${index <= current ? "text-blue-700" : "text-slate-300"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full ${index < current ? "bg-emerald-500 text-white" : index === current ? "bg-blue-600 text-white" : "bg-slate-50 ring-1 ring-slate-200"}`}>{index < current ? "✓" : index + 1}</span>{label}</div>{index < all.length - 1 && <div className={`mx-3 h-0.5 flex-1 ${index < current ? "bg-emerald-400" : "bg-slate-200"}`} />}</React.Fragment>; })}</div></div><div className="flex overflow-x-auto border-b border-slate-200">{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold ${tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500"}`}>{label}</button>)}</div>{tab === "overview" && <div className="grid gap-4 xl:grid-cols-[1fr_240px]"><div className="space-y-4"><Panel title="Informasi Work Order"><div className="grid gap-4 sm:grid-cols-2">{[["Nomor WO", d.work_order_number || d.id], ["Kategori", d.category_name || "Maintenance"], ["Asset", d.asset_name || d.asset?.name || "—"], ["Lokasi", d.location_name || d.location || "—"], ["Jatuh Tempo", d.due_at ? new Date(d.due_at).toLocaleDateString("id-ID") : "—"], ["Teknisi", d.assignee_name || d.current_assignee_name || "—"]].map(([label, value]) => <div key={label}><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>)}</div></Panel><Panel title="Deskripsi Pekerjaan"><p className="text-sm leading-6 text-slate-600">{d.description || "Belum ada deskripsi pekerjaan."}</p></Panel><Panel title="Lokasi"><GpsButton targetCoords={null} label={savedLocationFromComments(d.comments) ? "Lokasi tersimpan — bagikan ulang" : "Bagikan Lokasi Saya"} initialLocation={savedLocationFromComments(d.comments)} onLocated={async (location) => { await addComment("WORK_ORDER", d.id, `[LOCATION_SHARED] ${JSON.stringify({ ...location, saved_at: new Date().toISOString() })}`); toast.success("Lokasi berhasil disimpan."); onRefresh(); }} /></Panel></div><div className="space-y-4"><Panel title="Aksi Cepat"><div className="space-y-2">{[["Buka Checklist", "checklist"], ["Ambil Foto", "evidence"], ["Timer Kerja", "timer"], ["Scan Barcode", "parts"]].map(([label, key]) => <button key={key} onClick={() => setTab(key)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:border-blue-300">✓ {label}</button>)}</div></Panel><Panel title="Progres"><Progress label="Checklist" value={checklistTotal ? `${completedChecklist}/${checklistTotal}` : "0/0"} pct={checklistTotal ? completedChecklist / checklistTotal * 100 : 0} /><Progress label="Foto" value={`${evidenceCount}/3`} pct={Math.min(evidenceCount / 3 * 100, 100)} /><Progress label="Part" value={`${(d.parts || []).length} item`} pct={Math.min((d.parts || []).length * 20, 100)} /></Panel></div></div>}{tab === "checklist" && <Panel title="Checklist Pekerjaan"><p className="mb-3 text-xs text-slate-500">{completedChecklist} dari {checklistTotal} item selesai</p>{(d.checklist || []).map((item) => <label key={item.id} className="flex items-center gap-3 border-t border-slate-100 px-1 py-4 text-sm"><input type="checkbox" checked={!!item.is_completed} disabled={d.status !== "IN_PROGRESS" || saving} onChange={(e) => updateChecklist(item, e.target.checked)} className="h-4 w-4 accent-blue-600" /><span className={item.is_completed ? "text-slate-400 line-through" : "text-slate-700"}>{item.label}</span>{item.is_required && <span className="ml-auto rounded border border-red-200 px-2 py-1 text-[10px] text-red-500">Wajib</span>}</label>)}{!checklistTotal && <p className="py-8 text-center text-sm text-slate-400">Belum ada checklist.</p>}</Panel>}{tab === "evidence" && <Panel title="Bukti Foto"><div className="grid gap-3 md:grid-cols-3">{["BEFORE", "DURING", "AFTER"].map((role) => <div key={role} className="rounded-xl border border-dashed border-slate-200 p-3"><p className="mb-2 text-xs font-bold">{role === "BEFORE" ? "Sebelum" : role === "DURING" ? "Selama" : "Sesudah"}</p><PhotoCapture photos={photos[role]} onAdd={(photo) => setPhotos((current) => ({ ...current, [role]: [...current[role], photo] }))} onRemove={(index) => setPhotos((current) => ({ ...current, [role]: current[role].filter((_, i) => i !== index) }))} /></div>)}</div></Panel>}{tab === "timer" && <Panel title="Timer Kerja"><div className="rounded-2xl bg-slate-900 p-8 text-center text-white"><p className="font-mono text-5xl font-bold">{formatTimer(timerSeconds)}</p><p className="mt-2 text-xs text-white/60">{activeTimer ? "Timer sedang berjalan" : "Timer belum dimulai"}</p><div className="mt-5">{d.status === "IN_PROGRESS" && <button onClick={() => act(activeTimer ? "timer/stop" : "timer/start")} className={`rounded-xl px-5 py-2.5 text-sm font-bold ${activeTimer ? "bg-red-500" : "bg-blue-600"}`}>{activeTimer ? "Hentikan Timer" : "Mulai Timer"}</button>}</div></div><div className="mt-4 space-y-2">{(d.time_logs || d.labor_entries || []).map((log, index) => <div key={index} className="flex justify-between rounded-lg border border-slate-200 p-3 text-xs"><span>{new Date(log.started_at).toLocaleString("id-ID")}</span><b>{log.duration_minutes || 0} menit</b></div>)}</div></Panel>}{tab === "notes" && <div className="grid gap-4 lg:grid-cols-2"><Panel title="Tambah Catatan"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={6} placeholder="Tulis catatan lapangan..." className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" /><button onClick={saveNote} disabled={saving} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white">Simpan Catatan</button></Panel><Panel title={`Riwayat Catatan (${(d.comments || []).filter((c) => !String(c.body || "").startsWith("[LOCATION_SHARED]")).length})`}><div className="space-y-3">{(d.comments || []).filter((c) => !String(c.body || "").startsWith("[LOCATION_SHARED]")).map((comment, index) => <div key={index} className="rounded-xl bg-slate-50 p-3 text-xs"><b>{comment.author_name || comment.created_by}</b><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{comment.body}</p></div>)}</div></Panel></div>}{tab === "parts" && <Panel title="Part / Barcode"><div className="grid gap-3 md:grid-cols-[1fr_160px_100px_auto]"><input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode part" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">Gudang...</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select><input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button onClick={recordPart} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white">Gunakan Part</button></div><div className="mt-4 space-y-2">{(d.parts || []).map((part) => <div key={part.id} className="flex justify-between rounded-lg border border-slate-200 p-3 text-xs"><span><b>{part.name}</b><br /><span className="text-slate-500">{part.code} · {part.warehouse_name}</span></span><b>×{part.quantity} {part.unit}</b></div>)}</div></Panel>}</div>;
}

function Panel({ title, children }) { return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-4 text-sm font-bold text-slate-800">{title}</h2>{children}</section>; }
function Progress({ label, value, pct }) { return <div className="mb-3"><div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>{label}</span><span>{value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} /></div></div>; }

function WorkOrderMobileDetail({ detail: d, onClose, onRefresh, user }) {
  const [tab, setTab] = useState("overview");
  const [note, setNote] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState([]);
  const [photos, setPhotos] = useState({ BEFORE: [], DURING: [], AFTER: [] });
  const [signatureOpen, setSignatureOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const grouped = { BEFORE: [], DURING: [], AFTER: [] };

    Promise.all(
      (d.attachments || [])
        .filter((item) => grouped[item.media_role])
        .map(async (item) => {
          try {
            return [item.media_role, await attachmentAsPhoto(item)];
          } catch {
            return null;
          }
        }),
    ).then((rows) => {
      if (cancelled) return;
      rows.filter(Boolean).forEach(([role, photo]) => grouped[role].push(photo));
      setPhotos(grouped);
    });

    return () => {
      cancelled = true;
    };
  }, [d.id, d.attachments]);
  const [timerNow, setTimerNow] = useState(Date.now());

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
      await addComment("WORK_ORDER", d.id, note.trim());
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
    { k: "checklist", label: "Checklist", icon: Check },
    { k: "evidence", label: "Bukti Foto", icon: Camera },
    { k: "time", label: "Timer", icon: Clock },
    { k: "notes", label: "Catatan", icon: MessageSquare },
    { k: "parts", label: "Part / Barcode", icon: Package },
  ];

  const isAssignee = d.current_assignee_id === user?.tenantUserId;
  const activeTimer = (d.time_logs || d.labor_entries || []).find((log) => !log.ended_at && !log.stopped_at);
  useEffect(() => {
    if (!activeTimer) return undefined;
    const interval = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeTimer?.started_at]);
  const timerSeconds = activeTimer ? Math.max(0, Math.floor((timerNow - new Date(activeTimer.started_at).getTime()) / 1000)) : 0;
  const formatTimer = (seconds) => `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const totalMinutes = (d.time_logs || d.labor_entries || []).reduce((sum, log) => sum + Number(log.duration_minutes || 0), 0) + Math.floor(timerSeconds / 60);
  const workflow = ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "CLOSED"];
  const workflowIndex = Math.max(0, workflow.indexOf(d.status));

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
    const value = String(dataUrl || "");
    const comma = value.indexOf(",");
    if (!value.startsWith("data:") || comma < 0) {
      throw new Error("Format foto tidak valid.");
    }

    const header = value.slice(5, comma);
    const encoded = value.slice(comma + 1);
    const mime = header.split(";")[0] || "image/jpeg";
    const binary = header.includes("base64")
      ? atob(encoded)
      : decodeURIComponent(encoded);

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new File([bytes], name, { type: mime });
  };

  const compressPhotoForUpload = async (dataUrl, name) => {
    const source = String(dataUrl || "");
    if (!source.startsWith("data:image/")) {
      throw new Error("Format foto tidak valid.");
    }

    const image = new Image();

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Foto tidak dapat diproses."));
      image.src = source;
    });

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.72);
    });

    if (!blob) {
      throw new Error("Foto gagal dikompres.");
    }

    return new File([blob], name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
    });
  };

  const removePhoto = async (role, index) => {
    const photo = photos[role]?.[index];
    if (!photo) return;

    if (!photo.id) {
      setPhotos((current) => ({
        ...current,
        [role]: current[role].filter((_, i) => i !== index),
      }));
      return;
    }

    setSaving(true);

    try {
      await deleteAttachment(photo.id);

      setPhotos((current) => ({
        ...current,
        [role]: current[role].filter((_, i) => i !== index),
      }));

      toast.success("Foto berhasil dihapus.");
      await onRefresh();
    } catch (err) {
      console.error("PHOTO_DELETE_FAILED", err);
      toast.error(err?.message || "Foto gagal dihapus.");
    } finally {
      setSaving(false);
    }
  };

  const addPhoto = async (role, photo) => {
    setSaving(true);

    try {
      const file = await compressPhotoForUpload(
        photo.url,
        `${role.toLowerCase()}-${Date.now()}.jpg`,
      );

      await uploadAttachment("WORK_ORDER", d.id, file, role);
      toast.success(`Foto ${role.toLowerCase()} berhasil diunggah.`);
    } catch (err) {
      console.error("PHOTO_UPLOAD_FAILED", {
        message: err?.message,
        code: err?.code,
        status: err?.status,
        details: err?.details,
      });
      toast.error(err?.message || "Upload foto gagal.");
      setSaving(false);
      return;
    }

    try {
      await onRefresh();
    } catch (err) {
      console.error("PHOTO_REFRESH_FAILED", err);
    } finally {
      setSaving(false);
    }
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

  const submitCompletion = async () => {
    if (!(d.evidence?.BEFORE?.length)) return toast.error("Foto before wajib diunggah terlebih dahulu.");
    if (!(d.evidence?.AFTER?.length)) return toast.error("Foto after wajib diunggah terlebih dahulu.");
    if (!(d.signatures?.length)) return toast.error("Tanda tangan digital wajib disimpan terlebih dahulu.");
    if (!completionNote.trim()) return toast.error("Catatan penyelesaian wajib diisi.");
    await act("complete", { completion_note: completionNote.trim() });
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

  return (
    <Sheet open onClose={onClose} title={`${d.work_order_number || d.id} — ${d.title}`}>
      <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between gap-1">{[["Ditugaskan", "ASSIGNED"], ["Dikerjakan", "IN_PROGRESS"], ["Selesai", "COMPLETED"], ["Ditutup", "CLOSED"]].map(([label, state], index) => <React.Fragment key={state}><div className={`flex shrink-0 items-center gap-1.5 text-[10px] font-semibold ${index <= workflowIndex ? "text-blue-700" : "text-slate-400"}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full ${index < workflowIndex ? "bg-emerald-500 text-white" : index === workflowIndex ? "bg-blue-600 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"}`}>{index < workflowIndex ? "✓" : index + 1}</span><span className="hidden sm:inline">{label}</span></div>{index < 3 && <div className={`h-0.5 min-w-4 flex-1 ${index < workflowIndex ? "bg-emerald-400" : "bg-slate-200"}`} />}</React.Fragment>)}</div></div>
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
            <GpsButton
              targetCoords={null}
              label={savedLocationFromComments(d.comments) ? "Lokasi tersimpan — bagikan ulang" : "Bagikan Lokasi Saya"}
              initialLocation={savedLocationFromComments(d.comments)}
              onLocated={async (location) => {
                await addComment(
                  "WORK_ORDER",
                  d.id,
                  `[LOCATION_SHARED] ${JSON.stringify({
                    ...location,
                    saved_at: new Date().toISOString(),
                  })}`,
                );
                toast.success("Lokasi berhasil disimpan.");
                onRefresh();
              }}
            />
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
              <button onClick={() => setTab("evidence")} disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-[hsl(var(--success))] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
                <Check className="h-3.5 w-3.5" /> Dokumentasi & selesaikan
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "checklist" && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border p-3 text-xs text-muted-foreground">Semua checklist wajib diselesaikan sebelum WO dapat dikirim ke approval Manager.</div>
          {(d.checklist || []).length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">Belum ada checklist pada WO ini.</p>}
          {(d.checklist || []).map((item) => (
            <label key={item.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
              <input type="checkbox" checked={!!item.is_completed} disabled={d.status !== "IN_PROGRESS" || saving} onChange={(e) => updateChecklist(item, e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span className={item.is_completed ? "text-sm text-muted-foreground line-through" : "text-sm font-medium text-foreground"}>{item.label}</span>
            </label>
          ))}
        </div>
      )}

      {tab === "evidence" && (
        <div className="space-y-5">
          {['BEFORE', 'DURING', 'AFTER'].map((role) => (
            <div key={role} className="rounded-2xl border border-border p-3">
              <p className="mb-2 text-xs font-bold text-foreground">Foto {role.toLowerCase()}</p>
              <PhotoCapture photos={photos[role]} onAdd={(photo) => addPhoto(role, photo)} onRemove={(i) => removePhoto(role, i)} />
              <p className="mt-2 text-[11px] text-muted-foreground">Foto disimpan ke audit trail Work Order.</p>
            </div>
          ))}
          <div className="rounded-2xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-foreground">Tanda tangan teknisi</p><PenLine className="h-4 w-4 text-primary" /></div>
            {d.signatures?.length ? <p className="text-xs text-emerald-600">Tersimpan pada {new Date(d.signatures[0].signed_at).toLocaleString("id-ID")}</p> : <button onClick={() => setSignatureOpen(true)} disabled={d.status !== "IN_PROGRESS"} className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Ambil Tanda Tangan</button>}
            {signatureOpen && <div className="mt-3"><SignaturePad onSave={saveSignature} /></div>}
          </div>
          {d.status === "IN_PROGRESS" && isAssignee && <button onClick={submitCompletion} disabled={saving} className="w-full rounded-xl bg-[hsl(var(--success))] py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Check className="mr-1 inline h-4 w-4" /> Kirim penyelesaian</button>}
          {d.status === "IN_PROGRESS" && isAssignee && <textarea value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} placeholder="Catatan penyelesaian (wajib)" rows={3} className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />}
        </div>
      )}

      {tab === "time" && (
        <div className="space-y-4">
          <div className={`relative overflow-hidden rounded-3xl p-5 text-center text-white ${activeTimer ? "bg-gradient-to-br from-blue-700 to-indigo-900" : "bg-slate-900"}`}>
            <div className="relative"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">{activeTimer ? "Timer sedang berjalan" : "Timer belum dimulai"}</div><div className="mt-2 font-mono text-5xl font-bold tracking-tight">{formatTimer(timerSeconds)}</div><p className="mt-2 text-xs text-white/70">{activeTimer ? `Dimulai ${new Date(activeTimer.started_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : "Catat waktu aktual untuk audit pekerjaan."}</p><div className="mt-5 flex justify-center gap-2">{d.status === "IN_PROGRESS" && !activeTimer && <button onClick={() => act("timer/start")} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-blue-700 disabled:opacity-60"><Play className="h-4 w-4" /> Mulai Timer</button>}{d.status === "IN_PROGRESS" && activeTimer && <button onClick={() => act("timer/stop")} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Square className="h-4 w-4" /> Hentikan Timer</button>}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-border bg-card p-4"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total waktu WO</p><p className="mt-1 text-xl font-bold text-foreground">{Math.floor(totalMinutes / 60)}j {totalMinutes % 60}m</p></div><div className="rounded-2xl border border-border bg-card p-4"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sesi tercatat</p><p className="mt-1 text-xl font-bold text-foreground">{(d.time_logs || d.labor_entries || []).length}</p></div></div>
          <div className="hidden rounded-2xl border border-border p-4 text-center">
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
            {(d.time_logs || d.labor_entries || []).map((l, i) => (
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
            {(d.comments || []).filter((c) => !String(c.body || "").startsWith("[LOCATION_SHARED]")).length === 0
              && <p className="text-xs text-muted-foreground">Belum ada catatan.</p>}
            {(d.comments || []).filter((c) => !String(c.body || "").startsWith("[LOCATION_SHARED]")).map((c, i) => (
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

      {tab === "parts" && (
        <div className="space-y-3">
          {d.status === "IN_PROGRESS" ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">Scan part yang dipakai</p>
              <div className="flex gap-2">
                <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode / kode part"
                  className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
                <button onClick={() => setScannerOpen(true)} className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"><ScanLine className="h-4 w-4" /> Scan</button>
              </div>
              <div className="grid grid-cols-[1fr_88px] gap-2">
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-xl border bg-background px-3 py-2.5 text-sm">
                  <option value="">Pilih gudang...</option>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-xl border bg-background px-3 py-2.5 text-sm" />
              </div>
              <button onClick={recordPart} disabled={saving} className="w-full rounded-xl bg-[hsl(var(--success))] py-2.5 text-sm font-semibold text-white disabled:opacity-60">
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
