import React, { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Download, Gauge, ClipboardCheck, Timer, Activity, Wrench, Boxes, ClipboardList, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useApp, idr } from "../store/store";
import { PageHeader, Card, StatCard, Button, Reveal, Pill, Table } from "../components/kit";
import { listAssets } from "../lib/assets";
import { listWorkOrders } from "../lib/workorders";
import { listRequests } from "../lib/requests";
import { listSpareParts } from "../lib/inventory";
import { listPmSchedules } from "../lib/preventive";


function ChartCard({ title, children }) {
  return (
    <Card>
      <h3 className="mb-4 font-display text-base font-bold text-foreground">{title}</h3>
      {children}
    </Card>
  );
}

const REPORTS = [
  "Equipment Uptime Report", "Work Order Analysis", "Maintenance Cost Report", "Technician Productivity",
  "Inventory Valuation Report", "Spare Parts Usage Report", "SLA Compliance Report", "Asset Depreciation Report",
  "Downtime Analysis Report", "Preventive vs Corrective Report", "Technician Utilization Report", "Supplier Performance Report",
  "Work Order by Status Report", "Work Order by Priority Report", "Work Order by Asset Report", "Work Order by Technician Report",
  "Maintenance Request Analysis", "Request Approval Rate Report", "Downtime Cost Analysis", "Downtime by Cause Report",
  "Maintenance Cost per Asset Report", "Maintenance Cost Trend Report", "Purchase Order History Report", "Vendor Performance Report",
  "Vendor Cost Comparison Report", "Spare Parts Reorder Report", "Slow-moving Items Report", "Asset Condition Trend Report",
  "Warranty Tracking Report", "Compliance Report", "Budget vs Actual Report", "Repeat Issues Report",
];

export default function Analytics() {
  const { user } = useApp();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [pmSchedules, setPmSchedules] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsRes, woRes, reqRes, partsRes, pmRes] = await Promise.all([
        listAssets({ per_page: 200 }),
        listWorkOrders({ per_page: 200 }),
        listRequests({ per_page: 200 }),
        listSpareParts({ per_page: 200 }),
        listPmSchedules({ per_page: 200 }),
      ]);
      setAssets(assetsRes.data || []);
      setWorkOrders(woRes.data || []);
      setRequests(reqRes.data || []);
      setSpareParts(partsRes.data || []);
      setPmSchedules(pmRes.data || []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat data analitik.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportReport = () => toast.error("Ekspor belum tersedia karena endpoint laporan belum diimplementasikan.");
  const tip = { borderRadius: 12, border: "1px solid hsl(var(--border))" };

  /* ---- work order analytics ---- */
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

  return (
    <Reveal>
      <PageHeader
        title="Laporan & Analitik"
        subtitle="Metrik keandalan, biaya, dan performa peralatan — data dari database."
        action={<Button variant="ghost" onClick={() => exportReport()}><Download className="h-4 w-4" /> Export CSV</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Gauge} label="Uptime" value="—" tone="success" hint="Membutuhkan pencatatan downtime tervalidasi" />
        <StatCard icon={ClipboardCheck} label="WO Selesai" value={workOrders.filter((w) => ["COMPLETED", "CLOSED"].includes(w.status)).length} tone="primary" />
        <StatCard icon={Timer} label="MTTR" value="—" tone="accent" hint="Belum ada sumber durasi kerja tervalidasi" />
        <StatCard icon={Activity} label="MTBF" value="—" tone="warning" hint="Membutuhkan event kegagalan aset" />
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

        <ChartCard title="Uptime vs Target (belum tersedia)">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={[]}>
              <defs><linearGradient id="u2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(152 62% 40%)" stopOpacity={0.35} /><stop offset="100%" stopColor="hsl(152 62% 40%)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[90, 100]} tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tip} />
              <Area type="monotone" dataKey="uptime" stroke="hsl(152 62% 40%)" strokeWidth={2.5} fill="url(#u2)" />
              <Line type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tren Biaya Maintenance (belum tersedia)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={[]}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={(v) => `${v / 1000000}jt`} tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v) => idr(v)} contentStyle={tip} />
              <Legend />
              <Bar dataKey="labor" name="Tenaga Kerja" stackId="a" fill="hsl(214 95% 52%)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="parts" name="Suku Cadang" stackId="a" fill="hsl(199 89% 48%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="MTTR & MTBF (belum tersedia)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={[]}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="l" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tip} />
              <Legend />
              <Line yAxisId="l" type="monotone" dataKey="mttr" name="MTTR (jam)" stroke="hsl(38 92% 50%)" strokeWidth={2.5} />
              <Line yAxisId="r" type="monotone" dataKey="mtbf" name="MTBF (jam)" stroke="hsl(214 95% 52%)" strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
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
        <h3 className="mb-4 font-display text-base font-bold text-foreground">Report Library</h3>
        <Table
          columns={[
            { key: "name", header: "Nama Laporan" },
            { key: "act", header: "", render: (r) => <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => exportReport(r.name)}><Download className="h-3.5 w-3.5" /> Export</Button> },
          ]}
          rows={REPORTS.map((name) => ({ name }))}
          rowKey="name"
        />
      </Card>
    </Reveal>
  );
}
