import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, Plus, Search, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../store/store";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Field, Input, Modal, Pill, Reveal, Select, Table, Textarea } from "../components/kit";
import { listAssets } from "../lib/assets";
import { listSites, listUsers } from "../lib/organization";
import { approveRequest, createRequest, getRequest, listRequests, rejectRequest } from "../lib/requests";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const TABS = ["ALL", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "CONVERTED", "IN_PROGRESS", "COMPLETED", "REJECTED"];
const pretty = (value) => String(value || "-").split("_").map((part) => part[0] + part.slice(1).toLowerCase()).join(" ");
const statusTone = (status) => ({ SUBMITTED: "primary", PENDING_APPROVAL: "warning", APPROVED: "success", CONVERTED: "accent", IN_PROGRESS: "accent", COMPLETED: "success", REJECTED: "danger", CANCELLED: "muted" }[status] || "muted");
const priorityTone = (priority) => ({ CRITICAL: "danger", HIGH: "warning", MEDIUM: "accent", LOW: "muted" }[priority] || "muted");
const formatDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "-";

function RequestStat({ label, value, tone = "text-foreground" }) {
  return <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 font-display text-xl font-extrabold ${tone}`}>{value}</p></div>;
}

function StatusBadge({ value }) {
  return <Pill tone={statusTone(value)}><i className="h-1.5 w-1.5 rounded-full bg-current" />{pretty(value)}</Pill>;
}

function PriorityBadge({ value }) {
  return <Pill tone={priorityTone(value)}>{pretty(value)}</Pill>;
}

export default function Requests() {
  const { user } = useApp();
  const role = user?._backend?.membership?.roleKey || "";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [assets, setAssets] = useState([]);
  const [sites, setSites] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestResult, assetResult, siteResult, userResult] = await Promise.all([listRequests(), listAssets(), listSites(), listUsers()]);
      setRequests(requestResult?.data || []);
      setAssets(assetResult?.data || []);
      setSites(siteResult?.data || []);
      setUsers(userResult?.data || []);
    } catch (error) {
      toast.error(error.message || "Unable to load maintenance requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const assetId = searchParams.get("asset_id");
    if (!assetId || !assets.length || form || !assets.some((asset) => asset.id === assetId)) return;
    setForm({ asset_id: assetId, title: "", priority: "MEDIUM", location: "", description: "" });
    navigate("/requests", { replace: true });
  }, [assets, form, navigate, searchParams]);

  const openNewRequest = (assetId = assets[0]?.id || "") => setForm({ asset_id: assetId, title: "", priority: "MEDIUM", location: "", description: "" });
  const openDetail = async (item) => {
    try { setDetail((await getRequest(item.id)).data); } catch (error) { toast.error(error.message || "Unable to load request detail."); }
  };
  const submit = async () => {
    if (!form.asset_id || !form.title.trim() || !form.description.trim()) return toast.error("Category, title, and description are required.");
    setSaving(true);
    try {
      await createRequest({ asset_id: form.asset_id, title: form.title.trim(), description: `${form.location ? `Location: ${form.location}\n\n` : ""}${form.description.trim()}`, priority: form.priority });
      toast.success("Maintenance request submitted."); setForm(null); load();
    } catch (error) { toast.error(error.message || "Request could not be submitted."); } finally { setSaving(false); }
  };
  const action = async (name) => {
    const reason = name === "reject" ? window.prompt("Reason for rejection") : null;
    if (name === "reject" && !reason) return;
    try {
      if (name === "approve") await approveRequest(detail.id, {}); else await rejectRequest(detail.id, reason);
      toast.success("Request updated."); setDetail(null); load();
    } catch (error) { toast.error(error.message || "Action failed."); }
  };

  const rows = useMemo(() => requests.filter((request) => (filter === "ALL" || request.status === filter) && `${request.request_number} ${request.title}`.toLowerCase().includes(query.toLowerCase())), [requests, filter, query]);
  const pendingCount = requests.filter((request) => ["SUBMITTED", "PENDING_APPROVAL", "UNDER_REVIEW"].includes(request.status)).length;
  const newCount = requests.filter((request) => request.status === "SUBMITTED").length;
  const approvedCount = requests.filter((request) => ["APPROVED", "CONVERTED"].includes(request.status)).length;
  const completedCount = requests.filter((request) => request.status === "COMPLETED").length;

  const columns = [
    { key: "request_number", header: "Request ID", render: (request) => <span className="font-mono text-[11px] text-muted-foreground">{request.request_number}</span> },
    { key: "title", header: "Request", render: (request) => <div><p className="font-semibold text-foreground">{request.title}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{request.description?.slice(0, 54) || "No description"}</p></div> },
    { key: "status", header: "Status", render: (request) => <StatusBadge value={request.status} /> },
    { key: "priority", header: "Priority", render: (request) => <PriorityBadge value={request.priority} /> },
    { key: "site", header: "Site", render: (request) => request.asset?.site?.name || request.site?.name || sites.find((site) => site.id === assets.find((asset) => asset.id === request.asset_id)?.site_id)?.name || "-" },
    { key: "requester", header: "Submitted by", render: (request) => request.requester?.full_name || request.submitted_by?.full_name || users.find((person) => person.id === request.requester_id || person.id === request.created_by)?.full_name || "-" },
    { key: "reported_at", header: "Date", render: (request) => formatDate(request.reported_at || request.created_at) },
    { key: "action", header: "", render: (request) => <button onClick={(event) => { event.stopPropagation(); openDetail(request); }} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Eye className="h-3.5 w-3.5" /> Detail</button> },
  ];

  return <Reveal className="mx-auto max-w-[1240px] space-y-5">
    <section className="flex flex-col justify-between gap-4 border-b border-[#E2E8F0] pb-5 sm:flex-row sm:items-end"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Manager workspace</p><h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-slate-900">Maintenance Requests</h1><p className="mt-1 text-sm text-slate-500">Review, approve, and track maintenance requests from one workspace.</p></div><div className="flex gap-2"><Button variant="outline" className="px-3 py-2 text-xs" onClick={() => navigate("/scan?return=/requests")} disabled={!assets.length}><ScanLine className="h-3.5 w-3.5" /> Scan asset</Button><Button className="px-3 py-2 text-xs" onClick={() => openNewRequest()} disabled={!assets.length}><Plus className="h-3.5 w-3.5" /> New request</Button></div></section>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><RequestStat label="New requests" value={newCount} tone="text-primary" /><RequestStat label="Pending approval" value={pendingCount} tone="text-amber-600" /><RequestStat label="Approved / converted" value={approvedCount} tone="text-violet-600" /><RequestStat label="Completed" value={completedCount} tone="text-emerald-600" /></div>
    <Card className="overflow-hidden p-0"><div className="flex flex-col gap-4 border-b border-[#E2E8F0] px-5 py-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-display text-base font-bold">All maintenance requests</h2><p className="mt-1 text-xs text-muted-foreground">{rows.length} request{rows.length === 1 ? "" : "s"} found</p></div><div className="relative w-full lg:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requests..." className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></div></div><div className="flex gap-1.5 overflow-x-auto border-b border-[#E2E8F0] px-5 py-3">{TABS.map((tab) => <button key={tab} onClick={() => setFilter(tab)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold transition ${filter === tab ? "bg-primary text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{tab === "ALL" ? "All" : pretty(tab)}</button>)}</div><div className="overflow-x-auto"><Table columns={columns} rows={rows} onRowClick={openDetail} empty={loading ? "Loading requests..." : "No maintenance requests found."} /></div></Card>
    <Modal open={!!form} onClose={() => setForm(null)} title="New maintenance request" footer={<><Button variant="ghost" className="px-3 py-2 text-xs" onClick={() => setForm(null)}>Cancel</Button><Button className="px-3 py-2 text-xs" onClick={submit} disabled={saving}>{saving ? "Submitting..." : "Submit request"}</Button></>}>{form && <div className="space-y-4"><div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">Submitting as <b>{user?.name}</b></div><Field label="Title"><Input placeholder="Brief description of the issue" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field><Field label="Asset"><Select value={form.asset_id} onChange={(event) => setForm({ ...form, asset_id: event.target.value })}><option value="">Select asset...</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_category?.name || asset.category?.name || asset.name}</option>)}</Select></Field><Field label="Priority"><Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{pretty(priority)}</option>)}</Select></Field><Field label="Location"><Input placeholder="Specific location within the site" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></Field><Field label="Description"><Textarea rows={4} placeholder="Detailed description..." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field></div>}</Modal>
    <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.request_number}: ${detail.title}` : "Maintenance request"} wide footer={<Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>}>{detail && <div className="grid gap-5 lg:grid-cols-[1.45fr_0.8fr]"><div className="space-y-5"><div className="flex flex-wrap gap-2"><StatusBadge value={detail.status} /><PriorityBadge value={detail.priority} /></div><div className="rounded-xl border border-[#E2E8F0] bg-slate-50 p-4"><p className="text-sm leading-6 text-slate-600">{detail.description || "No description provided."}</p></div><div className="rounded-xl border border-[#E2E8F0] p-4"><h3 className="text-sm font-bold">Foto Pendukung</h3><div className="mt-3 flex h-20 items-center justify-center rounded-lg border border-dashed border-[#E2E8F0] text-[11px] text-muted-foreground">{detail.attachments?.length ? `${detail.attachments.length} attachment tersedia` : "Tidak ada foto yang dilampirkan"}</div></div><div className="rounded-xl border border-[#E2E8F0] p-4"><h3 className="text-sm font-bold">Riwayat Permintaan</h3><p className="mt-3 border-l-2 border-primary pl-3 text-xs text-muted-foreground">Permintaan diajukan pada {formatDate(detail.reported_at || detail.created_at)}</p></div></div><div className="space-y-5"><div className="rounded-xl border border-[#E2E8F0] p-4"><h3 className="text-sm font-bold">Info Pemohon</h3><p className="mt-3 text-sm font-semibold">{detail.requester?.full_name || "-"}</p><p className="mt-1 text-xs text-muted-foreground">{detail.requester?.department || "-"}</p><p className="mt-4 text-[10px] uppercase text-muted-foreground">Telepon</p><p className="text-xs">{detail.requester?.phone || "-"}</p></div><div className="rounded-xl border border-[#E2E8F0] p-4"><h3 className="text-sm font-bold">Asset</h3><p className="mt-3 text-[10px] uppercase text-muted-foreground">Nama Asset</p><p className="text-xs font-semibold">{detail.asset?.name || "-"}</p><p className="mt-3 text-[10px] uppercase text-muted-foreground">Lokasi</p><p className="text-xs">{detail.asset?.location?.name || detail.asset?.site?.name || "-"}</p></div>{role === "MANAGER" && detail.status === "PENDING_APPROVAL" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold text-amber-700">Aksi diperlukan</p><p className="mt-1 text-[11px] text-amber-700">Setujui untuk membuat Work Order atau tolak dengan alasan.</p><div className="mt-3 flex gap-2"><Button variant="danger" className="flex-1 text-xs" onClick={() => action("reject")}>Tolak</Button><Button className="flex-1 text-xs" onClick={() => action("approve")}><Check className="h-3.5 w-3.5" /> Setujui</Button></div></div>}</div></div>}</Modal>
  </Reveal>;
}
