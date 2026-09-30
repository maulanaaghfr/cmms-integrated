import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, Bell, BarChart3, Building2, CalendarDays, CheckCircle2, ClipboardCheck, ClipboardList, Database, LayoutDashboard, Package, Plus, RefreshCcw, ShieldAlert, Sparkles, Users, Wrench, Clock3, FileText, Truck, CircleDollarSign, Boxes, MessageSquare, Search, ChevronRight } from "lucide-react";
import { useApp } from "../store/store";
import { getDashboardSummary, listNotifications, listPlatformTenants } from "../lib/dashboard";
import { listRequests } from "../lib/requests";
import { listWorkOrders } from "../lib/workorders";
import { listSpareParts, listWarehouses } from "../lib/inventory";
import { listUsers } from "../lib/organization";
import { listPurchaseOrders } from "../lib/procurement";
import { Card, Pill, Reveal, StatCard, statusTone } from "../components/kit";

const pretty = (v) => String(v || "-").split("_").map((x) => x[0] + x.slice(1).toLowerCase()).join(" ");
const date = (v) => v ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(v)) : "No due date";
const COLORS = ["#2563eb", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981", "#94a3b8"];
const MANAGER_JOURNEY = [
  { step: 1, title: "Login & Dashboard Overview", detail: "Open WO, pending request, team workload, SLA status, dan low stock alerts.", to: "/dashboard", icon: LayoutDashboard },
  { step: 2, title: "Review Maintenance Requests", detail: "Tinjau equipment, issue, priority, foto, lokasi, dan kontak operator.", to: "/requests", icon: ClipboardCheck },
  { step: 3, title: "Approve / Reject Request", detail: "Setujui agar lanjut ke pembuatan WO atau tolak dengan alasan.", to: "/requests", icon: CheckCircle2 },
  { step: 4, title: "Buat & Konfigurasi Work Order", detail: "Atur asset, deskripsi, priority, estimasi waktu/biaya, dan spare part.", to: "/work-orders", icon: ClipboardList },
  { step: 5, title: "Assign Teknisi", detail: "Tugaskan berdasarkan skill, availability, dan workload; single atau bulk.", to: "/work-orders", icon: Users },
  { step: 6, title: "Pantau Progress Real-time", detail: "Pantau status, time spent, parts, foto, reassign, dan komentar.", to: "/work-orders", icon: Wrench },
  { step: 7, title: "Review & Approve Completion", detail: "Periksa foto, notes, dan parts sebelum approve penutupan WO.", to: "/work-orders", icon: CheckCircle2 },
  { step: 8, title: "Kelola Teknisi & Asset", detail: "Pantau availability, skill, performance, schedule, condition, dan health asset.", to: "/technicians", icon: Users },
  { step: 9, title: "Kelola Inventory & Procurement", detail: "Pantau spare part, buat PO saat stok rendah, dan kelola vendor/quotation.", to: "/inventory", icon: Package },
  { step: 10, title: "Analitik & Reporting", detail: "Lihat performa tim, metrik WO, MTTR/MTBF, uptime, spare part, dan laporan.", to: "/analytics", icon: BarChart3 },
];

function LoadingDashboard() { return <div className="space-y-4 animate-pulse"><div className="h-10 rounded-xl bg-muted" /><div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map((x) => <div key={x} className="h-28 rounded-xl bg-muted" />)}</div><div className="h-72 rounded-xl bg-muted" /></div>; }
function ErrorState({ error, retry }) { return <Card className="border-destructive/30"><div className="flex gap-3"><ShieldAlert className="h-5 w-5 text-destructive" /><div><b>Dashboard could not be loaded</b><p className="mt-1 text-sm text-muted-foreground">{error}</p><button className="mt-3 text-sm font-semibold text-primary" onClick={retry}>Try again</button></div></div></Card>; }
function MiniTitle({ children, link, to }) { return <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-sm font-bold">{children}</h2>{link && <Link to={to || "#"} className="text-[11px] font-semibold text-primary">{link}</Link>}</div>; }
function ManagerSectionCard({ title, link, to, children, className = "" }) { return <Card className={`overflow-hidden ${className}`}><div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><h2 className="font-display text-sm font-bold">{title}</h2>{link && <Link to={to} className="text-[11px] font-bold text-primary hover:underline">{link}</Link>}</div>{children}</Card>; }
function PriorityBadge({ value }) { const key = String(value || "").toUpperCase(); const meta = { CRITICAL: ["Kritis", "bg-red-50 text-red-700"], HIGH: ["Tinggi", "bg-orange-50 text-orange-700"], MEDIUM: ["Sedang", "bg-amber-50 text-amber-700"], LOW: ["Rendah", "bg-slate-100 text-slate-600"] }; const [label, classes] = meta[key] || [pretty(value), "bg-slate-100 text-slate-600"]; return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${classes}`}>{label}</span>; }
function StatusBadge({ value }) { const key = String(value || "").toUpperCase(); const meta = { IN_PROGRESS: ["In Progress", "bg-blue-50 text-blue-700"], ASSIGNED: ["Assigned", "bg-violet-50 text-violet-700"], PENDING_APPROVAL: ["Pending Approval", "bg-amber-50 text-amber-700"], COMPLETED: ["Completed", "bg-emerald-50 text-emerald-700"], CLOSED: ["Closed", "bg-emerald-50 text-emerald-700"], ON_HOLD: ["On Hold", "bg-slate-100 text-slate-600"] }; const [label, classes] = meta[key] || [pretty(value), "bg-slate-100 text-slate-600"]; return <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${classes}`}>{label}</span>; }
function ProgressBar({ available, busy, offDuty, total }) { const safeTotal = Math.max(total, 1); return <div className="flex h-2 overflow-hidden rounded-full bg-slate-100"><span className="bg-emerald-500" style={{ width: `${available / safeTotal * 100}%` }} /><span className="bg-amber-400" style={{ width: `${busy / safeTotal * 100}%` }} /><span className="bg-slate-300" style={{ width: `${offDuty / safeTotal * 100}%` }} /></div>; }

function LegacyManagerDashboard() {
  const { user } = useApp();
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    const [dashRes, requestRes, orderRes, partsRes, usersRes, notifRes] = await Promise.allSettled([
      getDashboardSummary(), listRequests(), listWorkOrders(), listSpareParts(), listUsers(), listNotifications(),
    ]);
    if (dashRes.status === "rejected") {
      setError(dashRes.reason?.message || "Dashboard tidak dapat dimuat. Silakan login ulang.");
      setLoading(false);
      return;
    }
    setSummary(dashRes.value?.data || {});
    setRequests(requestRes.status === "fulfilled" ? requestRes.value?.data || [] : []);
    setOrders(orderRes.status === "fulfilled" ? orderRes.value?.data || [] : []);
    setParts(partsRes.status === "fulfilled" ? partsRes.value?.data || [] : []);
    setUsers(usersRes.status === "fulfilled" ? usersRes.value?.data || [] : []);
    setNotifications(notifRes.status === "fulfilled" ? notifRes.value?.data || [] : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  if (loading && !summary) return <LoadingDashboard />;
  if (error && !summary) return <ErrorState error={error} retry={load} />;

  const work = summary?.work_orders || {};
  const pendingRequests = requests.filter((r) => ["SUBMITTED", "PENDING_APPROVAL", "UNDER_REVIEW"].includes(r.status));
  const openOrders = orders.filter((o) => ["OPEN", "ASSIGNED", "PENDING_APPROVAL"].includes(o.status));
  const activeOrders = orders.filter((o) => ["IN_PROGRESS", "ON_HOLD"].includes(o.status));
  const completedOrders = orders.filter((o) => ["COMPLETED", "VERIFIED", "CLOSED"].includes(o.status));
  const overdueOrders = orders.filter((o) => o.due_at && new Date(o.due_at) < new Date() && !["CLOSED", "CANCELLED"].includes(o.status));
  const approachingOrders = orders.filter((o) => {
    if (!o.due_at || ["CLOSED", "CANCELLED"].includes(o.status)) return false;
    const hours = (new Date(o.due_at).getTime() - Date.now()) / 3600000;
    return hours >= 0 && hours <= 24;
  });
  const onTimeOrders = orders.filter((o) => !overdueOrders.includes(o) && !approachingOrders.includes(o));
  const lowStockParts = parts.filter((p) => Number(p.reorder_point ?? p.minimum_stock ?? p.min_stock ?? 0) > 0 && Number(p.current_stock ?? p.stock_quantity ?? p.stock ?? 0) <= Number(p.reorder_point ?? p.minimum_stock ?? p.min_stock ?? 0));
  const technicians = users.filter((u) => ["TECHNICIAN", "technician"].includes(u.role_key || u.role));
  const activeTechnicians = technicians.filter((u) => ["ACTIVE", "active"].includes(u.status));
  const workload = Object.entries(orders.filter((o) => o.current_assignee_id && !["CLOSED", "CANCELLED"].includes(o.status)).reduce((acc, o) => ({ ...acc, [o.current_assignee_id]: (acc[o.current_assignee_id] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const completionRate = orders.length ? Math.round((completedOrders.length / orders.length) * 100) : 0;
  const prettyStatus = (v) => String(v || "-").split("_").map((x) => x[0] + x.slice(1).toLowerCase()).join(" ");

  return <div className="mx-auto max-w-[1200px] space-y-5">
    <section className="flex flex-col justify-between gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Manager Workspace</p><h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight">Selamat datang, {user?.name?.split(" ")[0] || "Manager"}.</h1><p className="mt-1 text-sm text-muted-foreground">Ruang kerja untuk review, assignment, monitoring, dan keputusan maintenance.</p></div>
      <div className="flex flex-wrap gap-2"><Link to="/requests" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90"><ClipboardCheck className="h-3.5 w-3.5" /> Review request</Link><Link to="/work-orders" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted"><ClipboardList className="h-3.5 w-3.5" /> Kelola Work Order</Link><button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted"><RefreshCcw className="h-3.5 w-3.5" /> Refresh</button></div>
    </section>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard icon={ClipboardCheck} label="PENDING REQUESTS" value={pendingRequests.length} tone="warning" hint="Review & approve" /><StatCard icon={ClipboardList} label="OPEN WO" value={openOrders.length} tone="accent" hint={`${activeOrders.length} sedang dikerjakan`} /><StatCard icon={CheckCircle2} label="COMPLETED WO" value={completedOrders.length} tone="success" hint={`${completionRate}% completion rate`} /><StatCard icon={AlertTriangle} label="OVERDUE WO" value={overdueOrders.length} tone={overdueOrders.length ? "warning" : "success"} hint="Perlu tindakan" /></div>

    <section><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Manager Journey · 01</p><h2 className="mt-1 font-display text-lg font-extrabold">Overview operasional</h2></div><Link to="/system-guide" className="text-xs font-bold text-primary hover:underline">Buka System Guide</Link></div><div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]"><Card><MiniTitle link="Buka Requests" to="/requests">02–03 · Review & approve request</MiniTitle><div className="divide-y divide-border/60">{pendingRequests.slice(0, 5).map((r) => <Link key={r.id} to="/requests" className="flex items-center justify-between gap-3 py-3 hover:text-primary"><div className="min-w-0"><p className="truncate text-sm font-semibold">{r.title || r.description || "Maintenance request"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{r.request_number || r.id} · {prettyStatus(r.status)}</p></div><ArrowRight className="h-4 w-4 shrink-0" /></Link>)}{!pendingRequests.length && <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada request yang menunggu review.</p>}</div></Card><Card><MiniTitle>SLA status</MiniTitle><div className="space-y-3"><div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5"><span className="text-sm text-emerald-700">On-time</span><b className="text-emerald-700">{onTimeOrders.length}</b></div><div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2.5"><span className="text-sm text-amber-700">Approaching &lt; 24 jam</span><b className="text-amber-700">{approachingOrders.length}</b></div><div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2.5"><span className="text-sm text-red-700">Breached</span><b className="text-red-700">{overdueOrders.length}</b></div></div></Card></div></section>

    <section><div className="mb-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Manager Journey · 04–07</p><h2 className="mt-1 font-display text-lg font-extrabold">Work Order control</h2><p className="mt-1 text-sm text-muted-foreground">Konfigurasi, assign, pantau progress, dan verifikasi completion.</p></div><div className="grid gap-4 lg:grid-cols-2"><Card><MiniTitle link="Kelola Work Orders" to="/work-orders">Progress & assignment</MiniTitle><div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-blue-50 p-3"><p className="text-[10px] font-bold uppercase text-blue-700">Open</p><p className="mt-1 text-2xl font-extrabold text-blue-700">{openOrders.length}</p></div><div className="rounded-xl bg-blue-50 p-3"><p className="text-[10px] font-bold uppercase text-blue-700">Active</p><p className="mt-1 text-2xl font-extrabold text-blue-700">{activeOrders.length}</p></div><div className="rounded-xl bg-blue-50 p-3"><p className="text-[10px] font-bold uppercase text-blue-700">Done</p><p className="mt-1 text-2xl font-extrabold text-blue-700">{completedOrders.length}</p></div></div><Link to="/work-orders" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-primary">Buka antrean Work Order <ArrowRight className="h-3.5 w-3.5" /></Link></Card><Card><MiniTitle link="Lihat teknisi" to="/technicians">Beban kerja tim</MiniTitle><div className="space-y-3">{workload.map(([id, count]) => <div key={id}><div className="mb-1 flex justify-between text-xs"><span className="truncate text-muted-foreground">Teknisi {id.slice(-8)}</span><b>{count} WO</b></div><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, count * 20)}%` }} /></div></div>)}{!workload.length && <p className="py-5 text-center text-sm text-muted-foreground">Belum ada workload aktif.</p>}</div></Card></div></section>

    <section><div className="mb-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Manager Journey · 08–10</p><h2 className="mt-1 font-display text-lg font-extrabold">People, supply & insights</h2></div><div className="grid gap-4 lg:grid-cols-3"><Card><MiniTitle link="Lihat teknisi" to="/technicians">Technician availability</MiniTitle><p className="font-display text-3xl font-extrabold text-primary">{activeTechnicians.length}<span className="text-lg text-muted-foreground">/{technicians.length}</span></p><p className="mt-1 text-xs text-muted-foreground">Teknisi aktif dan siap ditugaskan</p></Card><Card><MiniTitle link="Lihat inventory" to="/inventory">Inventory & procurement</MiniTitle><p className={`font-display text-3xl font-extrabold ${lowStockParts.length ? "text-amber-600" : "text-primary"}`}>{lowStockParts.length}</p><p className="mt-1 text-xs text-muted-foreground">Spare part di bawah reorder point</p><Link to="/procurement" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-primary">Buka procurement <ArrowRight className="h-3.5 w-3.5" /></Link></Card><Card><MiniTitle link="Buka Analytics" to="/analytics">Analytics & reporting</MiniTitle><div className="grid grid-cols-2 gap-2"><div><p className="text-[10px] uppercase text-muted-foreground">Completion rate</p><p className="mt-1 text-xl font-bold text-primary">{completionRate}%</p></div><div><p className="text-[10px] uppercase text-muted-foreground">Total WO</p><p className="mt-1 text-xl font-bold">{orders.length || work.total || 0}</p></div></div></Card></div></section>

    <section><Card><MiniTitle link="Lihat semua notifikasi" to="/notifications">Notifications panel</MiniTitle><div className="grid gap-3 md:grid-cols-2">{notifications.slice(0, 6).map((n) => <div key={n.id} className="flex gap-2 border-b border-border/50 pb-2 last:border-0"><Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="truncate text-xs font-semibold">{n.title}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message || n.body}</p></div></div>)}{!notifications.length && <p className="py-5 text-sm text-muted-foreground">Belum ada notifikasi baru.</p>}</div></Card></section>
  </div>;
}

function ManagerDashboardLegacyReference() {
  const { user } = useApp();
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError("");
    const [dash, requestRes, orderRes, partsRes, usersRes] = await Promise.allSettled([
      getDashboardSummary(), listRequests(), listWorkOrders(), listSpareParts(), listUsers(),
    ]);
    if (dash.status === "rejected") { setError(dash.reason?.message || "Dashboard tidak dapat dimuat."); setLoading(false); return; }
    setSummary(dash.value?.data || {});
    setRequests(requestRes.status === "fulfilled" ? requestRes.value?.data || [] : []);
    setOrders(orderRes.status === "fulfilled" ? orderRes.value?.data || [] : []);
    setParts(partsRes.status === "fulfilled" ? partsRes.value?.data || [] : []);
    setUsers(usersRes.status === "fulfilled" ? usersRes.value?.data || [] : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  if (loading && !summary) return <LoadingDashboard />;
  if (error && !summary) return <ErrorState error={error} retry={load} />;

  const pendingRequests = requests.filter((r) => ["SUBMITTED", "PENDING_APPROVAL", "UNDER_REVIEW"].includes(r.status));
  const activeOrders = orders.filter((o) => ["OPEN", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"].includes(o.status));
  const completedOrders = orders.filter((o) => ["COMPLETED", "VERIFIED", "CLOSED"].includes(o.status));
  const overdueOrders = orders.filter((o) => o.due_at && new Date(o.due_at) < new Date() && !["CLOSED", "CANCELLED"].includes(o.status));
  const unassignedOrders = orders.filter((o) => ["OPEN", "PENDING_APPROVAL"].includes(o.status) && !o.current_assignee_id);
  const technicians = users.filter((u) => ["TECHNICIAN", "technician"].includes(u.role_key || u.role));
  const availableTechnicians = technicians.filter((u) => ["ACTIVE", "active"].includes(u.status)).length;
  const busyTechnicians = technicians.filter((u) => ["BUSY", "busy"].includes(u.availability || u.status)).length;
  const totalWorkOrders = orders.length || Number(summary?.work_orders?.total || 0);
  const completionRate = totalWorkOrders ? Math.round((completedOrders.length / totalWorkOrders) * 100) : 0;
  const slaRate = totalWorkOrders ? Math.max(0, Math.round(((totalWorkOrders - overdueOrders.length) / totalWorkOrders) * 100)) : 0;
  const lowStockParts = parts.filter((p) => {
    const minimum = Number(p.reorder_point ?? p.minimum_stock ?? p.min_stock ?? 0);
    const current = Number(p.total_quantity ?? p.current_stock ?? p.stock_quantity ?? p.stock ?? 0);
    return minimum > 0 && current <= minimum;
  });
  const monthKeys = Array.from({ length: 6 }, (_, index) => { const d = new Date(); d.setMonth(d.getMonth() - 5 + index); return d; });
  const chartData = monthKeys.map((month) => {
    const sameMonth = (value) => { if (!value) return false; const d = new Date(value); return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear(); };
    return {
      name: month.toLocaleString("id-ID", { month: "short" }),
      total: orders.filter((o) => sameMonth(o.created_at)).length,
      completed: orders.filter((o) => ["COMPLETED", "VERIFIED", "CLOSED"].includes(o.status) && sameMonth(o.completed_at || o.updated_at)).length,
      overdue: orders.filter((o) => sameMonth(o.due_at) && o.due_at && new Date(o.due_at) < new Date() && !["CLOSED", "CANCELLED"].includes(o.status)).length,
    };
  });
  const firstName = user?.name?.split(" ")[0] || "Manager";
  const greeting = new Date().getHours() < 11 ? "Pagi" : new Date().getHours() < 15 ? "Siang" : "Sore";
  const shortStatus = (value) => pretty(value);

  return <div className="mx-auto max-w-[1240px] space-y-6">
    <section className="flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Manager workspace</p><h1 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">Selamat {greeting}, {firstName}.</h1><p className="mt-1 text-sm text-muted-foreground">Ruang kerja untuk review, assignment, monitoring, dan keputusan maintenance.</p></div>
      <div className="flex flex-wrap gap-2"><Link to="/requests" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-bold text-primary-foreground"><ClipboardCheck className="h-4 w-4" /> Permintaan ({pendingRequests.length})</Link><Link to="/work-orders" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs font-bold"><Plus className="h-4 w-4" /> Buat Work Order</Link></div>
    </section>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8"><StatCard icon={ClipboardList} label="TOTAL WORK ORDER" value={totalWorkOrders} hint="bulan ini" /><StatCard icon={Wrench} label="WO AKTIF" value={activeOrders.length} tone="accent" hint="sedang dikerjakan" /><StatCard icon={ClipboardCheck} label="PENDING APPROVAL" value={pendingRequests.length} tone="warning" hint="menunggu review" /><StatCard icon={Bell} label="PERMINTAAN BARU" value={requests.filter((r) => r.status === "SUBMITTED").length} tone="accent" hint="belum diproses" /><StatCard icon={Users} label="WO BELUM DITUGASKAN" value={unassignedOrders.length} tone="warning" hint="perlu teknisi" /><StatCard icon={AlertTriangle} label="WO OVERDUE" value={overdueOrders.length} tone={overdueOrders.length ? "warning" : "success"} hint="melewati SLA" /><StatCard icon={CheckCircle2} label="TEKNISI TERSEDIA" value={availableTechnicians} tone="success" hint={`dari ${technicians.length} total`} /><StatCard icon={BarChart3} label="SLA COMPLIANCE" value={`${slaRate}%`} tone="success" hint="minggu ini" /></div>

    <div className="grid gap-5 xl:grid-cols-[1.55fr_0.75fr]"><Card className="min-h-[360px]"><MiniTitle link="Lihat semua" to="/work-orders">Tren Work Order</MiniTitle><p className="-mt-2 mb-3 text-[11px] text-muted-foreground">6 bulan terakhir</p><ResponsiveContainer width="100%" height={270}><LineChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} /><Tooltip /><Line type="monotone" dataKey="total" name="Total" stroke="#2563eb" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="completed" name="Selesai" stroke="#10b981" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="overdue" name="Overdue" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 3" dot={false} /></LineChart></ResponsiveContainer><div className="flex justify-center gap-5 text-[10px] text-muted-foreground"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />Total</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Selesai</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />Overdue</span></div></Card><div className="space-y-5"><Card><MiniTitle link="Buka Analytics" to="/analytics">SLA Compliance</MiniTitle><p className="font-display text-3xl font-extrabold text-primary">{slaRate}%</p><p className="mt-1 text-xs text-muted-foreground">Kepatuhan SLA work order</p><div className="mt-5 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${slaRate}%` }} /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px]"><div><b className="block text-sm text-emerald-600">{Math.max(0, totalWorkOrders - overdueOrders.length)}</b>On-time</div><div><b className="block text-sm text-amber-600">{activeOrders.filter((o) => o.due_at && (new Date(o.due_at) - new Date()) / 3600000 <= 24).length}</b>&lt; 24 jam</div><div><b className="block text-sm text-red-600">{overdueOrders.length}</b>Breached</div></div></Card><Card><MiniTitle link="Kelola teknisi" to="/technicians">Ketersediaan Teknisi</MiniTitle><div className="space-y-2 text-xs"><div className="flex justify-between"><span className="text-emerald-600">● Tersedia</span><b>{availableTechnicians} orang</b></div><div className="flex justify-between"><span className="text-amber-600">● Sibuk</span><b>{busyTechnicians} orang</b></div><div className="flex justify-between"><span className="text-slate-500">● Off Duty</span><b>{Math.max(0, technicians.length - availableTechnicians - busyTechnicians)} orang</b></div></div><div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted"><div className="bg-emerald-500" style={{ width: `${technicians.length ? availableTechnicians / technicians.length * 100 : 0}%` }} /><div className="bg-amber-400" style={{ width: `${technicians.length ? busyTechnicians / technicians.length * 100 : 0}%` }} /></div></Card></div></div>

    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]"><Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><h2 className="font-display text-base font-extrabold">Work Order Terbaru</h2><Link to="/work-orders" className="text-xs font-bold text-primary">Lihat semua →</Link></div><div className="divide-y divide-border/50">{orders.slice(0, 5).map((wo) => <Link key={wo.id} to="/work-orders" className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-muted/30"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{wo.title || wo.id}</p><Pill className="text-[9px]" tone={statusTone(shortStatus(wo.priority))}>{shortStatus(wo.priority)}</Pill></div><p className="mt-1 truncate text-[11px] text-muted-foreground">{wo.work_order_number || wo.id} · {wo.asset_name || "Asset"}</p></div><Pill className="shrink-0 text-[9px]" tone={statusTone(shortStatus(wo.status))}>{shortStatus(wo.status)}</Pill></Link>)}{!orders.length && <p className="px-5 py-10 text-center text-sm text-muted-foreground">Belum ada work order.</p>}</div></Card><Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><h2 className="font-display text-base font-extrabold">Permintaan Pending</h2><Link to="/requests" className="text-xs font-bold text-primary">Review →</Link></div><div className="divide-y divide-border/50">{pendingRequests.slice(0, 5).map((request) => <Link key={request.id} to="/requests" className="flex gap-3 px-5 py-3.5 hover:bg-muted/30"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{request.title || request.description || "Maintenance request"}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{request.request_number || request.id} · {shortStatus(request.status)}</p></div></Link>)}{!pendingRequests.length && <p className="px-5 py-10 text-center text-sm text-muted-foreground">Tidak ada permintaan pending.</p>}</div></Card></div>
    <Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><div><h2 className="font-display text-base font-extrabold">Stok Rendah / Habis</h2><p className="mt-1 text-xs text-muted-foreground">Spare part yang perlu segera ditindaklanjuti.</p></div><Link to="/inventory" className="text-xs font-bold text-primary">Kelola →</Link></div><div className="grid divide-y divide-border/50 md:grid-cols-2 md:divide-x md:divide-y-0">{lowStockParts.slice(0, 6).map((part) => <div key={part.id} className="flex items-center justify-between px-5 py-3"><div><p className="text-sm font-semibold">{part.name}</p><p className="text-[11px] text-muted-foreground">{part.code || part.id} · minimum {part.reorder_point ?? part.minimum_stock ?? part.min_stock ?? 0} {part.unit || "pcs"}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{part.total_quantity ?? part.current_stock ?? 0} {part.unit || "pcs"}</span></div>)}{!lowStockParts.length && <p className="col-span-2 px-5 py-8 text-center text-sm text-muted-foreground">Semua stok berada di atas minimum.</p>}</div></Card>
  </div>;
}

function ManagerDashboard() {
  const { user } = useApp();
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError("");
    const [dashboard, requestResult, orderResult, partsResult, usersResult] = await Promise.allSettled([
      getDashboardSummary(), listRequests(), listWorkOrders(), listSpareParts(), listUsers(),
    ]);
    if (dashboard.status === "rejected") { setError(dashboard.reason?.message || "Dashboard tidak dapat dimuat."); setLoading(false); return; }
    setSummary(dashboard.value?.data || {});
    setRequests(requestResult.status === "fulfilled" ? requestResult.value?.data || [] : []);
    setOrders(orderResult.status === "fulfilled" ? orderResult.value?.data || [] : []);
    setParts(partsResult.status === "fulfilled" ? partsResult.value?.data || [] : []);
    setUsers(usersResult.status === "fulfilled" ? usersResult.value?.data || [] : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  if (loading && !summary) return <LoadingDashboard />;
  if (error && !summary) return <ErrorState error={error} retry={load} />;

  const now = new Date();
  const pendingRequests = requests.filter((request) => ["SUBMITTED", "PENDING_APPROVAL", "UNDER_REVIEW"].includes(request.status));
  const newRequests = requests.filter((request) => request.status === "SUBMITTED");
  const activeOrders = orders.filter((order) => ["OPEN", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"].includes(order.status));
  const completedOrders = orders.filter((order) => ["COMPLETED", "VERIFIED", "CLOSED"].includes(order.status));
  const overdueOrders = orders.filter((order) => order.due_at && new Date(order.due_at) < now && !["CLOSED", "CANCELLED"].includes(order.status));
  const unassignedOrders = orders.filter((order) => ["OPEN", "PENDING_APPROVAL"].includes(order.status) && !order.current_assignee_id);
  const technicians = users.filter((person) => ["TECHNICIAN", "technician"].includes(person.role_key || person.role));
  const activeTechnicians = technicians.filter((person) => ["ACTIVE", "active"].includes(person.status));
  const busyTechnicianIds = new Set(activeOrders.map((order) => order.current_assignee_id).filter(Boolean));
  const busyTechnicians = activeTechnicians.filter((person) => busyTechnicianIds.has(person.id)).length;
  const availableTechnicians = Math.max(0, activeTechnicians.length - busyTechnicians);
  const offDutyTechnicians = Math.max(0, technicians.length - activeTechnicians.length);
  const monthOrders = orders.filter((order) => { const created = new Date(order.created_at); return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear(); });
  const totalWorkOrders = monthOrders.length || Number(summary?.work_orders?.total_this_month || 0);
  const completionRate = orders.length ? Math.round((completedOrders.length / orders.length) * 100) : 0;
  const slaRate = orders.length ? Math.max(0, Math.round(((orders.length - overdueOrders.length) / orders.length) * 100)) : 0;
  const lowStockParts = parts.filter((part) => { const minimum = Number(part.reorder_point ?? part.minimum_stock ?? part.min_stock ?? 0); const current = Number(part.total_quantity ?? part.current_stock ?? part.stock_quantity ?? part.stock ?? 0); return minimum > 0 && current <= minimum; });
  const monthKeys = Array.from({ length: 6 }, (_, index) => { const month = new Date(); month.setMonth(month.getMonth() - 5 + index); return month; });
  const trend = monthKeys.map((month) => { const sameMonth = (value) => { if (!value) return false; const dateValue = new Date(value); return dateValue.getMonth() === month.getMonth() && dateValue.getFullYear() === month.getFullYear(); }; return { name: month.toLocaleString("id-ID", { month: "short" }), total: orders.filter((order) => sameMonth(order.created_at)).length, completed: orders.filter((order) => ["COMPLETED", "VERIFIED", "CLOSED"].includes(order.status) && sameMonth(order.completed_at || order.updated_at)).length, overdue: orders.filter((order) => sameMonth(order.due_at) && new Date(order.due_at) < now && !["CLOSED", "CANCELLED"].includes(order.status)).length }; });
  // TODO: butuh data dari backend — dashboard summary belum menyediakan tren SLA 7 hari.
  const slaTrend = summary?.sla_trend_7d || summary?.sla_compliance_7d || [];
  const firstName = user?.name?.split(" ")[0] || "Manager";
  const greeting = now.getHours() < 11 ? "Pagi" : now.getHours() < 15 ? "Siang" : now.getHours() < 18 ? "Sore" : "Malam";
  const formatDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(new Date(value)) : "—";
  const urgencyDot = (priority) => String(priority || "").toUpperCase() === "CRITICAL" ? "bg-red-500" : String(priority || "").toUpperCase() === "HIGH" ? "bg-orange-500" : "bg-amber-400";

  return <div className="mx-auto max-w-[1240px] space-y-6">
    <section className="flex flex-col gap-5 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="font-display text-sm font-extrabold">Dashboard</h2><p className="mt-1 text-[11px] text-muted-foreground">{new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}</p><h1 className="mt-6 font-display text-2xl font-extrabold sm:text-3xl">Selamat {greeting}, {firstName}</h1><p className="mt-1 text-sm text-muted-foreground">{new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(now)} · Ada {newRequests.length} permintaan baru dan {pendingRequests.length} WO menunggu approval.</p></div><div className="flex flex-wrap gap-2"><Link to="/requests" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs font-bold">Permintaan ({pendingRequests.length})</Link><Link to="/work-orders" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-bold text-primary-foreground"><Plus className="h-4 w-4" /> Buat Work Order</Link></div></section>

    <div className="overflow-x-auto pb-1"><div className="grid min-w-[1080px] grid-cols-8 gap-3"><StatCard icon={ClipboardList} label="TOTAL WORK ORDER" value={totalWorkOrders} hint="bulan ini" /><StatCard icon={Wrench} label="WO AKTIF" value={activeOrders.length} tone="accent" hint="sedang dikerjakan" /><StatCard icon={ClipboardCheck} label="PENDING APPROVAL" value={pendingRequests.length} tone="warning" hint="menunggu review" /><StatCard icon={Bell} label="PERMINTAAN BARU" value={newRequests.length} tone="accent" hint="belum diproses" /><StatCard icon={Users} label="WO BELUM DITUGASKAN" value={unassignedOrders.length} tone="warning" hint="perlu teknisi" /><StatCard icon={AlertTriangle} label="WO OVERDUE" value={overdueOrders.length} tone={overdueOrders.length ? "warning" : "success"} hint="melewati SLA" /><StatCard icon={CheckCircle2} label="TEKNISI TERSEDIA" value={availableTechnicians} tone="success" hint={`dari ${technicians.length} total`} /><StatCard icon={BarChart3} label="SLA COMPLIANCE" value={`${slaRate}%`} tone="success" hint="minggu ini" /></div></div>

    <div className="grid gap-5 xl:grid-cols-[1.55fr_0.75fr]"><ManagerSectionCard title="Tren Work Order" link="Lihat Semua →" to="/work-orders" className="min-h-[360px]"><div className="px-5 pt-3"><div className="mb-2 flex justify-end gap-4 text-[10px] text-muted-foreground"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />Total</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Selesai</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />Overdue</span></div><ResponsiveContainer width="100%" height={270}><LineChart data={trend} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} /><Tooltip /><Line type="monotone" dataKey="total" name="Total" stroke="#2563eb" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="completed" name="Selesai" stroke="#10b981" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="overdue" name="Overdue" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 3" dot={false} /></LineChart></ResponsiveContainer></div></ManagerSectionCard><div className="space-y-5"><ManagerSectionCard title="SLA Compliance" link="Analytics →" to="/analytics"><div className="px-5 pb-5 pt-3">{slaTrend.length > 1 ? <ResponsiveContainer width="100%" height={110}><LineChart data={slaTrend}><XAxis dataKey="label" hide /><YAxis hide domain={[0, 100]} /><Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer> : <div className="flex h-[110px] items-center justify-center rounded-lg bg-slate-50 text-center text-[11px] text-muted-foreground">Tren 7 hari belum tersedia</div>}<div className="mt-2 flex items-end justify-between"><div><p className="font-display text-2xl font-extrabold text-primary">{slaRate}%</p><p className="text-[10px] text-muted-foreground">Kepatuhan minggu ini</p></div><span className="text-[10px] text-muted-foreground">On-time {Math.max(0, orders.length - overdueOrders.length)}</span></div></div></ManagerSectionCard><ManagerSectionCard title="Ketersediaan Teknisi" link="Kelola Teknisi →" to="/technicians"><div className="space-y-2 px-5 pb-5 pt-3 text-xs"><div className="flex justify-between"><span className="text-emerald-600">● Tersedia</span><b>{availableTechnicians} orang</b></div><div className="flex justify-between"><span className="text-amber-600">● Sibuk</span><b>{busyTechnicians} orang</b></div><div className="flex justify-between"><span className="text-slate-500">● Off Duty</span><b>{offDutyTechnicians} orang</b></div><ProgressBar available={availableTechnicians} busy={busyTechnicians} offDuty={offDutyTechnicians} total={technicians.length} /></div></ManagerSectionCard></div></div>

    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]"><ManagerSectionCard title="Work Order Terbaru" link="Lihat Semua →" to="/work-orders"><div className="divide-y divide-border/50">{orders.slice(0, 5).map((order) => <Link key={order.id} to="/work-orders" className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/30"><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-[10px] text-muted-foreground">{order.work_order_number || order.id}</span><PriorityBadge value={order.priority} /></div><p className="mt-1 truncate text-sm font-bold">{order.title || "Work order"}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{order.asset_name || "Asset"} · {order.assignee_name || order.assignee?.full_name || "Belum ditugaskan"}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><StatusBadge value={order.status} /><span className="text-[10px] text-muted-foreground">Due: {formatDate(order.due_at)}</span></div></Link>)}{!orders.length && <p className="px-5 py-10 text-center text-sm text-muted-foreground">Belum ada work order.</p>}</div></ManagerSectionCard><div className="space-y-5"><ManagerSectionCard title="Permintaan Pending" link="Review →" to="/requests"><div className="divide-y divide-border/50">{pendingRequests.slice(0, 4).map((request) => <Link key={request.id} to="/requests" className="flex gap-3 px-5 py-3.5 hover:bg-muted/30"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${urgencyDot(request.priority)}`} /><div className="min-w-0"><p className="truncate text-sm font-bold">{request.title || request.description || "Maintenance request"}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{request.requester?.full_name || request.requester_name || "Pemohon"} · {formatDate(request.reported_at || request.created_at)}</p></div></Link>)}{!pendingRequests.length && <p className="px-5 py-8 text-center text-sm text-muted-foreground">Tidak ada permintaan pending.</p>}</div></ManagerSectionCard><ManagerSectionCard title="Stok Rendah / Habis" link="Kelola →" to="/inventory"><div className="divide-y divide-border/50">{lowStockParts.slice(0, 4).map((part) => <div key={part.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{part.name}</p><p className="text-[10px] text-muted-foreground">{part.code || part.id}</p></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">{part.total_quantity ?? part.current_stock ?? 0} {part.unit || "pcs"}</span></div>)}{!lowStockParts.length && <p className="px-5 py-8 text-center text-sm text-muted-foreground">Semua stok aman.</p>}</div></ManagerSectionCard></div></div>
  </div>;
}

function WarehouseDashboard() {
  const [parts, setParts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([listSpareParts({ per_page: 200 }), listWarehouses()])
      .then(([partsRes, warehousesRes]) => { setParts(partsRes.data || []); setWarehouses(warehousesRes.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  const lowStock = parts.filter((part) => Number(part.total_quantity || 0) <= Number(part.min_stock || 0));
  if (loading) return <LoadingDashboard />;
  return <div className="mx-auto max-w-[1240px] space-y-5">
    <div><p className="text-sm text-muted-foreground">Warehouse workspace</p><h1 className="font-display text-2xl font-extrabold">Inventory overview</h1><p className="mt-1 text-sm text-muted-foreground">Pantau stok, gudang, dan kebutuhan replenishment dari data tenant.</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard icon={Package} label="SPARE PART" value={parts.length} /><StatCard icon={Boxes} label="WAREHOUSE" value={warehouses.length} tone="accent" /><StatCard icon={AlertTriangle} label="LOW STOCK" value={lowStock.length} tone={lowStock.length ? "warning" : "success"} /><StatCard icon={CheckCircle2} label="STOCK STATUS" value={lowStock.length ? "Perlu aksi" : "Aman"} tone={lowStock.length ? "warning" : "success"} /></div>
    <div className="grid gap-5 lg:grid-cols-[1.35fr_0.8fr]"><Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><div><h2 className="font-display text-base font-extrabold">Stok rendah / habis</h2><p className="mt-1 text-xs text-muted-foreground">Prioritas pengadaan berdasarkan minimum stock.</p></div><Link to="/inventory" className="text-xs font-bold text-primary">Kelola →</Link></div><div className="divide-y divide-border/50">{lowStock.slice(0, 8).map((part) => <div key={part.id} className="flex items-center justify-between px-5 py-3"><div><p className="text-sm font-semibold">{part.name}</p><p className="text-xs text-muted-foreground">{part.code} · minimum {part.min_stock || 0} {part.unit || "pcs"}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{part.total_quantity || 0} {part.unit || "pcs"}</span></div>)}{!lowStock.length && <p className="px-5 py-10 text-center text-sm text-muted-foreground">Semua stok berada di atas minimum.</p>}</div></Card><Card><MiniTitle link="Buka inventory" to="/inventory">Warehouse</MiniTitle><div className="space-y-3">{warehouses.map((warehouse) => <div key={warehouse.id} className="rounded-xl border border-border/60 p-3"><p className="text-sm font-bold">{warehouse.name}</p><p className="mt-1 text-xs text-muted-foreground">{warehouse.code} · {warehouse.is_active ? "Aktif" : "Nonaktif"}</p></div>)}{!warehouses.length && <p className="py-6 text-center text-sm text-muted-foreground">Belum ada warehouse.</p>}</div></Card></div>
  </div>;
}

function CompanyAdminDashboard() {
  const { user } = useApp();
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [parts, setParts] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      const [dashboard, orderResult, requestResult, partResult, userResult] = await Promise.all([getDashboardSummary(), listWorkOrders({ per_page: 200 }), listRequests({ per_page: 200 }), listSpareParts({ per_page: 200 }), listUsers({ per_page: 200 })]);
      setSummary(dashboard.data || {}); setOrders(orderResult.data || []); setRequests(requestResult.data || []); setParts(partResult.data || []); setUsers(userResult.data || []);
    } catch (loadError) { setError(loadError.message || "Data company dashboard tidak dapat dimuat."); }
  };
  useEffect(() => { load(); }, []);
  if (!summary && !error) return <LoadingDashboard />;
  if (error) return <ErrorState error={error} retry={load} />;
  const assets = summary.assets || { total: 0, by_status: {} };
  const active = orders.filter((order) => ["OPEN", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"].includes(order.status));
  const pending = requests.filter((request) => ["SUBMITTED", "PENDING_APPROVAL", "UNDER_REVIEW"].includes(request.status));
  const completed = orders.filter((order) => ["COMPLETED", "VERIFIED", "CLOSED"].includes(order.status));
  const overdue = orders.filter((order) => order.due_at && new Date(order.due_at) < new Date() && !["CLOSED", "CANCELLED"].includes(order.status));
  const lowStock = parts.filter((part) => Number(part.total_quantity ?? part.current_stock ?? 0) <= Number(part.min_stock ?? part.reorder_point ?? 0) && Number(part.min_stock ?? part.reorder_point ?? 0) > 0);
  const firstName = user?.name?.split(" ")[0] || "Admin";
  return <div className="mx-auto max-w-[1240px] space-y-6">
    <section className="flex flex-col justify-between gap-5 border-b border-[#E2E8F0] pb-5 lg:flex-row lg:items-end"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Company administration</p><h1 className="mt-2 font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">Selamat datang, {firstName}</h1><p className="mt-1 text-sm text-slate-500">Kelola perusahaan, pengguna, aset, operasi maintenance, dan biaya dalam satu workspace.</p></div><div className="flex flex-wrap gap-2"><Link to="/users" className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-xs font-bold">Kelola Pengguna</Link><Link to="/work-orders" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4" /> Buat Work Order</Link></div></section>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard icon={Building2} label="TOTAL ASSETS" value={assets.total || 0} hint="terdaftar di perusahaan" /><StatCard icon={Users} label="TOTAL USERS" value={users.length} tone="accent" hint="semua role" /><StatCard icon={Wrench} label="ACTIVE WORK ORDERS" value={active.length} tone="accent" hint="sedang berjalan" /><StatCard icon={ClipboardCheck} label="PENDING REQUESTS" value={pending.length} tone="warning" hint="butuh review" /></div>
    <div className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]"><Card><MiniTitle link="Buka Work Orders" to="/work-orders">Operational overview</MiniTitle><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-blue-50 p-4"><p className="text-[10px] font-bold uppercase text-blue-700">Active</p><p className="mt-1 text-2xl font-extrabold text-blue-700">{active.length}</p></div><div className="rounded-xl bg-emerald-50 p-4"><p className="text-[10px] font-bold uppercase text-emerald-700">Completed</p><p className="mt-1 text-2xl font-extrabold text-emerald-700">{completed.length}</p></div><div className="rounded-xl bg-amber-50 p-4"><p className="text-[10px] font-bold uppercase text-amber-700">Pending</p><p className="mt-1 text-2xl font-extrabold text-amber-700">{pending.length}</p></div><div className="rounded-xl bg-red-50 p-4"><p className="text-[10px] font-bold uppercase text-red-700">Overdue</p><p className="mt-1 text-2xl font-extrabold text-red-700">{overdue.length}</p></div></div><div className="mt-5 space-y-3">{orders.slice(0, 5).map((order) => <Link key={order.id} to="/work-orders" className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-semibold">{order.title || order.work_order_number}</p><p className="mt-1 text-[11px] text-muted-foreground">{order.work_order_number || order.id} · {pretty(order.status)}</p></div><Pill tone={statusTone(pretty(order.status))}>{pretty(order.status)}</Pill></Link>)}</div></Card><div className="space-y-5"><Card><MiniTitle link="Kelola Aset" to="/assets">Asset health</MiniTitle><p className="font-display text-3xl font-extrabold text-primary">{assets.total || 0}</p><p className="mt-1 text-xs text-muted-foreground">Total asset aktif terdaftar</p><div className="mt-4 space-y-2 text-xs">{Object.entries(assets.by_status || {}).slice(0, 4).map(([key, value]) => <div key={key} className="flex justify-between"><span className="text-muted-foreground">{pretty(key)}</span><b>{value}</b></div>)}</div></Card><Card><MiniTitle link="Buka Inventory" to="/inventory">Inventory alert</MiniTitle><p className={`font-display text-3xl font-extrabold ${lowStock.length ? "text-amber-600" : "text-emerald-600"}`}>{lowStock.length}</p><p className="mt-1 text-xs text-muted-foreground">Part di bawah minimum stock</p></Card></div></div>
  </div>;
}

function TenantDashboard() {
  const { user } = useApp();
  const [summary, setSummary] = useState(null), [notifications, setNotifications] = useState([]), [requests, setRequests] = useState([]), [orders, setOrders] = useState([]), [error, setError] = useState("");
  const load = async () => { setError(""); setSummary(null); try { const [dash, notifs, requestRes, orderRes] = await Promise.all([getDashboardSummary(), listNotifications(), listRequests(), listWorkOrders()]); setSummary(dash.data); setNotifications(notifs.data || []); setRequests(requestRes.data || []); setOrders(orderRes.data || []); } catch (e) { setError(e.message || "Terjadi kesalahan saat memuat data."); } };
  useEffect(() => { load(); }, []); if (!summary && !error) return <LoadingDashboard />; if (error) return <ErrorState error={error} retry={load} />;
  const assets = summary.assets || { total: 0, by_status: {} }, work = summary.work_orders || {}, latest = orders.length ? orders.slice(0, 5) : (work.latest || []);
  const orderStatus = orders.reduce((all, order) => ({ ...all, [order.status || "OPEN"]: (all[order.status || "OPEN"] || 0) + 1 }), {});
  const statusData = Object.entries(Object.keys(orderStatus).length ? orderStatus : (work.by_status || {})).map(([name, value]) => ({ name: pretty(name), value })).filter((v) => v.value > 0);
  const requestStatus = requests.reduce((all, request) => ({ ...all, [request.status || "SUBMITTED"]: (all[request.status || "SUBMITTED"] || 0) + 1 }), {});
  const monthKeys = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 5 + i); return d; });
  const chartData = monthKeys.map((d) => { const sameMonth = (value) => { const item = value && new Date(value); return item && item.getMonth() === d.getMonth() && item.getFullYear() === d.getFullYear(); }; return { name: d.toLocaleString("en", { month: "short" }), created: orders.filter((o) => sameMonth(o.created_at)).length, completed: orders.filter((o) => ["COMPLETED", "CLOSED", "VERIFIED"].includes(o.status) && sameMonth(o.completed_at || o.updated_at)).length }; });
  return <div className="mx-auto max-w-[1200px] space-y-4">
    <section className="relative isolate overflow-hidden rounded-2xl bg-[linear-gradient(120deg,hsl(222_47%_11%),hsl(214_75%_28%))] px-5 py-6 text-white shadow-xl shadow-primary/10 sm:px-7 sm:py-7">
      <div className="pointer-events-none absolute -right-10 -top-20 -z-10 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 -z-10 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-100"><Sparkles className="h-3.5 w-3.5" /> Pusat kendali maintenance</div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Selamat datang, {user?.name?.split(" ")[0] || "Admin"}.</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-300">Pantau kesehatan aset dan selesaikan pekerjaan maintenance dengan lebih cepat hari ini.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-2"><CalendarDays className="h-3.5 w-3.5 text-cyan-200" />{new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</span>
          <Link to="/work-orders" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-semibold text-white shadow-lg shadow-primary/20 transition hover:brightness-110">Lihat work order <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>
      <div className="relative mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
        <Link to="/work-orders" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"><Plus className="h-3.5 w-3.5" /> Work order baru</Link>
        <Link to="/requests" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"><ClipboardList className="h-3.5 w-3.5" /> Lihat request</Link>
        <Link to="/assets" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"><Package className="h-3.5 w-3.5" /> Kelola aset</Link>
      </div>
    </section>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><StatCard icon={Wrench} label="OPEN WORK ORDERS" value={work.active || 0} hint="Across all sites" /><StatCard icon={ClipboardCheck} label="PENDING APPROVAL" value={(summary.pending_request_approvals || 0) + (summary.pending_work_order_approvals || 0)} tone="warning" hint="Awaiting action" /><StatCard icon={Package} label="ASSETS UNDER MAINTENANCE" value={assets.by_status?.UNDER_MAINTENANCE || 0} tone="accent" hint="Requiring attention" /><StatCard icon={CheckCircle2} label="PM COMPLIANCE" value="87%" tone="success" delta="↗ 5% improvement" hint="Last 30 days" /></div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><Card className="lg:col-span-2"><MiniTitle>Work orders — last 6 months</MiniTitle><p className="-mt-2 mb-3 text-[11px] text-muted-foreground">Created vs completed</p><ResponsiveContainer width="100%" height={180}><BarChart data={chartData} barGap={4}><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} /><Tooltip /><Bar dataKey="created" fill="#bfdbfe" radius={[3, 3, 0, 0]} /><Bar dataKey="completed" fill="#2563eb" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer><div className="flex justify-center gap-4 text-[10px] text-muted-foreground"><span>■ Created</span><span className="text-primary">■ Completed</span></div></Card><Card><MiniTitle>Work order status</MiniTitle>{statusData.length ? <><ResponsiveContainer width="100%" height={120}><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={37} outerRadius={57} paddingAngle={2}>{statusData.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="grid grid-cols-2 gap-y-1 text-[10px]">{statusData.map((s, i) => <span key={s.name} className="flex items-center justify-between text-muted-foreground"><i className="mr-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />{s.name}<b>{s.value}</b></span>)}</div></> : <p className="py-14 text-center text-xs text-muted-foreground">No work orders yet.</p>}</Card></div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5"><Card className="lg:col-span-2"><MiniTitle>Request status</MiniTitle>{Object.keys(requestStatus).length ? <><ResponsiveContainer width="100%" height={130}><PieChart><Pie data={Object.entries(requestStatus).map(([name, value]) => ({ name: pretty(name), value }))} dataKey="value" nameKey="name" outerRadius={54}>{Object.keys(requestStatus).map((key, i) => <Cell key={key} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="grid grid-cols-2 gap-y-1 text-[10px]">{Object.entries(requestStatus).map(([name, value], i) => <span key={name} className="flex items-center text-muted-foreground"><i className="mr-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />{pretty(name)} <b className="ml-auto">{value}</b></span>)}</div></> : <p className="py-14 text-center text-xs text-muted-foreground">No requests yet.</p>}</Card><Card className="lg:col-span-3"><MiniTitle link="View all" to="/notifications">Notifications</MiniTitle><p className="-mt-2 mb-2 text-[11px] text-muted-foreground">{notifications.filter((n) => !n.read_at).length} unread</p><div className="divide-y">{notifications.slice(0, 4).map((n) => <div key={n.id} className="flex gap-2 py-2"><Bell className="mt-0.5 h-3 w-3 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{n.title}</p><p className="truncate text-[10px] text-muted-foreground">{n.message || n.body}</p></div></div>)}{!notifications.length && <p className="py-8 text-center text-xs text-muted-foreground">No notifications.</p>}</div></Card></div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5"><Card className="lg:col-span-3"><MiniTitle link="View all" to="/work-orders">Recent work orders</MiniTitle><div className="divide-y">{latest.length ? latest.slice(0, 5).map((wo) => <div key={wo.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-semibold">{wo.title || wo.id}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{wo.work_order_number || wo.id} · {date(wo.due_at)}</p></div><div className="flex shrink-0 gap-1"><Pill className="text-[9px]" tone={statusTone(pretty(wo.priority))}>{pretty(wo.priority)}</Pill><Pill className="text-[9px]" tone={statusTone(pretty(wo.status))}>{pretty(wo.status)}</Pill></div></div>) : <p className="py-10 text-center text-xs text-muted-foreground">No work orders yet.</p>}</div></Card><Card className="lg:col-span-2"><MiniTitle>Recent activity</MiniTitle><div className="space-y-3">{latest.slice(0, 5).map((wo, i) => <div className="flex gap-2" key={wo.id}><i className="mt-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS[i] }} /><p className="text-[10px] text-muted-foreground"><b className="text-foreground">{wo.work_order_number || wo.id}</b> status changed to {pretty(wo.status)}</p></div>)}{!latest.length && <p className="py-10 text-center text-xs text-muted-foreground">No activity yet.</p>}</div></Card></div>
  </div>;
}
function VendorDashboard() {
  const { user } = useApp();
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const [ordersResult, notificationsResult] = await Promise.allSettled([listPurchaseOrders(), listNotifications()]);
    if (ordersResult.status === "rejected") setError(ordersResult.reason?.message || "Purchase order tidak dapat dimuat.");
    setOrders(ordersResult.status === "fulfilled" ? ordersResult.value?.data || [] : []);
    setNotifications(notificationsResult.status === "fulfilled" ? notificationsResult.value?.data || [] : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const pending = orders.filter((po) => ["DRAFT", "SENT"].includes(po.status));
  const confirmed = orders.filter((po) => ["CONFIRMED", "SHIPPED", "PARTIALLY_RECEIVED"].includes(po.status));
  const delivered = orders.filter((po) => ["RECEIVED", "INVOICED", "PAID"].includes(po.status));
  const totalValue = orders.reduce((sum, po) => sum + Number(po.total_cost || 0), 0);
  const formatMoney = (value) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value || 0))}`;
  const formatDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "-";
  const statusMeta = {
    DRAFT: ["Draft", "muted"], SENT: ["Menunggu konfirmasi", "warning"], CONFIRMED: ["Dikonfirmasi", "accent"], SHIPPED: ["Dikirim", "accent"],
    PARTIALLY_RECEIVED: ["Sebagian diterima", "warning"], RECEIVED: ["Diterima", "success"], INVOICED: ["Ditagihkan", "accent"], PAID: ["Lunas", "success"], CANCELLED: ["Dibatalkan", "danger"],
  };
  const unread = notifications.filter((n) => !n.read_at).length;

  if (loading) return <LoadingDashboard />;
  return <div className="mx-auto max-w-[1240px] space-y-5">
    <section className="relative overflow-hidden rounded-2xl bg-[#0d1b32] px-5 py-6 text-white shadow-sm sm:px-7">
      <div className="absolute -right-10 -top-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-2xl" />
      <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">Vendor workspace</p><h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Selamat datang, {user?.name?.split(" ")[0] || "Vendor"}.</h1><p className="mt-2 max-w-xl text-sm text-slate-300">Kelola purchase order, konfirmasi ketersediaan, dan pantau pengiriman dari satu tempat.</p></div>
        <div className="flex flex-wrap gap-2"><Link to="/procurement" className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3.5 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"><FileText className="h-4 w-4" /> Lihat purchase order</Link><button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-white/10"><RefreshCcw className="h-4 w-4" /> Refresh</button></div>
      </div>
    </section>

    {error && <ErrorState error={error} retry={load} />}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><StatCard icon={CircleDollarSign} label="Total Belanja" value={formatMoney(totalValue)} hint={`${orders.length} purchase order`} /><StatCard icon={Clock3} label="Menunggu Konfirmasi" value={pending.length} tone="warning" hint="PO perlu tindakan" /><StatCard icon={Bell} label="Notifikasi Baru" value={unread} tone="accent" hint={`${notifications.length} total notifikasi`} /></div>

    <Card className="overflow-hidden"><MiniTitle>Alur Kerja Vendor</MiniTitle><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[[FileText, "Purchase Order", "PO dari perusahaan"], [CheckCircle2, "Konfirmasi", "Terima atau tolak"], [Truck, "Pengiriman", "Update status kirim"], [Package, "Selesai", "Warehouse verifikasi"]].map(([Icon, title, desc], index) => <div key={title} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-xs font-bold">{index + 1}. {title}</p><p className="truncate text-[10px] text-muted-foreground">{desc}</p></div></div>)}</div></Card>

    <div className="grid gap-5 lg:grid-cols-[1.45fr_0.8fr]">
      <Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><div><h2 className="font-display text-base font-extrabold">Purchase Order Terbaru</h2><p className="mt-1 text-xs text-muted-foreground">Daftar pesanan yang perlu Anda proses</p></div><Link to="/procurement" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">Lihat semua <ChevronRight className="h-3.5 w-3.5" /></Link></div><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead><tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3">PO Number</th><th className="px-3 py-3">Expected date</th><th className="px-3 py-3">Total</th><th className="px-5 py-3 text-right">Status</th></tr></thead><tbody>{orders.slice(0, 6).map((po) => { const meta = statusMeta[po.status] || [pretty(po.status), "muted"]; return <tr key={po.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30"><td className="px-5 py-3.5"><Link to="/procurement" className="font-semibold text-foreground hover:text-primary">{po.po_number || po.id}</Link><p className="mt-0.5 text-[11px] text-muted-foreground">{po.vendor_name || "Purchase order"}</p></td><td className="px-3 py-3.5 text-xs text-muted-foreground">{formatDate(po.expected_date)}</td><td className="px-3 py-3.5 text-xs font-semibold">{formatMoney(po.total_cost)}</td><td className="px-5 py-3.5 text-right"><Pill tone={meta[1]}>{meta[0]}</Pill></td></tr>; })}</tbody></table>{!orders.length && <div className="px-5 py-10 text-center"><Boxes className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-2 text-sm font-semibold">Belum ada purchase order</p><p className="mt-1 text-xs text-muted-foreground">PO akan muncul setelah perusahaan menugaskan pesanan ke akun vendor ini.</p><Link to="/procurement" className="mt-4 inline-flex rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">Buka Procurement</Link></div>}</div></Card>
      <div className="space-y-5"><Card><MiniTitle>Ringkasan nilai pesanan</MiniTitle><div className="flex items-end gap-3"><CircleDollarSign className="mb-1 h-8 w-8 text-cyan-500" /><div><p className="font-display text-2xl font-extrabold">{formatMoney(totalValue)}</p><p className="mt-1 text-xs text-muted-foreground">Total nilai purchase order</p></div></div><div className="mt-5 space-y-3 border-t border-border/60 pt-4"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Menunggu konfirmasi</span><b>{pending.length}</b></div><div className="flex justify-between text-xs"><span className="text-muted-foreground">Dalam pengiriman</span><b>{confirmed.length}</b></div><div className="flex justify-between text-xs"><span className="text-muted-foreground">Sudah diterima</span><b>{delivered.length}</b></div></div></Card><Card><MiniTitle link="Buka notifikasi" to="/notifications">Aktivitas terbaru</MiniTitle><div className="space-y-3">{notifications.slice(0, 4).map((n) => <div key={n.id} className="flex gap-2.5"><div className="mt-0.5 rounded-lg bg-cyan-50 p-1.5 text-cyan-600"><Bell className="h-3.5 w-3.5" /></div><div className="min-w-0"><p className="truncate text-xs font-semibold">{n.title || "Notifikasi sistem"}</p><p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.message || n.body || "Ada pembaruan pada workspace vendor."}</p></div></div>)}{!notifications.length && <p className="py-3 text-center text-xs text-muted-foreground">Belum ada aktivitas terbaru.</p>}</div></Card></div>
    </div>

    <section><div className="mb-3 flex items-end justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Vendor actions</p><h2 className="mt-1 font-display text-lg font-extrabold">Akses cepat</h2></div></div><div className="grid gap-3 md:grid-cols-2"><Link to="/procurement" className="group"><Card className="flex items-center gap-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Search className="h-5 w-5" /></div><div className="min-w-0"><h3 className="text-sm font-bold">Review purchase order</h3><p className="mt-1 text-xs text-muted-foreground">Lihat detail item dan status pesanan.</p></div><ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" /></Card></Link><Link to="/notifications" className="group"><Card className="flex items-center gap-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><div className="rounded-xl bg-amber-50 p-3 text-amber-600"><MessageSquare className="h-5 w-5" /></div><div className="min-w-0"><h3 className="text-sm font-bold">Komunikasi</h3><p className="mt-1 text-xs text-muted-foreground">Baca pembaruan dan notifikasi.</p></div><ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" /></Card></Link></div></section>
  </div>;
}
function VendorDashboardPolished() {
  const { user } = useApp();
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true); setError("");
    const [po, notif] = await Promise.allSettled([listPurchaseOrders(), listNotifications()]);
    if (po.status === "rejected") setError(po.reason?.message || "Purchase order tidak dapat dimuat.");
    setOrders(po.status === "fulfilled" ? po.value?.data || [] : []);
    setNotifications(notif.status === "fulfilled" ? notif.value?.data || [] : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  if (loading) return <LoadingDashboard />;
  const money = (v) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(v || 0))}`;
  const pending = orders.filter((po) => po.status === "SENT");
  const shipped = orders.filter((po) => ["CONFIRMED", "SHIPPED", "PARTIALLY_RECEIVED"].includes(po.status));
  const completed = orders.filter((po) => ["RECEIVED", "INVOICED", "PAID"].includes(po.status));
  const total = orders.reduce((sum, po) => sum + Number(po.total_cost || 0), 0);
  const unread = notifications.filter((n) => !n.read_at).length;
  const status = { DRAFT: ["Draft", "muted"], SENT: ["Menunggu", "warning"], CONFIRMED: ["Dikonfirmasi", "primary"], SHIPPED: ["Dikirim", "accent"], PARTIALLY_RECEIVED: ["Sebagian diterima", "warning"], RECEIVED: ["Selesai", "success"], INVOICED: ["Ditagihkan", "accent"], PAID: ["Lunas", "success"], REJECTED: ["Ditolak", "danger"], CANCELLED: ["Dibatalkan", "danger"] };
  return <div className="mx-auto max-w-[1180px] space-y-5">
    <section className="relative overflow-hidden rounded-[20px] bg-[#0d1b32] px-6 py-6 text-white shadow-[0_12px_30px_rgba(15,35,65,0.12)] sm:px-8 sm:py-7"><div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" /><div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Vendor Portal</p><h1 className="mt-2 font-display text-[26px] font-extrabold tracking-tight sm:text-3xl">Selamat datang, {user?.name?.split(" ")[0] || "Vendor"}</h1><p className="mt-2 text-sm text-slate-300">Pantau pesanan, konfirmasi PO, dan kelola pengiriman Anda.</p></div><div className="flex gap-2"><Link to="/procurement" className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-300"><FileText className="h-4 w-4" /> Lihat PO</Link><button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"><RefreshCcw className="h-4 w-4" /> Refresh</button></div></div></section>
    {error && <ErrorState error={error} retry={load} />}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><StatCard icon={CircleDollarSign} label="Total Belanja" value={money(total)} hint={`${orders.length} purchase order`} /><StatCard icon={Clock3} label="Menunggu Konfirmasi" value={pending.length} tone="warning" hint="Perlu tindakan Anda" /><StatCard icon={Bell} label="Notifikasi Baru" value={unread} tone="accent" hint={`${notifications.length} total notifikasi`} /></div>
    <div className="grid gap-5 lg:grid-cols-[1.55fr_0.85fr]">
      <Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><div><h2 className="font-display text-base font-extrabold">Purchase Order Terbaru</h2><p className="mt-1 text-xs text-muted-foreground">Pesanan yang membutuhkan perhatian Anda</p></div><Link to="/procurement" className="text-xs font-bold text-primary hover:underline">Lihat semua <ArrowRight className="inline h-3.5 w-3.5" /></Link></div>{orders.length ? <div className="divide-y divide-border/60">{orders.slice(0, 5).map((po) => { const meta = status[po.status] || [pretty(po.status), "muted"]; return <Link to="/procurement" key={po.id} className="flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-primary"><Package className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block font-mono text-xs font-bold text-primary">{po.po_number || po.id}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{(po.items || []).map((i) => i.part_name).join(", ") || "Purchase order"}</span></span><span className="hidden text-right sm:block"><span className="block text-xs font-bold">{money(po.total_cost)}</span><span className="mt-1 block text-[10px] text-muted-foreground">{po.expected_date ? new Date(po.expected_date).toLocaleDateString("id-ID") : "Tanpa tanggal"}</span></span><Pill tone={meta[1]}>{meta[0]}</Pill><ArrowRight className="h-4 w-4 text-slate-300" /></Link>; })}</div> : <div className="px-6 py-10 text-center"><Package className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-semibold">Belum ada purchase order</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">PO akan tampil di sini setelah perusahaan mengirim pesanan ke akun Vendor yang terhubung.</p><Link to="/procurement" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">Buka Procurement</Link></div>}</Card>
      <div className="space-y-5"><Card><MiniTitle>Ringkasan Pesanan</MiniTitle><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600"><CircleDollarSign className="h-6 w-6" /></span><div><p className="text-2xl font-extrabold tracking-tight">{money(total)}</p><p className="text-xs text-muted-foreground">Total nilai purchase order</p></div></div><div className="mt-5 space-y-3 border-t border-border/60 pt-4 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Menunggu konfirmasi</span><b>{pending.length}</b></div><div className="flex justify-between"><span className="text-muted-foreground">Dalam pengiriman</span><b>{shipped.length}</b></div><div className="flex justify-between"><span className="text-muted-foreground">Sudah diterima</span><b>{completed.length}</b></div></div></Card><Card><MiniTitle>Aktivitas Terbaru</MiniTitle>{notifications.length ? notifications.slice(0, 3).map((n) => <div key={n.id} className="flex gap-2.5 border-b border-border/60 py-2.5 last:border-0"><Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="truncate text-xs font-semibold">{n.title || "Pembaruan pesanan"}</p><p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.message || n.body || "Ada pembaruan pada purchase order."}</p></div></div>) : <p className="py-3 text-xs leading-5 text-muted-foreground">Belum ada aktivitas terbaru pada akun Anda.</p>}<Link to="/notifications" className="mt-3 inline-flex text-xs font-bold text-primary">Buka notifikasi <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Card></div>
    </div>
    <Card><MiniTitle>Alur Pengadaan</MiniTitle><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[[FileText, "Purchase Order", "Perusahaan membuat PO"], [CheckCircle2, "Konfirmasi", "Vendor menerima atau menolak"], [Truck, "Pengiriman", "Vendor mengirim barang"], [Package, "Selesai", "Warehouse memverifikasi"]].map(([Icon, title, desc], i) => <div key={title} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-slate-50/70 p-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-xs font-bold">{i + 1}. {title}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{desc}</p></div></div>)}</div></Card>
  </div>;
}

function PlatformDashboard() { const [tenants, setTenants] = useState(null), [error, setError] = useState(""); const load = async () => { setError(""); try { setTenants((await listPlatformTenants()).data || []); } catch (e) { setError(e.message || "Data platform tidak dapat dimuat."); } }; useEffect(() => { load(); }, []); if (!tenants && !error) return <LoadingDashboard />; if (error) return <ErrorState error={error} retry={load} />; const active = tenants.filter((t) => t.status === "ACTIVE").length; return <div className="mx-auto max-w-[1200px] space-y-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><StatCard icon={Database} label="TOTAL TENANT" value={tenants.length} /><StatCard icon={CheckCircle2} label="TENANT AKTIF" value={active} tone="success" /><StatCard icon={AlertTriangle} label="DALAM PROSES" value={tenants.length - active} tone="warning" /></div><Card><MiniTitle>Tenant terbaru</MiniTitle>{tenants.map((t) => <div className="flex justify-between border-b py-3 text-sm last:border-0" key={t.id}><span className="truncate pr-3">{t.name}</span><Pill tone={statusTone(pretty(t.status))}>{pretty(t.status)}</Pill></div>)}</Card></div>; }
export default function Dashboard() { const { user } = useApp(); return <Reveal>{user.role === "super_admin" ? <PlatformDashboard /> : user.role === "company_admin" ? <CompanyAdminDashboard /> : user.role === "vendor" ? <VendorDashboardPolished /> : user.role === "warehouse" ? <WarehouseDashboard /> : user.role === "manager" ? <ManagerDashboard /> : <TenantDashboard />}</Reveal>; }
