import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Download, Gauge, ClipboardCheck, Timer, Activity, Wrench, Boxes, ClipboardList, ShieldCheck, Info } from "lucide-react";
import { toast } from "sonner";
import { useApp, idr } from "../store/store";
import { PageHeader, Card, StatCard, Button, Reveal, Pill, Table } from "../components/kit";
import { listAssets } from "../lib/assets";
import { listWorkOrders } from "../lib/workorders";
import { listRequests } from "../lib/requests";
import { listSpareParts } from "../lib/inventory";
import { listPmSchedules } from "../lib/preventive";
import { getReliabilityAnalytics } from "../lib/dashboard";

function ChartCard({ title, hint, children }) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-1.5">
        <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
        {hint && <span title={hint}><Info className="h-3.5 w-3.5 text-muted-foreground" /></span>}
      </div>
      {children}
    </Card>
  );
}

/* ------------------------------- CSV export helpers ------------------------------- */

function toCsv(rows, columns) {
  const escape = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escape(c.get(r))).join(",")).join("\n");
  return `${header}\n${body}`;
}

function downloadCsv(filename, csv) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const pretty = (value) => String(value || "-").split("_").map((p) => p[0] + p.slice(1).toLowerCase()).join(" ");

export default function Analytics() {
  const { user } = useApp();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [pmSchedules, setPmSchedules] = useState([]);
  const [reliability, setReliability] = useState(null);
  const [reliabilityError, setReliabilityError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsRes, woRes, reqRes, partsRes, pmRes, relRes] = await Promise.all([
        listAssets({ per_page: 200 }),
        listWorkOrders({ per_page: 200 }),
        listRequests({ per_page: 200 }),
        listSpareParts({ per_page: 200 }),
        listPmSchedules({ per_page: 200 }),
        getReliabilityAnalytics(180).catch((e) => { setReliabilityError(e.message || "Gagal memuat metrik keandalan."); return null; }),
      ]);
      setAssets(assetsRes.data || []);
      setWorkOrders(woRes.data || []);
      setRequests(reqRes.data || []);
      setSpareParts(partsRes.data || []);
      setPmSchedules(pmRes.data || []);
      setReliability(relRes?.data || null);
    } catch (err) {
      toast.error(err.message || "Gagal memuat data analitik.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tip = { borderRadius: 12, border: "1px solid hsl(var(--border))" };

  /* ---- work order analytics (client-side, from already-loaded lists) ---- */
  const ACTIVE_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"];
  const openWos = workOrders.filter((w) => ACTIVE_STATUSES.includes(w.status));
  const overdueWos = workOrders.filter((w) => w.due_at && new Date(w.due_at).getTime() < Date.now() && ACTIVE_STATUSES.includes(w.status));
  const slaCompliance = workOrders.length ? Math.round(((workOrders.length - overdueWos.length) / workOrders.length) * 100) : 100;

  const woByStatus = ["PENDING_APPROVAL", "OPEN", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CLOSED", "CANCELLED"]
    .map((s) => ({ name: s.replace("_", " "), value: workOrders.filter((w) => w.status === s).length }))
    .filter((d) => d.value > 0);

  const woByPriority = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => ({
    name: p, value: workOrders.filter((w) => w.priority === p).length,
  }));
  const priorityColors = ["hsl(0 84% 60%)", "hsl(38 92% 50%)", "hsl(199 89% 48%)", "hsl(var(--muted-foreground))"];

  const woByAsset = useMemo(() => {
    const counts = new Map();
    for (const w of workOrders) {
      const asset = assets.find((a) => a.id === w.asset_id);
      const key = asset ? `${asset.name} (${asset.code})` : (w.asset_id || "Tanpa aset");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [workOrders, assets]);

  /* ---- asset analytics ---- */
  const assetByStatus = ["OPERATIONAL", "UNDER_MAINTENANCE", "DOWN", "STANDBY", "OUT_OF_SERVICE"]
    .map((s) => ({ name: s.replace("_", " "), value: assets.filter((a) => a.status === s).length }))
    .filter((d) => d.value > 0);

  /* ---- request analytics ---- */
  const reqApproved = requests.filter((r) => !["SUBMITTED", "PENDING_APPROVAL", "REJECTED", "CANCELLED"].includes(r.status));
  const reqDecided = requests.filter((r) => !["SUBMITTED", "PENDING_APPROVAL"].includes(r.status));
  const reqApprovalRate = reqDecided.length ? Math.round((reqApproved.length / reqDecided.length) * 100) : 0;

  /* ---- PM analytics ---- */
  const overdueSchedules = pmSchedules.filter((p) => p.status === "Overdue").length;
  const avgCompliance = pmSchedules.length
    ? Math.round(pmSchedules.reduce((s, p) => s + (p.compliance ?? 100), 0) / pmSchedules.length)
    : 0;

  /* ---- inventory analytics ---- */
  const lowStockCount = spareParts.filter((p) => (p.total_quantity ?? 0) <= (p.min_stock ?? 0)).length;
  const totalInventoryValue = spareParts.reduce((s, p) => s + (p.total_quantity ?? 0) * (p.unit_cost ?? 0), 0);

  /* ---- reliability (real, from backend) ---- */
  const fleet = reliability?.fleet || null;
  const monthly = reliability?.monthly || [];
  const hasReliability = !!fleet;

  /* ------------------------------- report library (CSV export) ------------------------------- */

  const supportedReports = useMemo(() => [
    {
      name: "Equipment Uptime Report",
      available: hasReliability,
      run: () => downloadCsv("uptime-report.csv", toCsv(monthly, [
        { header: "Bulan", get: (r) => r.label },
        { header: "Uptime (%)", get: (r) => r.uptime_pct ?? "" },
        { header: "Downtime (jam)", get: (r) => r.downtime_hours },
      ])),
    },
    {
      name: "Downtime Analysis Report",
      available: hasReliability,
      run: () => downloadCsv("downtime-analysis.csv", toCsv(monthly, [
        { header: "Bulan", get: (r) => r.label },
        { header: "Downtime (jam)", get: (r) => r.downtime_hours },
        { header: "MTTR (jam)", get: (r) => r.mttr_hours ?? "" },
        { header: "Jumlah WO Unplanned", get: (r) => r.unplanned_count },
      ])),
    },
    {
      name: "Preventive vs Corrective Report",
      available: hasReliability,
      run: () => downloadCsv("preventive-vs-corrective.csv", toCsv(monthly, [
        { header: "Bulan", get: (r) => r.label },
        { header: "Planned (PM)", get: (r) => r.planned_count },
        { header: "Unplanned (Corrective)", get: (r) => r.unplanned_count },
      ])),
    },
    {
      name: "Maintenance Cost Trend Report",
      available: hasReliability,
      run: () => downloadCsv("maintenance-cost-trend.csv", toCsv(monthly, [
        { header: "Bulan", get: (r) => r.label },
        { header: "Biaya Suku Cadang (Rp)", get: (r) => r.parts_cost },
        { header: "Jam Kerja Teknisi", get: (r) => r.labor_hours },
      ])),
    },
    {
      name: "Work Order by Status Report",
      available: workOrders.length > 0,
      run: () => downloadCsv("wo-by-status.csv", toCsv(woByStatus, [
        { header: "Status", get: (r) => r.name },
        { header: "Jumlah", get: (r) => r.value },
      ])),
    },
    {
      name: "Work Order by Priority Report",
      available: workOrders.length > 0,
      run: () => downloadCsv("wo-by-priority.csv", toCsv(woByPriority, [
        { header: "Prioritas", get: (r) => r.name },
        { header: "Jumlah", get: (r) => r.value },
      ])),
    },
    {
      name: "Work Order by Asset Report",
      available: woByAsset.length > 0,
      run: () => downloadCsv("wo-by-asset.csv", toCsv(woByAsset, [
        { header: "Aset", get: (r) => r.name },
        { header: "Jumlah WO", get: (r) => r.count },
      ])),
    },
    {
      name: "Maintenance Request Analysis",
      available: requests.length > 0,
      run: () => downloadCsv("request-analysis.csv", toCsv(
        ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "CONVERTED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"]
          .map((s) => ({ status: pretty(s), count: requests.filter((r) => r.status === s).length })),
        [{ header: "Status", get: (r) => r.status }, { header: "Jumlah", get: (r) => r.count }],
      )),
    },
    {
      name: "Request Approval Rate Report",
      available: reqDecided.length > 0,
      run: () => downloadCsv("request-approval-rate.csv", toCsv([
        { label: "Total permintaan diputuskan", value: reqDecided.length },
        { label: "Disetujui", value: reqApproved.length },
        { label: "Tingkat persetujuan (%)", value: reqApprovalRate },
      ], [{ header: "Metrik", get: (r) => r.label }, { header: "Nilai", get: (r) => r.value }])),
    },
    {
      name: "Spare Parts Reorder Report",
      available: spareParts.length > 0,
      run: () => downloadCsv("spare-parts-reorder.csv", toCsv(
        spareParts.filter((p) => (p.total_quantity ?? 0) <= (p.min_stock ?? 0)),
        [
          { header: "Kode", get: (r) => r.code }, { header: "Nama", get: (r) => r.name },
          { header: "Stok Saat Ini", get: (r) => r.total_quantity ?? 0 }, { header: "Stok Minimum", get: (r) => r.min_stock ?? 0 },
          { header: "Reorder Point", get: (r) => r.reorder_point ?? 0 },
        ],
      )),
    },
    {
      name: "Inventory Valuation Report",
      available: spareParts.length > 0,
      run: () => downloadCsv("inventory-valuation.csv", toCsv(spareParts, [
        { header: "Kode", get: (r) => r.code }, { header: "Nama", get: (r) => r.name },
        { header: "Qty", get: (r) => r.total_quantity ?? 0 }, { header: "Harga Satuan (Rp)", get: (r) => r.unit_cost ?? 0 },
        { header: "Total Nilai (Rp)", get: (r) => (r.total_quantity ?? 0) * (r.unit_cost ?? 0) },
      ])),
    },
  ], [hasReliability, monthly, workOrders, woByStatus, woByPriority, woByAsset, requests, reqDecided, reqApproved, reqApprovalRate, spareParts]);

  const supportedNames = new Set(supportedReports.map((r) => r.name));
  const unsupportedReports = [
    "Work Order Analysis", "Technician Productivity", "Technician Utilization Report", "Supplier Performance Report",
    "SLA Compliance Report", "Asset Depreciation Report", "Downtime Cost Analysis", "Downtime by Cause Report",
    "Work Order by Technician Report", "Maintenance Cost per Asset Report", "Purchase Order History Report",
    "Vendor Performance Report", "Vendor Cost Comparison Report", "Slow-moving Items Report", "Asset Condition Trend Report",
    "Warranty Tracking Report", "Compliance Report", "Budget vs Actual Report", "Repeat Issues Report",
  ].filter((n) => !supportedNames.has(n));

  const runReport = (report) => {
    if (!report.available) {
      toast.error("Belum cukup data untuk laporan ini.");
      return;
    }
    report.run();
    toast.success(`${report.name} diunduh.`);
  };

  const exportSummary = () => {
    if (!hasReliability) {
      toast.error("Metrik keandalan belum tersedia untuk diekspor.");
      return;
    }
    downloadCsv("ringkasan-analitik.csv", toCsv(monthly, [
      { header: "Bulan", get: (r) => r.label },
      { header: "Uptime (%)", get: (r) => r.uptime_pct ?? "" },
      { header: "MTTR (jam)", get: (r) => r.mttr_hours ?? "" },
      { header: "Downtime (jam)", get: (r) => r.downtime_hours },
      { header: "Planned (PM)", get: (r) => r.planned_count },
      { header: "Unplanned (Corrective)", get: (r) => r.unplanned_count },
      { header: "Biaya Suku Cadang (Rp)", get: (r) => r.parts_cost },
      { header: "Jam Kerja Teknisi", get: (r) => r.labor_hours },
    ]));
    toast.success("Ringkasan analitik diunduh.");
  };

  return (
    <Reveal>
      <PageHeader
        title="Laporan & Analitik"
        subtitle="Metrik keandalan, biaya, dan performa peralatan — dihitung langsung dari data 180 hari terakhir."
        action={<Button variant="ghost" onClick={exportSummary}><Download className="h-4 w-4" /> Export CSV</Button>}
      />

      {reliabilityError && (
        <Card className="mb-4 border-destructive/30 bg-destructive/5">
          <p className="text-xs text-destructive">{reliabilityError}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Gauge} label="Uptime (180 hari)" tone="success"
          value={fleet?.uptime_pct != null ? `${fleet.uptime_pct}%` : "—"}
          hint={fleet ? `${fleet.active_asset_count} aset aktif` : "Belum ada data work order"}
        />
        <StatCard icon={ClipboardCheck} label="WO Selesai" value={workOrders.filter((w) => ["COMPLETED", "CLOSED"].includes(w.status)).length} tone="primary" />
        <StatCard
          icon={Timer} label="MTTR" tone="accent"
          value={fleet?.mttr_hours != null ? `${fleet.mttr_hours} jam` : "—"}
          hint="Rata-rata waktu perbaikan WO korektif (DIRECT/REQUEST)"
        />
        <StatCard
          icon={Activity} label="MTBF" tone="warning"
          value={fleet?.mtbf_hours != null ? `${fleet.mtbf_hours} jam` : "—"}
          hint={fleet ? `Dari ${fleet.mtbf_asset_sample_size} aset dengan ≥2 kejadian unplanned` : "Perlu ≥2 WO korektif per aset"}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ClipboardList} label="Work Order Terbuka" value={openWos.length} tone="primary" hint={`${overdueWos.length} overdue`} />
        <StatCard icon={ShieldCheck} label="SLA Compliance" value={`${slaCompliance}%`} tone="success" />
        <StatCard icon={Wrench} label="PM Compliance" value={`${avgCompliance}%`} tone="accent" hint={`${overdueSchedules} overdue`} />
        <StatCard icon={ClipboardCheck} label="Tingkat Persetujuan" value={`${reqApprovalRate}%`} tone="warning" hint={`${requests.length} total permintaan`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Work Order by Status">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={woByStatus}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="value" name="Work Order" fill="hsl(214 95% 52%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Work Order by Priority">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={woByPriority} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {woByPriority.map((d, i) => <Cell key={d.name} fill={priorityColors[i]} />)}
              </Pie>
              <Tooltip contentStyle={tip} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status Aset">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={assetByStatus}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="value" fill="hsl(199 89% 48%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tren Uptime" hint="Uptime bulanan = 1 − (downtime / (aset aktif × jam per bulan)), dihitung dari WO korektif yang sudah selesai.">
          {monthly.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthly}>
                <defs><linearGradient id="u2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(152 62% 40%)" stopOpacity={0.35} /><stop offset="100%" stopColor="hsl(152 62% 40%)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" unit="%" />
                <Tooltip contentStyle={tip} formatter={(v) => `${v}%`} />
                <Area type="monotone" dataKey="uptime_pct" name="Uptime" stroke="hsl(152 62% 40%)" strokeWidth={2.5} fill="url(#u2)" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChartState loading={loading} />}
        </ChartCard>

        <ChartCard title="Tren Biaya Suku Cadang" hint="Dihitung dari mutasi stok keluar (spare_part_stock_movements) yang tertaut ke work order, dikali harga satuan. Biaya tenaga kerja tidak dihitung dalam Rupiah karena tarif per jam belum ada di sistem — dipisah sebagai jam kerja.">
          {monthly.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="l" tickFormatter={(v) => `${v / 1000000}jt`} tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(v, name) => (name === "Biaya Suku Cadang" ? idr(v) : `${v} jam`)} contentStyle={tip} />
                <Legend />
                <Bar yAxisId="l" dataKey="parts_cost" name="Biaya Suku Cadang" fill="hsl(214 95% 52%)" radius={[6, 6, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="labor_hours" name="Jam Kerja Teknisi" stroke="hsl(38 92% 50%)" strokeWidth={2.5} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChartState loading={loading} />}
        </ChartCard>

        <ChartCard title="MTTR & Downtime" hint="MTTR: rata-rata waktu perbaikan WO korektif yang selesai bulan itu. Downtime: total jam perbaikan WO korektif bulan itu.">
          {monthly.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="l" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tip} />
                <Legend />
                <Line yAxisId="l" type="monotone" dataKey="mttr_hours" name="MTTR (jam)" stroke="hsl(38 92% 50%)" strokeWidth={2.5} connectNulls />
                <Line yAxisId="r" type="monotone" dataKey="downtime_hours" name="Downtime (jam)" stroke="hsl(214 95% 52%)" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChartState loading={loading} />}
        </ChartCard>
      </div>

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-foreground">Preventive Maintenance Effectiveness</h3>
          <Pill tone="primary"><Wrench className="h-3.5 w-3.5" /> {avgCompliance}% compliance</Pill>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={ClipboardCheck} label="PM Schedules Aktif" value={pmSchedules.filter((p) => p.status !== "Archived").length} tone="success" />
          <StatCard icon={Timer} label="Plans Overdue" value={overdueSchedules} tone="warning" />
          <StatCard icon={Boxes} label="Spare Parts Perlu Restock" value={lowStockCount} tone="danger" />
        </div>
        {hasReliability && (
          <p className="mt-4 text-xs text-muted-foreground">
            Rasio pekerjaan terjadwal (PM) vs korektif dalam 180 hari terakhir: <b className="text-foreground">{fleet.planned_ratio_pct != null ? `${fleet.planned_ratio_pct}%` : "—"} planned</b> dari {fleet.total_work_orders} total work order ({fleet.planned_work_orders} PM, {fleet.unplanned_work_orders} korektif).
          </p>
        )}
      </Card>

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-foreground">Inventory Overview</h3>
          <Pill tone="accent">{spareParts.length} SKU</Pill>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Nilai Total Inventory" value={idr(totalInventoryValue)} tone="primary" />
          <StatCard label="Perlu Restock" value={lowStockCount} tone="warning" />
          <StatCard label="Permintaan Ditolak" value={requests.filter((r) => r.status === "REJECTED").length} tone="danger" />
        </div>
      </Card>

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-foreground">Report Library</h3>
          <Pill tone="success">{supportedReports.length} siap diekspor</Pill>
        </div>
        <Table
          columns={[
            { key: "name", header: "Nama Laporan" },
            {
              key: "act", header: "", render: (r) => (
                <Button variant="ghost" className="!px-3 !py-1.5 text-xs" disabled={!r.available} onClick={() => runReport(r)}>
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              ),
            },
          ]}
          rows={supportedReports}
          rowKey="name"
        />
        {unsupportedReports.length > 0 && (
          <div className="mt-5 border-t pt-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Belum tersedia — butuh data yang belum dicatat sistem (mis. tarif tenaga kerja, performa vendor, garansi):</p>
            <div className="flex flex-wrap gap-1.5">
              {unsupportedReports.map((name) => <Pill key={name} tone="muted">{name}</Pill>)}
            </div>
          </div>
        )}
      </Card>
    </Reveal>
  );
}

function EmptyChartState({ loading }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
      {loading ? "Memuat..." : "Belum ada work order dalam periode ini."}
    </div>
  );
}
