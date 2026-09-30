import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Check, CheckCircle2, Clock, ClipboardList, History,
  MapPin, MessageSquare, Pause, Play, Plus, Send, Sparkles, UserCheck, RefreshCw,
  UserPlus, Users, Wrench, ListChecks, Radar, ShieldCheck, ChevronRight,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useApp } from "../store/store";
import { Button, Card, Field, Input, Modal, PageHeader, Pill, Reveal, SearchInput, Select, StatCard, Table, Textarea } from "../components/kit";
import { listAssets } from "../lib/assets";
import { listSites, listUsers } from "../lib/organization";
import { createWorkOrder, getWorkOrder, listWorkOrders, startTimer, stopTimer, workOrderAction, recommendTechnicians } from "../lib/workorders";
import { addComment } from "../lib/requests";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const ACTIVE = ["PENDING_APPROVAL", "OPEN", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"];
const STATUS_TABS = [
  ["", "Semua"],
  ["PENDING_APPROVAL", "Menunggu persetujuan"],
  ["OPEN", "Siap ditugaskan"],
  ["ASSIGNED", "Sudah ditugaskan"],
  ["IN_PROGRESS", "Sedang dikerjakan"],
  ["ON_HOLD", "Ditunda"],
  ["COMPLETED", "Selesai"],
  ["CANCELLED", "Dibatalkan"],
];
const STATUS_LABEL = {
  PENDING_APPROVAL: "Menunggu persetujuan", OPEN: "Siap ditugaskan", ASSIGNED: "Sudah ditugaskan", IN_PROGRESS: "Sedang dikerjakan",
  ON_HOLD: "Ditunda sementara", COMPLETED: "Selesai - menunggu verifikasi", CLOSED: "Ditutup", VERIFIED: "Terverifikasi",
  REJECTED: "Ditolak", CANCELLED: "Dibatalkan",
};
const PRIORITY_LABEL = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const tone = (value) => ({
  CRITICAL: "danger", HIGH: "warning", MEDIUM: "accent", LOW: "muted",
  COMPLETED: "success", CLOSED: "success", VERIFIED: "success", REJECTED: "danger", CANCELLED: "muted",
  IN_PROGRESS: "accent", ON_HOLD: "warning", OPEN: "primary", ASSIGNED: "primary", PENDING_APPROVAL: "muted",
}[value] || "primary");
const WORKFLOW_STEPS = [
  ["PENDING_APPROVAL", "Review request"], ["OPEN", "WO dibuat"], ["ASSIGNED", "Teknisi ditugaskan"],
  ["IN_PROGRESS", "Pekerjaan dimulai"], ["COMPLETED", "Menunggu approval"], ["CLOSED", "Ditutup"],
];
const NEXT_ACTION = {
  PENDING_APPROVAL: "Manager perlu memeriksa dan menyetujui work order.",
  OPEN: "Manager perlu memilih teknisi dan menugaskan pekerjaan.",
  ASSIGNED: "Teknisi perlu mengonfirmasi penerimaan lalu menekan Mulai.",
  IN_PROGRESS: "Teknisi perlu memperbarui pekerjaan, lalu mengisi hasil dan menekan Selesaikan.",
  ON_HOLD: "Teknisi perlu melanjutkan pekerjaan atau menambahkan alasan penundaan.",
  COMPLETED: "Manager atau requester perlu memeriksa hasil dan menutup work order.",
  VERIFIED: "Work order sudah diverifikasi.",
  CLOSED: "Work order sudah ditutup.",
  CANCELLED: "Work order ini dibatalkan.",
};
const emptyForm = { asset_id: "", title: "", description: "", priority: "MEDIUM", due_at: "", checklist: [] };

function StatusDot({ status }) {
  const dotClass = ({
    IN_PROGRESS: "bg-blue-500", COMPLETED: "bg-emerald-500", CLOSED: "bg-emerald-500", VERIFIED: "bg-emerald-500",
    ON_HOLD: "bg-orange-500", CANCELLED: "bg-rose-500", REJECTED: "bg-rose-500",
    PENDING_APPROVAL: "bg-muted-foreground/50", OPEN: "bg-sky-500", ASSIGNED: "bg-sky-500",
  }[status]) || "bg-muted-foreground/50";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />;
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function Avatar({ name, size = "h-7 w-7" }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary ring-1 ring-primary/10`}>
      {initials(name)}
    </span>
  );
}

function SectionHeading({ icon: Icon, title, subtitle, trailing }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {Icon && <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>}
        <div>
          <h4 className="font-display text-sm font-bold text-foreground">{title}</h4>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {trailing}
    </div>
  );
}

export default function WorkOrders() {
  const { user } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = String(user?._backend?.membership?.roleKey || user?.role || "").toUpperCase();
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [assets, setAssets] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [activeView, setActiveView] = useState("list");
  const [aiPrioritas, setAiPrioritas] = useState(true);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [assignment, setAssignment] = useState("");
  const [assignmentEditing, setAssignmentEditing] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  // Not every membership has a roleKey populated depending on how the backend
  // hydrated the session — fall back to treating an unrecognized/blank role
  // as "not yet loaded" rather than silently hiding the create action forever.
  const roleReady = !!user;
  const isLeadership = ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"].includes(role);
  const canCreate = !roleReady || ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "OPERATOR"].includes(role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersResponse, allOrdersResponse, assetsResponse, usersResponse, sitesResponse] = await Promise.all([
        listWorkOrders({ status: status || undefined }),
        listWorkOrders({ per_page: 200 }),
        listAssets(), listUsers({ role: "TECHNICIAN", status: "ACTIVE" }), listSites(),
      ]);
      setOrders(ordersResponse?.data || []);
      setAllOrders(allOrdersResponse?.data || []);
      setAssets(assetsResponse?.data || []);
      setTechnicians(usersResponse?.data || []);
      setSites(sitesResponse?.data || []);
    } catch (error) {
      toast.error(error.message || "Gagal memuat work order.");
    } finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const assetId = searchParams.get("asset_id");
    if (assetId && assets.some((asset) => asset.id === assetId) && !form && !detail) setForm({ ...emptyForm, asset_id: assetId });
  }, [assets, searchParams, form, detail]);
  const closeCreateForm = () => {
    setForm(null);
    if (searchParams.has("asset_id")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("asset_id");
      setSearchParams(nextParams, { replace: true });
    }
  };

  const rows = useMemo(() => orders
    .filter((item) => `${item.work_order_number || ""} ${item.title || ""}`.toLowerCase().includes(query.toLowerCase()))
    .filter((item) => !priorityFilter || item.priority === priorityFilter),
    [orders, query, priorityFilter]);

  const tabCounts = useMemo(() => {
    const map = { "": allOrders.length };
    for (const [value] of STATUS_TABS) {
      if (value) map[value] = allOrders.filter((o) => o.status === value).length;
    }
    return map;
  }, [allOrders]);

  const overview = useMemo(() => {
    const openCount = allOrders.filter((o) => ACTIVE.includes(o.status)).length;
    const overdueCount = allOrders.filter((o) =>
      o.due_at && new Date(o.due_at).getTime() < Date.now() && ACTIVE.includes(o.status)
    ).length;
    const completedCount = allOrders.filter((o) => ["COMPLETED", "CLOSED", "VERIFIED"].includes(o.status)).length;
    return { total: allOrders.length, openCount, overdueCount, completedCount };
  }, [allOrders]);

  const monitoringRows = allOrders.filter((item) => ["ASSIGNED", "IN_PROGRESS", "ON_HOLD"].includes(item.status));
  const approvalRows = allOrders.filter((item) => item.status === "PENDING_APPROVAL");

  const assetName = (id) => assets.find((asset) => asset.id === id)?.name || id;
  const siteName = (id) => sites.find((site) => site.id === id)?.name || "—";
  const assignedName = (id) => technicians.find((member) => member.id === id)?.full_name || "";

  const openDetail = async (order) => {
    try {
      const [response, recommendationResponse] = await Promise.all([getWorkOrder(order.id), recommendTechnicians(order.id).catch(() => ({ data: { recommendations: [] } }))]);
      setDetail(response.data); setAssignment(response.data.current_assignee_id || "");
      setAssignmentEditing(false);
      setRecommendations(recommendationResponse.data?.recommendations || []);
      setNote(""); setComment("");
    } catch (error) { toast.error(error.message || "Gagal memuat detail work order."); }
  };
  const save = async () => {
    if (!form.asset_id || !form.title.trim() || !form.description.trim()) return toast.error("Aset, judul, dan deskripsi wajib diisi.");
    const checklist = (form.checklist || []).map((item) => item.trim()).filter(Boolean);
    try { await createWorkOrder({ ...form, checklist, due_at: form.due_at || null }); toast.success("Work order dikirim untuk persetujuan manager."); setForm(null); load(); }
    catch (error) { toast.error(error.message || "Work order gagal dibuat."); }
  };
  const act = async (action, body = {}) => {
    if (!detail) return;
    try {
      if (action === "timer/start") await startTimer(detail.id, body.notes);
      else if (action === "timer/stop") await stopTimer(detail.id, body.notes);
      else await workOrderAction(detail.id, action, body);
      toast.success(action === "approve" ? "Work order disetujui dan teknisi dipilih otomatis bila tersedia." : "Status work order diperbarui.");
      await openDetail(detail); load();
    } catch (error) { toast.error(error.message || "Aksi work order gagal."); }
  };
  const askAndAct = (action, field, label) => {
    const value = window.prompt(label);
    if (value === null || !value.trim()) return;
    act(action, { [field]: value.trim() });
  };

  const columns = [
    { key: "work_order_number", header: "ID", render: (item) => <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] font-semibold text-muted-foreground">{item.work_order_number}</span> },
    {
      key: "title", header: "Pekerjaan", render: (item) => (
        <div>
          <p className="font-semibold text-foreground">{item.title}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Wrench className="h-3 w-3" />{assetName(item.asset_id)}</p>
        </div>
      ),
    },
    {
      key: "status", header: "Status", render: (item) => (
        <Pill className="gap-1.5 px-2.5 py-1 text-[11px] font-semibold" tone={tone(item.status)}>
          <StatusDot status={item.status} /> {STATUS_LABEL[item.status] || item.status.replaceAll("_", " ")}
        </Pill>
      ),
    },
    { key: "priority", header: "Prioritas", render: (item) => <Pill className="px-2.5 py-1 text-[11px] font-semibold" tone={tone(item.priority)}>{PRIORITY_LABEL[item.priority] || item.priority}</Pill> },
    { key: "site", header: "Site", render: (item) => <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{siteName(item.site_id)}</span> },
    {
      key: "assigned", header: "Ditugaskan", render: (item) => (
        item.current_assignee_id
          ? <div className="flex items-center gap-2"><Avatar name={assignedName(item.current_assignee_id)} size="h-6 w-6" /><span className="text-xs text-foreground">{assignedName(item.current_assignee_id) || "—"}</span></div>
          : <span className="text-xs text-muted-foreground/60">Belum ditugaskan</span>
      ),
    },
    {
      key: "due_at", header: "Tenggat", render: (item) => {
        const overdue = item.due_at && new Date(item.due_at).getTime() < Date.now() && ACTIVE.includes(item.status);
        return (
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs ${overdue ? "bg-destructive/10 font-semibold text-destructive" : "text-muted-foreground"}`}>
            {overdue && <AlertTriangle className="h-3 w-3" />}
            {item.due_at ? new Date(item.due_at).toLocaleDateString("en-CA") : "—"}
          </span>
        );
      },
    },
  ];

  return (
    <Reveal className="mx-auto max-w-[1280px] space-y-6 pb-10">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-br from-primary via-primary/90 to-primary/70 px-6 py-8 text-primary-foreground shadow-lg shadow-primary/20 sm:px-9">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide backdrop-blur-sm">
              <ListChecks className="h-3.5 w-3.5" /> Work Order Hub
            </span>
            <h1 className="mt-3 font-display text-2xl font-extrabold sm:text-3xl">Work Orders</h1>
            <p className="mt-1.5 max-w-lg text-sm text-primary-foreground/80">Kelola siklus kerja mulai dari draft, persetujuan, penugasan, sampai selesai — semua dalam satu alur.</p>
          </div>
          {canCreate && (
            <Button className="w-full !bg-white !text-primary shadow-md hover:!bg-slate-100 hover:!text-primary lg:w-auto" onClick={() => setForm({ ...emptyForm, asset_id: assets[0]?.id || "" })}>
              <Plus className="h-4 w-4" /> Work Order Baru
            </Button>
          )}
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-primary-foreground/80">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-300" />Selesai dipantau</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-300" />Pekerjaan aktif</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-300" />Butuh perhatian</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={ClipboardList} label="Total Work Order" value={overview.total} tone="primary" />
        <StatCard icon={Wrench} label="Terbuka & Berjalan" value={overview.openCount} tone="accent" />
        <StatCard icon={AlertTriangle} label="Jatuh Tempo" value={overview.overdueCount} tone="warning" hint={overview.overdueCount > 0 ? "perlu perhatian" : "aman"} />
        <StatCard icon={CheckCircle2} label="Selesai" value={overview.completedCount} tone="success" />
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-border/70 bg-white p-1.5 shadow-sm">
        {[['list', 'Daftar WO', ClipboardList, allOrders.length], ['create', 'Buat WO', Plus, null], ['monitoring', 'Monitoring', Radar, monitoringRows.length], ['approval', 'Persetujuan', ShieldCheck, approvalRows.length]].map(([key, label, Icon, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setActiveView(key); if (key === "create") setForm({ ...emptyForm, asset_id: assets[0]?.id || "" }); }}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-semibold transition-all ${activeView === key ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25" : "text-slate-500 hover:bg-muted/70 hover:text-slate-900"}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {count > 0 && <span className={`rounded-full px-1.5 text-[9px] ${activeView === key ? "bg-white/25" : key === "approval" ? "bg-red-500 text-white" : "bg-slate-100 text-slate-600"}`}>{count}</span>}
          </button>
        ))}
      </div>

      {activeView === "list" && <Card className="min-w-0 overflow-hidden rounded-2xl border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent px-4 py-5 sm:px-6">
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(180px,1fr)_minmax(0,650px)] lg:items-center">
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-foreground">Daftar Work Order</h2>
              <p className="mt-1 text-xs text-muted-foreground">{rows.length} dari {orders.length} ditampilkan</p>
            </div>

            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_170px_auto] lg:grid-cols-[minmax(180px,1fr)_170px_auto] lg:items-center">
              <div className="min-w-0">
                <SearchInput value={query} onChange={setQuery} placeholder="Cari ID atau judul..." />
              </div>

              <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-[42px] w-full py-2 text-xs">
                <option value="">Semua Prioritas</option>
                {PRIORITIES.map((item) => <option key={item} value={item}>{PRIORITY_LABEL[item]}</option>)}
              </Select>

              <button
                type="button"
                onClick={() => setAiPrioritas((v) => !v)}
                className={`inline-flex h-[42px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-semibold transition sm:col-span-1 ${aiPrioritas ? "border-primary/30 bg-primary/10 text-primary shadow-sm" : "border-border bg-background text-muted-foreground"}`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI Prioritas {aiPrioritas ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/10 px-4 py-4 sm:px-6">
          {STATUS_TABS.map(([value, label]) => (
            <button key={label} type="button" onClick={() => setStatus(value)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-bold transition-all ${status === value ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "bg-white text-muted-foreground ring-1 ring-border/60 hover:bg-muted/60 hover:text-foreground"}`}>
              {label}
              <span className={`rounded-full px-1.5 text-[10px] ${status === value ? "bg-primary-foreground/20" : "bg-muted/70"}`}>
                {tabCounts[value] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="min-w-0 overflow-x-auto px-4 pb-3 pt-2 sm:px-6">
          <Table
            columns={columns}
            rows={rows}
            onRowClick={openDetail}
            empty={
              loading
                ? "Memuat work order..."
                : <span className="flex flex-col items-center gap-2 py-4"><ClipboardList className="h-8 w-8 text-muted-foreground/60" />Tidak ada work order yang cocok dengan filter ini.</span>
            }
          />
        </div>
      </Card>}

      {activeView === "monitoring" && <section className="grid gap-4 lg:grid-cols-2">
        {monitoringRows.map((item) => {
          const overdue = item.due_at && new Date(item.due_at).getTime() < Date.now() && ACTIVE.includes(item.status);
          const barColor = item.status === "IN_PROGRESS" ? "bg-sky-500" : item.status === "ON_HOLD" ? "bg-orange-500" : "bg-primary";
          return (
            <Card key={item.id} className="overflow-hidden rounded-2xl border-border/60 p-0 shadow-sm transition hover:shadow-md">
              <div className={`h-1.5 w-full ${barColor}`} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] text-muted-foreground">{item.work_order_number || item.id}</p>
                    <h2 className="mt-1 truncate font-display text-sm font-bold">{item.title}</h2>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Wrench className="h-3 w-3" />{assetName(item.asset_id)}</p>
                  </div>
                  <Pill tone={tone(item.priority)}>{PRIORITY_LABEL[item.priority] || item.priority}</Pill>
                </div>
                <div className="mt-4 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5"><StatusDot status={item.status} />{STATUS_LABEL[item.status] || item.status}</span>
                  <span className={overdue ? "flex items-center gap-1 font-bold text-red-600" : "text-muted-foreground"}>
                    {overdue && <AlertTriangle className="h-3 w-3" />}
                    Due {item.due_at ? new Date(item.due_at).toLocaleDateString("en-CA") : "—"}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: item.status === "IN_PROGRESS" ? "60%" : item.status === "ON_HOLD" ? "35%" : "15%" }} />
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5 text-xs">
                  <span className="flex items-center gap-2">
                    {item.current_assignee_id ? <Avatar name={assignedName(item.current_assignee_id)} size="h-6 w-6" /> : null}
                    {assignedName(item.current_assignee_id) || "Belum ditugaskan"}
                  </span>
                  <button type="button" className="flex items-center gap-1 font-semibold text-primary" onClick={() => openDetail(item)}>Detail <ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </Card>
          );
        })}
        {!monitoringRows.length && <Card className="rounded-2xl lg:col-span-2"><p className="py-12 text-center text-sm text-muted-foreground">Tidak ada work order aktif.</p></Card>}
      </section>}

      {activeView === "approval" && <section className="space-y-3">
        {approvalRows.map((item) => (
          <Card key={item.id} className="overflow-hidden rounded-2xl border-amber-200/80 bg-gradient-to-br from-amber-50 to-white p-0 shadow-sm">
            <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600"><ShieldCheck className="h-4.5 w-4.5" /></span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="warning"><StatusDot status={item.status} /> Pending Approval</Pill>
                    <Pill tone={tone(item.priority)}>{PRIORITY_LABEL[item.priority] || item.priority}</Pill>
                  </div>
                  <h2 className="mt-2 font-display text-sm font-bold">{item.title}</h2>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Wrench className="h-3 w-3" />{assetName(item.asset_id)} <span className="text-muted-foreground/50">·</span> <MapPin className="h-3 w-3" />{siteName(item.site_id)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="text-xs" onClick={() => openDetail(item)}>Review Detail</Button>
                <Button variant="danger" className="text-xs" onClick={() => openDetail(item)}>Tolak</Button>
                <Button className="text-xs" onClick={() => openDetail(item)}><Check className="h-3.5 w-3.5" /> Setujui</Button>
              </div>
            </div>
          </Card>
        ))}
        {!approvalRows.length && <Card className="rounded-2xl"><p className="py-12 text-center text-sm text-muted-foreground">Tidak ada work order yang menunggu persetujuan.</p></Card>}
      </section>}

      {/* Create Work Order */}
      <Modal open={!!form} onClose={closeCreateForm} title="Buat Work Order" footer={<><Button variant="ghost" onClick={closeCreateForm}>Batal</Button><Button onClick={save}>Kirim untuk Persetujuan</Button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Aset" required>
              <Select value={form.asset_id} onChange={(event) => setForm({ ...form, asset_id: event.target.value })}>
                <option value="">Pilih aset</option>
                {assets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Judul" required><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Contoh: Ganti bearing motor pompa" /></Field>
            <Field label="Deskripsi" required><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} /></Field>
            <Field label="Checklist pekerjaan (opsional)">
              <div className="space-y-2">
                {(form.checklist?.length ? form.checklist : [""]).map((item, index) => <div key={index} className="flex gap-2"><Input value={item} onChange={(event) => setForm({ ...form, checklist: (form.checklist?.length ? form.checklist : [""]).map((value, i) => i === index ? event.target.value : value) })} placeholder={`Langkah ${index + 1}`} /><Button variant="ghost" onClick={() => setForm({ ...form, checklist: (form.checklist || []).filter((_, i) => i !== index) })}>Hapus</Button></div>)}
                <Button variant="ghost" onClick={() => setForm({ ...form, checklist: [...(form.checklist || []), ""] })}>+ Tambah langkah</Button>
              </div>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Prioritas">
                <Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  {PRIORITIES.map((item) => <option key={item} value={item}>{PRIORITY_LABEL[item]}</option>)}
                </Select>
              </Field>
              <Field label="Batas waktu"><Input type="datetime-local" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} /></Field>
            </div>
          </div>
        )}
      </Modal>

      {/* Work Order detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.work_order_number || "Detail Work Order"} wide>
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-2xl border border-border/70 bg-gradient-to-br from-muted/30 to-background p-4 sm:grid-cols-2">
              <div className="flex items-start gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground ring-1 ring-border/60"><MapPin className="h-4 w-4" /></span>
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Site</p><p className="text-sm font-medium text-foreground">{siteName(detail.site_id)}</p></div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground ring-1 ring-border/60"><Wrench className="h-4 w-4" /></span>
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Aset</p><p className="text-sm font-medium text-foreground">{assetName(detail.asset_id)}</p></div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground ring-1 ring-border/60"><Users className="h-4 w-4" /></span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ditugaskan ke</p>
                  {detail.current_assignee_id ? (
                    <div className="mt-0.5 flex items-center gap-2"><Avatar name={assignedName(detail.current_assignee_id)} size="h-6 w-6" /><span className="text-sm font-medium text-foreground">{assignedName(detail.current_assignee_id) || "—"}</span></div>
                  ) : <p className="text-sm font-medium text-muted-foreground/70">Belum ditugaskan</p>}
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-border/60 ${detail.due_at && new Date(detail.due_at).getTime() < Date.now() && ACTIVE.includes(detail.status) ? "bg-destructive/10 text-destructive ring-destructive/20" : "bg-background text-muted-foreground"}`}><Clock className="h-4 w-4" /></span>
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Batas waktu</p><p className="text-sm font-medium text-foreground">{detail.due_at ? new Date(detail.due_at).toLocaleDateString("en-CA") : "—"}</p></div>
              </div>
            </div>

            {isLeadership && ["OPEN", "ASSIGNED"].includes(detail.status) && (
              <div className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-4 shadow-sm">
                <SectionHeading icon={UserPlus} title="Tugaskan Teknisi" subtitle="Pilih berdasarkan keahlian, ketersediaan, dan jumlah Work Order aktif." />
                {detail.current_assignee_id && !assignmentEditing ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3"><Avatar name={assignedName(detail.current_assignee_id)} size="h-10 w-10" /><div><p className="text-sm font-semibold text-foreground">{assignedName(detail.current_assignee_id) || "Teknisi terpilih"}</p><p className="text-xs text-muted-foreground">{detail.acknowledged_at ? "Assignment sudah diterima" : "Menunggu konfirmasi teknisi"}</p></div></div>
                    <Button className="inline-flex w-full items-center justify-center gap-1.5 !rounded-lg !border !border-slate-200 !bg-white !px-3.5 !py-2 !text-xs !font-semibold !text-slate-700 !shadow-none hover:!bg-slate-50 sm:w-auto" onClick={() => setAssignmentEditing(true)}><RefreshCw className="h-4 w-4" /> Ganti Teknisi</Button>
                  </div>
                ) : <>
                  <Field label="Pilih teknisi"><Select value={assignment} onChange={(event) => setAssignment(event.target.value)} disabled={!technicians.length}><option value="">{technicians.length ? "Pilih teknisi" : "Belum ada teknisi aktif"}</option>{(recommendations.length ? recommendations : technicians.map((item) => ({ technician_id: item.id, full_name: item.full_name, availability: "UNKNOWN", active_work_orders: 0, specialty_match: false }))).map((item) => <option key={item.technician_id} value={item.technician_id}>{item.full_name} — {item.specialty_match ? "specialty cocok" : "umum"} · {item.availability === "AVAILABLE" ? "tersedia" : item.availability === "BUSY" ? "sibuk" : "status belum dihitung"} · {item.active_work_orders} WO aktif</option>)}</Select></Field>
                  {recommendations.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">Rekomendasi mempertimbangkan specialty tim, site aset, dan jumlah WO aktif.</p>}
                  <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => assignment ? act("assign", { assignee_id: assignment }) : toast.error("Pilih teknisi terlebih dahulu.")}><UserPlus className="h-4 w-4" /> Tugaskan Teknisi</Button>{detail.current_assignee_id && <Button variant="ghost" onClick={() => setAssignmentEditing(false)}>Kembali</Button>}</div>
                  {!technicians.length && <p className="mt-3 text-xs text-muted-foreground">Tambahkan user dengan role <b>Technician</b> dan site yang sama dengan aset ini. <Link to="/users" className="font-semibold text-primary hover:underline" onClick={() => setDetail(null)}>Buka Users</Link></p>}
                </>}
              </div>
            )}

            <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
              <SectionHeading icon={Check} title="Aksi Work Order" subtitle="Aksi ditampilkan sesuai role dan status saat ini." />
              <div className="flex flex-wrap gap-2">
                {isLeadership && detail.status === "PENDING_APPROVAL" && <><Button onClick={() => act("approve", { note: note || null })}><Check className="h-4 w-4" /> Approve Work Order</Button><Button variant="danger" onClick={() => askAndAct("reject", "reason", "Alasan penolakan work order")}>Reject Work Order</Button></>}
                {detail.status === "ASSIGNED" && detail.current_assignee_id === user?.tenantUserId && !detail.acknowledged_at && <Button onClick={() => act("acknowledge")}><UserCheck className="h-4 w-4" /> Konfirmasi terima</Button>}
                {detail.status === "ASSIGNED" && detail.current_assignee_id === user?.tenantUserId && <Button disabled={!detail.acknowledged_at} onClick={() => act("start")}><Play className="h-4 w-4" /> Mulai Pekerjaan</Button>}
                {detail.status === "ASSIGNED" && detail.current_assignee_id === user?.tenantUserId && !detail.acknowledged_at && <p className="basis-full text-xs text-muted-foreground">Mulai aktif setelah Anda menerima penugasan.</p>}
                {detail.status === "IN_PROGRESS" && detail.current_assignee_id === user?.tenantUserId && <><Button onClick={() => act("timer/start")}><Play className="h-4 w-4" /> Mulai timer</Button><Button variant="ghost" onClick={() => act("timer/stop")}>Stop timer</Button><Button variant="ghost" onClick={() => askAndAct("hold", "reason", "Alasan menunda pekerjaan")}><Pause className="h-4 w-4" /> Pause Pekerjaan</Button><Button onClick={() => askAndAct("complete", "completion_note", "Catatan final pekerjaan")}><Check className="h-4 w-4" /> Selesaikan & Submit</Button></>}
                {detail.status === "IN_PROGRESS" && isLeadership && detail.current_assignee_id !== user?.tenantUserId && <p className="text-xs text-muted-foreground">Pantau progres dan gunakan Komentar untuk memberi arahan kepada teknisi.</p>}
                {detail.status === "ON_HOLD" && detail.current_assignee_id === user?.tenantUserId && <Button onClick={() => act("resume", { note: note || null })}><Play className="h-4 w-4" /> Lanjutkan Pekerjaan</Button>}
                {detail.status === "COMPLETED" && (isLeadership || detail.requester_id === user?.tenantUserId) && <><Button onClick={() => act("verify")}><Check className="h-4 w-4" /> Approve Completion & Tutup</Button><Button variant="danger" onClick={() => askAndAct("reject-completion", "reason", "Alasan meminta revisi pekerjaan")}>Minta Revisi</Button></>}
                {isLeadership && ACTIVE.includes(detail.status) && <Button variant="danger" onClick={() => askAndAct("cancel", "reason", "Alasan membatalkan Work Order")}>Batalkan Work Order</Button>}
                {!(isLeadership && detail.status === "PENDING_APPROVAL")
                  && !["ASSIGNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"].includes(detail.status)
                  && !(isLeadership && ACTIVE.includes(detail.status))
                  && <p className="text-xs text-muted-foreground/70">Tidak ada aksi tersedia untuk status ini.</p>}
              </div>
              <div className="mt-4 border-t border-border/60 pt-4"><Field label="Catatan untuk Aksi"><p className="mb-2 text-[11px] font-normal text-muted-foreground">Tambahkan catatan jika ada informasi penting mengenai aksi ini.</p><Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Tambahkan catatan terkait pekerjaan atau perubahan status..." /></Field></div>
            </div>

            <div>
              <SectionHeading
                icon={MessageSquare}
                title="Aktivitas & Komentar"
                subtitle="Jejak komunikasi dan perubahan pekerjaan."
                trailing={<Pill tone="muted">{(detail.comments || []).length} komentar</Pill>}
              />
              <div className="space-y-2">
                {(detail.comments || []).length === 0 && (
                  <p className="rounded-xl bg-muted/20 p-3 text-xs text-muted-foreground/70">Belum ada komentar.</p>
                )}
                {(detail.comments || []).map((item) => (
                  <div key={item.id} className="flex gap-2.5 rounded-2xl border border-border/50 bg-muted/25 p-3 transition-colors hover:bg-muted/45">
                    <Avatar name={item.author_name} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">{item.author_name} <span className="font-normal text-muted-foreground">· {item.author_role || "Pengguna"} · {item.created_at ? new Date(item.created_at).toLocaleString("id-ID") : ""}</span></p>
                      <p className="mt-0.5 text-sm text-foreground">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tambahkan komentar atau arahan pekerjaan..." aria-label="Komentar Work Order" />
                <Button onClick={async () => { if (!comment.trim()) return; await addComment("WORK_ORDER", detail.id, comment.trim()); const response = await getWorkOrder(detail.id); setDetail(response.data); setComment(""); }}><Send className="h-4 w-4" /> Kirim</Button>
              </div>
            </div>

            <div>
              <SectionHeading icon={History} title="Riwayat Status" />
              {(detail.status_history || []).length === 0 ? (
                <p className="text-xs text-muted-foreground/70">Belum ada riwayat perubahan status.</p>
              ) : (
                <div className="space-y-0 rounded-2xl border border-border/60 bg-muted/10 p-4">
                  {(detail.status_history || []).map((item, index, arr) => (
                    <div key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {index < arr.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-border" />}
                      <span className={`relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-background ${tone(item.to_status) === "success" ? "bg-[hsl(var(--success))]" : tone(item.to_status) === "danger" ? "bg-destructive" : tone(item.to_status) === "warning" ? "bg-[hsl(var(--warning))]" : "bg-primary"}`} />
                      <div className="flex-1 text-sm">
                        <p className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                          {item.from_status ? (item.from_status.replaceAll("_", " ")) : "Dibuat"}
                          {item.from_status && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span>{(item.to_status || "").replaceAll("_", " ")}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{item.occurred_at}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Reveal>
  );
}
