import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Building2, History } from "lucide-react";
import { toast } from "sonner";
import { useApp, idr } from "../../store/store";
import {
  PageHeader, Card, Table, Pill, Button, IconButton, SearchInput,
  Modal, Reveal, statusTone,
} from "../../components/kit";
import { listPlatformTenants } from "../../lib/dashboard";
import { apiCentral } from "../../lib/api";

const prettyStatus = (s) =>
  String(s || "-").split("_").map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join(" ");

export default function Companies() {
  const { user } = useApp();
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState([]);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [view, setView] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPlatformTenants();
      setTenants(res.data || []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat data tenant.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    try {
      const res = await apiCentral("/platform/audit-logs", { params: { per_page: 50 } });
      setAuditLogs(res.data || []);
    } catch {
      setAuditLogs([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => tenants.filter((t) => {
    const matchStatus = statusF === "all" || t.status === statusF;
    const matchQ = (t.name || "").toLowerCase().includes(q.toLowerCase()) ||
      (t.code || "").toLowerCase().includes(q.toLowerCase());
    return matchStatus && matchQ;
  }), [tenants, q, statusF]);

  const columns = [
    {
      key: "name", header: "Perusahaan", render: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.code} · {r.industry || "-"}</div>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <Pill tone={statusTone(prettyStatus(r.status))}>{prettyStatus(r.status)}</Pill> },
    { key: "db_status", header: "Database", render: (r) => <Pill tone={r.database_status === "READY" ? "success" : "warning"}>{r.database_status || "-"}</Pill> },
    { key: "domain", header: "Domain", render: (r) => <span className="font-mono text-xs text-muted-foreground">{(r.domains || [])[0]?.domain || "-"}</span> },
    { key: "act", header: "", render: (r) => <IconButton onClick={(e) => { e.stopPropagation(); setView(r); }}><Eye className="h-4 w-4" /></IconButton> },
  ];

  return (
    <Reveal>
      <PageHeader
        title="Client Companies"
        subtitle="Kelola perusahaan klien yang berlangganan AITOMA."
        action={
          <Button variant="ghost" onClick={() => { loadAuditLogs(); setShowLog(true); }}>
            <History className="h-4 w-4" /> Audit Log
          </Button>
        }
      />
      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={q} onChange={setQ} placeholder="Cari perusahaan..." />
          <select
            value={statusF}
            onChange={(e) => setStatusF(e.target.value)}
            className="rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-primary sm:w-48"
          >
            <option value="all">Semua Status</option>
            {["TRIAL", "ACTIVE", "SUSPENDED", "CLOSED"].map((s) => (
              <option key={s} value={s}>{prettyStatus(s)}</option>
            ))}
          </select>
        </div>
        <Table columns={columns} rows={rows} onRowClick={setView} empty={loading ? "Memuat..." : "Tidak ada client."} />
      </Card>

      <Modal open={!!view} onClose={() => setView(null)} title="Detail Tenant">
        {view && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-display text-lg font-bold text-foreground">{view.name}</div>
              <Pill tone={statusTone(prettyStatus(view.status))}>{prettyStatus(view.status)}</Pill>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Kode", view.code], ["Industri", view.industry || "-"],
                ["Email", view.email || "-"], ["Timezone", view.timezone || "-"],
                ["Database", view.database_status || "-"],
                ["Domain", (view.domains || [])[0]?.domain || "-"],
                ["Dibuat", view.created_at ? new Date(view.created_at).toLocaleDateString("id-ID") : "-"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div className="font-medium text-foreground">{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showLog} onClose={() => setShowLog(false)} title="Audit Log — Platform" wide>
        <div className="space-y-2">
          {auditLogs.length === 0 && <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>}
          {auditLogs.map((l) => (
            <div key={l.id} className="rounded-lg border border-border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{l.event}</span>
                <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("id-ID")}</span>
              </div>
              <div className="text-xs text-muted-foreground">{l.auditable_type} #{l.auditable_id}</div>
            </div>
          ))}
        </div>
      </Modal>
    </Reveal>
  );
}
