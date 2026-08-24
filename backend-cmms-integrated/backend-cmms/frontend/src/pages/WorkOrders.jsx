import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, MapPin, Pause, Play, Plus, Sparkles, UserPlus, Users, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useApp } from "../store/store";
import { Button, Card, Field, Input, Modal, PageHeader, Pill, Reveal, SearchInput, Select, Table, Textarea } from "../components/kit";
import { listAssets } from "../lib/assets";
import { listSites, listUsers } from "../lib/organization";
import { createWorkOrder, getWorkOrder, listWorkOrders, startTimer, stopTimer, workOrderAction } from "../lib/workorders";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const ACTIVE = ["PENDING_APPROVAL", "OPEN", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"];
const STATUS_TABS = [
  ["", "All"],
  ["PENDING_APPROVAL", "Draft"],
  ["OPEN", "Scheduled"],
  ["IN_PROGRESS", "In Progress"],
  ["ON_HOLD", "On Hold"],
  ["COMPLETED", "Completed"],
  ["CANCELLED", "Canceled"],
];
const STATUS_LABEL = {
  PENDING_APPROVAL: "Draft", OPEN: "Scheduled", ASSIGNED: "Scheduled", IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold", COMPLETED: "Completed", CLOSED: "Completed", REJECTED: "Rejected", CANCELLED: "Canceled",
};
const tone = (value) => ({
  CRITICAL: "danger", HIGH: "warning", MEDIUM: "accent", LOW: "muted",
  COMPLETED: "success", CLOSED: "success", REJECTED: "danger", CANCELLED: "muted",
  IN_PROGRESS: "accent", ON_HOLD: "warning", OPEN: "primary", ASSIGNED: "primary", PENDING_APPROVAL: "muted",
}[value] || "primary");
const emptyForm = { asset_id: "", title: "", description: "", priority: "MEDIUM", due_at: "" };

function StatusDot({ status }) {
  const dotClass = ({
    IN_PROGRESS: "bg-blue-500", COMPLETED: "bg-emerald-500", CLOSED: "bg-emerald-500",
    ON_HOLD: "bg-orange-500", CANCELLED: "bg-rose-500", REJECTED: "bg-rose-500",
    PENDING_APPROVAL: "bg-muted-foreground/50", OPEN: "bg-sky-500", ASSIGNED: "bg-sky-500",
  }[status]) || "bg-muted-foreground/50";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />;
}

export default function WorkOrders() {
  const { user } = useApp();
  const role = String(user?._backend?.membership?.roleKey || user?.role || "").toUpperCase();
  const [orders, setOrders] = useState([]);
  const [assets, setAssets] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [aiPrioritas, setAiPrioritas] = useState(true);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [assignment, setAssignment] = useState("");
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
      const [ordersResponse, assetsResponse, usersResponse, sitesResponse] = await Promise.all([
        listWorkOrders({ status: status || undefined }), listAssets(), listUsers({ role: "TECHNICIAN", status: "ACTIVE" }), listSites(),
      ]);
      setOrders(ordersResponse?.data || []);
      setAssets(assetsResponse?.data || []);
      setTechnicians(usersResponse?.data || []);
      setSites(sitesResponse?.data || []);
    } catch (error) {
      toast.error(error.message || "Gagal memuat work order.");
    } finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => orders
    .filter((item) => `${item.work_order_number || ""} ${item.title || ""}`.toLowerCase().includes(query.toLowerCase()))
    .filter((item) => !priorityFilter || item.priority === priorityFilter),
    [orders, query, priorityFilter]);

  const assetName = (id) => assets.find((asset) => asset.id === id)?.name || id;
  const siteName = (id) => sites.find((site) => site.id === id)?.name || "—";
  const assignedName = (id) => technicians.find((member) => member.id === id)?.full_name || "—";

  const openDetail = async (order) => {
    try { const response = await getWorkOrder(order.id); setDetail(response.data); setAssignment(response.data.current_assignee_id || ""); setNote(""); setComment(""); }
    catch (error) { toast.error(error.message || "Gagal memuat detail work order."); }
  };
  const save = async () => {
    if (!form.asset_id || !form.title.trim() || !form.description.trim()) return toast.error("Aset, judul, dan deskripsi wajib diisi.");
    try { await createWorkOrder({ ...form, due_at: form.due_at || null }); toast.success("Work order dikirim untuk persetujuan manager."); setForm(null); load(); }
    catch (error) { toast.error(error.message || "Work order gagal dibuat."); }
  };
  const act = async (action, body = {}) => {
    if (!detail) return;
    try {
      if (action === "timer/start") await startTimer(detail.id, body.notes);
      else if (action === "timer/stop") await stopTimer(detail.id, body.notes);
      else await workOrderAction(detail.id, action, body);
      toast.success("Status work order diperbarui.");
      await openDetail(detail); load();
    } catch (error) { toast.error(error.message || "Aksi work order gagal."); }
  };
  const askAndAct = (action, field, label) => {
    const value = window.prompt(label);
    if (value === null || !value.trim()) return;
    act(action, { [field]: value.trim() });
  };

  const columns = [
    { key: "work_order_number", header: "ID", render: (item) => <span className="font-mono text-[11px] font-semibold text-muted-foreground">{item.work_order_number}</span> },
    { key: "title", header: "Title", render: (item) => <p className="font-semibold text-foreground">{item.title}</p> },
    {
      key: "status", header: "Status", render: (item) => (
        <Pill className="gap-1.5 px-2.5 py-1 text-[11px] font-semibold" tone={tone(item.status)}>
          <StatusDot status={item.status} /> {STATUS_LABEL[item.status] || item.status.replaceAll("_", " ")}
        </Pill>
      ),
    },
    { key: "priority", header: "Priority", render: (item) => <Pill className="px-2.5 py-1 text-[11px] font-semibold" tone={tone(item.priority)}>{item.priority.charAt(0) + item.priority.slice(1).toLowerCase()}</Pill> },
    { key: "site", header: "Site", render: (item) => <span className="text-xs text-muted-foreground">{siteName(item.site_id)}</span> },
    { key: "assigned", header: "Assigned", render: (item) => <span className="text-xs text-muted-foreground">{assignedName(item.current_assignee_id)}</span> },
    { key: "due_at", header: "Due", render: (item) => <span className="whitespace-nowrap text-xs text-muted-foreground">{item.due_at ? new Date(item.due_at).toLocaleDateString("en-CA") : "—"}</span> },
  ];

  return (
    <Reveal className="mx-auto max-w-[1200px]">
      <PageHeader title="Work Orders" />

      <Card className="min-w-0">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-foreground">Work orders</h2>
            <p className="text-xs text-muted-foreground">{orders.length} total orders</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-56"><SearchInput value={query} onChange={setQuery} placeholder="Search..." /></div>
            {canCreate && (
              <Button className="h-9 px-3.5 text-xs" onClick={() => setForm({ ...emptyForm, asset_id: assets[0]?.id || "" })}>
                <Plus className="h-3.5 w-3.5" /> New WO
              </Button>
            )}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {STATUS_TABS.map(([value, label]) => (
            <button key={label} type="button" onClick={() => setStatus(value)}
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold transition ${status === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-9 w-36 py-1.5 text-[11px]">
              <option value="">All Priorities</option>
              {PRIORITIES.map((item) => <option key={item} value={item}>{item.charAt(0) + item.slice(1).toLowerCase()}</option>)}
            </Select>
            <button type="button" onClick={() => setAiPrioritas((v) => !v)}
              className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition ${aiPrioritas ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}>
              <Sparkles className="h-3.5 w-3.5" /> AI Prioritas {aiPrioritas ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        <div className="min-w-0 overflow-x-auto">
          <Table columns={columns} rows={rows} onRowClick={openDetail} headerClassName="bg-muted/60" empty={loading ? "Loading..." : "No work orders found."} />
        </div>
      </Card>

      {/* Create Work Order */}
      <Modal open={!!form} onClose={() => setForm(null)} title="Buat Work Order" footer={<><Button variant="ghost" onClick={() => setForm(null)}>Batal</Button><Button onClick={save}>Kirim</Button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Aset" required>
              <Select value={form.asset_id} onChange={(event) => setForm({ ...form, asset_id: event.target.value })}>
                <option value="">Pilih aset</option>
                {assets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Judul" required><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
            <Field label="Deskripsi" required><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
            <Field label="Prioritas">
              <Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                {PRIORITIES.map((item) => <option key={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label="Batas waktu"><Input type="datetime-local" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} /></Field>
          </div>
        )}
      </Modal>

      {/* Work Order detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.work_order_number || "Detail Work Order"} wide>
        {detail && (
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <Pill className="gap-1.5 px-2.5 py-1 text-[11px] font-semibold" tone={tone(detail.status)}>
                  <StatusDot status={detail.status} /> {STATUS_LABEL[detail.status] || detail.status.replaceAll("_", " ")}
                </Pill>
                <Pill className="px-2.5 py-1 text-[11px] font-semibold" tone={tone(detail.priority)}>{detail.priority.charAt(0) + detail.priority.slice(1).toLowerCase()}</Pill>
              </div>
              <h3 className="font-display text-lg font-bold text-foreground">{detail.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{detail.description || "-"}</p>
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-xl bg-muted/30 p-4 sm:grid-cols-2">
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Site</p><p className="text-sm font-medium text-foreground">{siteName(detail.site_id)}</p></div>
              </div>
              <div className="flex items-start gap-2.5">
                <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Asset</p><p className="text-sm font-medium text-foreground">{assetName(detail.asset_id)}</p></div>
              </div>
              <div className="flex items-start gap-2.5">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Assigned to</p><p className="text-sm font-medium text-foreground">{assignedName(detail.current_assignee_id)}</p></div>
              </div>
              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Due date</p><p className="text-sm font-medium text-foreground">{detail.due_at ? new Date(detail.due_at).toLocaleDateString("en-CA") : "—"}</p></div>
              </div>
            </div>

            {isLeadership && ["OPEN", "ASSIGNED"].includes(detail.status) && (
              <div className="rounded-xl border p-3">
                <Field label="Tugaskan teknisi">
                  <Select value={assignment} onChange={(event) => setAssignment(event.target.value)} disabled={!technicians.length}>
                    <option value="">{technicians.length ? "Pilih teknisi" : "Belum ada teknisi aktif"}</option>
                    {technicians.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
                  </Select>
                </Field>
                {technicians.length ? (
                  <Button className="mt-3" onClick={() => assignment ? act("assign", { assignee_id: assignment }) : toast.error("Pilih teknisi terlebih dahulu.")}><UserPlus className="h-4 w-4" /> Tugaskan</Button>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">Tambahkan user dengan role <b>Technician</b> dan pilih primary site yang sama dengan aset ini terlebih dahulu. <Link to="/users" className="font-semibold text-primary hover:underline" onClick={() => setDetail(null)}>Buka Users</Link></p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {["MANAGER", "COMPANY_ADMIN"].includes(role) && detail.status === "PENDING_APPROVAL" && <><Button onClick={() => act("approve", { note: note || null })}><Check className="h-4 w-4" /> Setujui</Button><Button variant="danger" onClick={() => askAndAct("reject", "reason", "Alasan penolakan")}>Tolak</Button></>}
              {detail.status === "ASSIGNED" && (isLeadership || detail.current_assignee_id === user?.tenantUserId) && <Button onClick={() => act("acknowledge")}><Check className="h-4 w-4" /> Konfirmasi terima</Button>}
              {detail.status === "ASSIGNED" && (isLeadership || detail.current_assignee_id === user?.tenantUserId) && <Button onClick={() => act("start")}><Play className="h-4 w-4" /> Mulai</Button>}
              {detail.status === "IN_PROGRESS" && (isLeadership || detail.current_assignee_id === user?.tenantUserId) && <><Button onClick={() => act("timer/start")}><Play className="h-4 w-4" /> Mulai timer</Button><Button variant="ghost" onClick={() => act("timer/stop")}>Stop timer</Button><Button variant="ghost" onClick={() => askAndAct("hold", "reason", "Alasan ditunda")}><Pause className="h-4 w-4" /> Tunda</Button><Button onClick={() => askAndAct("complete", "completion_note", "Catatan penyelesaian")}><Check className="h-4 w-4" /> Selesaikan</Button></>}
              {detail.status === "ON_HOLD" && (isLeadership || detail.current_assignee_id === user?.tenantUserId) && <Button onClick={() => act("resume", { note: note || null })}><Play className="h-4 w-4" /> Lanjutkan</Button>}
              {detail.status === "COMPLETED" && (isLeadership || detail.requester_id === user?.tenantUserId) && <><Button onClick={() => act("verify")}><Check className="h-4 w-4" /> Verifikasi & tutup</Button><Button variant="danger" onClick={() => askAndAct("reject-completion", "reason", "Alasan penolakan")}>Tolak penyelesaian</Button></>}
              {isLeadership && ACTIVE.includes(detail.status) && <Button variant="danger" onClick={() => askAndAct("cancel", "reason", "Alasan pembatalan")}>Batalkan</Button>}
            </div>
            <Field label="Catatan untuk aksi (opsional)"><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">Comments</h4>
              <div className="space-y-2">
                {(detail.comments || []).map((item) => (
                  <div key={item.id} className="flex gap-2.5 rounded-xl bg-muted/30 p-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                      {(item.author_name || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{item.author_name} <span className="font-normal text-muted-foreground">{item.created_at ? new Date(item.created_at).toLocaleString("id-ID") : ""}</span></p>
                      <p className="mt-0.5 text-sm text-foreground">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment..." />
                <Button onClick={() => { if (!comment.trim()) return; act("comment", { body: comment.trim() }); setComment(""); }}>Send</Button>
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-semibold">Riwayat status</h4>
              {(detail.status_history || []).map((item) => (
                <p key={item.id} className="border-b py-2 text-sm">{item.from_status || "-"} → {item.to_status} <span className="text-muted-foreground">{item.occurred_at}</span></p>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </Reveal>
  );
}