import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, Database, Bell, Users, GitBranch, Clock, ArrowRight,
  ClipboardList, Wrench, Boxes, Package, ShoppingCart, Truck, LayoutGrid,
  Rows3, ListTree, Filter, X, CheckCircle2, RefreshCcw, Plus, Grid3x3, History,
} from "lucide-react";
import { Card, Pill } from "./kit";
import {
  FLOW_ROLES, FLOW_ENTITIES, ACTION_TYPES, MAIN_FLOW_STEPS, PARALLEL_FLOWS,
  NOTIFICATION_LOG, ROLE_INTERACTIONS, DATA_UPDATES_TIMELINE,
} from "../data/completeSystemFlow";

/* ------------------------------------------------------------------ */
/* Shared visuals                                                       */
/* ------------------------------------------------------------------ */

const ROLE_COLORS = {
  "Super Admin": { text: "text-violet-700", bg: "bg-violet-100", border: "border-violet-200", dot: "bg-violet-500" },
  "Company Admin": { text: "text-blue-700", bg: "bg-blue-100", border: "border-blue-200", dot: "bg-blue-500" },
  "Manager": { text: "text-cyan-700", bg: "bg-cyan-100", border: "border-cyan-200", dot: "bg-cyan-500" },
  "Technician": { text: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-200", dot: "bg-emerald-500" },
  "Operator": { text: "text-amber-700", bg: "bg-amber-100", border: "border-amber-200", dot: "bg-amber-500" },
  "Vendor": { text: "text-rose-700", bg: "bg-rose-100", border: "border-rose-200", dot: "bg-rose-500" },
  "Warehouse": { text: "text-slate-700", bg: "bg-slate-100", border: "border-slate-200", dot: "bg-slate-500" },
};

const ENTITY_ICONS = { ClipboardList, Wrench, Boxes, Package, ShoppingCart, Truck, Users };

const ACTION_TONE = { create: "primary", update: "accent", approve: "success", notify: "warning", execute: "muted" };

function RoleChip({ role, active, onClick, size = "sm" }) {
  const c = ROLE_COLORS[role] || { text: "text-muted-foreground", bg: "bg-muted", border: "border-border", dot: "bg-muted-foreground" };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 ${size === "sm" ? "py-0.5 text-[11px]" : "py-1.5 text-xs"} font-semibold transition active:scale-[0.97] ${
        active ? `${c.bg} ${c.text} ${c.border} ring-2 ring-offset-1 ring-primary/30` : `${c.bg} ${c.text} ${c.border} opacity-90 hover:opacity-100`
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {role}
    </button>
  );
}

function EntityChip({ entity, active, onClick }) {
  const Icon = ENTITY_ICONS[entity.icon] || Package;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition active:scale-[0.97] ${
        active ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20" : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3 w-3" />
      {entity.label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Legend                                                               */
/* ------------------------------------------------------------------ */

function Legend() {
  return (
    <Card className="!p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Roles</p>
          <div className="flex flex-wrap gap-1.5">
            {FLOW_ROLES.map((r) => (
              <span key={r} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ROLE_COLORS[r].bg} ${ROLE_COLORS[r].text} ${ROLE_COLORS[r].border}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${ROLE_COLORS[r].dot}`} />
                {r}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Action Types</p>
          <div className="flex flex-wrap gap-1.5">
            {ACTION_TYPES.map((a) => <Pill key={a.id} tone={a.tone}>{a.label}</Pill>)}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Notification Channels</p>
          <div className="flex flex-wrap gap-1.5">
            {["in-app", "email", "SMS", "push"].map((c) => <Pill key={c} tone="muted">{c}</Pill>)}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline view                                                        */
/* ------------------------------------------------------------------ */

function TimelineStep({ step, index, isLast, dimmed }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative flex gap-4 transition-opacity ${dimmed ? "opacity-35" : ""}`}>
      <div className="flex flex-col items-center">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
          {step.id}
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.24) }}
        className="soft-card mb-4 w-full rounded-2xl border border-border/70 bg-card"
      >
        <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {step.roles.map((r) => <RoleChip key={r} role={r} />)}
              <Pill tone={ACTION_TONE[step.action]} className="ml-1">{ACTION_TYPES.find((a) => a.id === step.action)?.label}</Pill>
            </div>
            <h4 className="font-display text-sm font-bold text-foreground">{step.title}</h4>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" /> {step.duration}</p>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="space-y-3 border-t border-border/60 px-4 py-3.5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">Aksi Aktor ({step.actor})</p>
                  <p className="mt-1 text-sm text-foreground">{step.actorAction}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-accent">Aksi Sistem</p>
                  <p className="mt-1 text-sm text-foreground">{step.systemAction}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {step.dataCreated?.length > 0 && (
                    <div className="flex items-start gap-1.5 rounded-lg bg-primary/5 px-2.5 py-2 text-xs text-foreground">
                      <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span><span className="font-semibold">Data Created:</span> {step.dataCreated.join("; ")}</span>
                    </div>
                  )}
                  {step.dataUpdated?.length > 0 && (
                    <div className="flex items-start gap-1.5 rounded-lg bg-accent/5 px-2.5 py-2 text-xs text-foreground">
                      <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                      <span><span className="font-semibold">Data Updated:</span> {step.dataUpdated.join("; ")}</span>
                    </div>
                  )}
                </div>
                {step.notifications?.length > 0 && (
                  <div className="space-y-1.5 rounded-lg bg-[hsl(var(--warning))]/5 px-2.5 py-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--warning))]"><Bell className="h-3.5 w-3.5" /> Notifikasi</p>
                    {step.notifications.map((n, i) => (
                      <p key={i} className="text-xs text-foreground">
                        → <span className="font-semibold">{n.to}</span> ({n.channel.join(", ")}): {n.text}
                      </p>
                    ))}
                  </div>
                )}
                <div className="flex items-start gap-1.5 rounded-lg bg-primary/5 px-2.5 py-2 text-xs text-foreground">
                  <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span><span className="font-semibold">Interaksi:</span> {step.interactions.join(" · ")}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {step.entities.map((eid) => {
                    const ent = FLOW_ENTITIES.find((e) => e.id === eid);
                    if (!ent) return null;
                    return <EntityChip key={eid} entity={ent} active={false} onClick={() => {}} />;
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Swimlane view                                                        */
/* ------------------------------------------------------------------ */

function SwimlaneView({ selectedRole, selectedEntity }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1100px]">
        <div className="grid grid-cols-[160px_repeat(10,1fr)] gap-1.5">
          <div />
          {MAIN_FLOW_STEPS.map((s) => (
            <div key={s.id} className="rounded-lg bg-muted/50 px-1.5 py-2 text-center">
              <span className="font-display text-[11px] font-bold text-foreground">Step {s.id}</span>
            </div>
          ))}
          {FLOW_ROLES.map((role) => {
            const rowDim = selectedRole && selectedRole !== role;
            const c = ROLE_COLORS[role];
            return (
              <React.Fragment key={role}>
                <div className={`flex items-center rounded-lg border px-2.5 py-2 ${c.bg} ${c.border} ${rowDim ? "opacity-40" : ""}`}>
                  <span className={`text-xs font-bold ${c.text}`}>{role}</span>
                </div>
                {MAIN_FLOW_STEPS.map((s) => {
                  const involved = s.roles.includes(role);
                  const entityMatch = !selectedEntity || s.entities.includes(selectedEntity);
                  const show = involved && entityMatch;
                  const dim = rowDim || (selectedEntity && !entityMatch);
                  return (
                    <div
                      key={s.id + role}
                      className={`flex min-h-[64px] items-center justify-center rounded-lg border px-1.5 py-1.5 text-center transition-opacity ${
                        show ? `${c.bg} ${c.border}` : "border-border/40 bg-muted/10"
                      } ${dim ? "opacity-25" : ""}`}
                    >
                      {show && (
                        <span className={`text-[10px] font-semibold leading-snug ${c.text}`}>
                          {s.actor === role ? "Aktor Utama" : "Terlibat"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Parallel flows view                                                  */
/* ------------------------------------------------------------------ */

function ParallelFlowCard({ flow }) {
  const [open, setOpen] = useState(false);
  const Icon = ENTITY_ICONS[flow.icon] || GitBranch;
  return (
    <Card className="!p-0 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4.5 w-4.5" /></div>
          <div>
            <h4 className="font-display text-sm font-bold text-foreground">{flow.title}</h4>
            <div className="mt-1 flex flex-wrap gap-1">
              {flow.roles.map((r) => <RoleChip key={r} role={r} />)}
            </div>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="border-t border-border/60 px-4 py-3.5">
              <p className="mb-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-foreground"><span className="font-semibold">Trigger:</span> {flow.trigger}</p>
              <div className="space-y-2">
                {flow.steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</div>
                    <p className="text-xs leading-relaxed text-foreground"><span className="font-semibold">{s.actor}:</span> {s.action}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Notification view                                                    */
/* ------------------------------------------------------------------ */

function NotificationView() {
  return (
    <Card className="overflow-hidden !p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40">
              <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground">Step</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground">Dari</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground">Ke</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground">Channel</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground">Trigger</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground">Isi</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_LOG.map((n, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                <td className="px-3 py-2.5 text-xs font-semibold text-foreground">{n.step}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{n.from}</td>
                <td className="px-3 py-2.5"><RoleChip role={n.to} active={false} onClick={() => {}} size="sm" /></td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {n.channel.map((c) => <Pill key={c} tone="muted">{c}</Pill>)}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{n.trigger}</td>
                <td className="px-3 py-2.5 text-xs text-foreground">{n.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Role Interactions Matrix view                                        */
/* ------------------------------------------------------------------ */

function FREQUENCY_TONE(freq) {
  if (freq.startsWith("Selalu")) return "success";
  if (freq.startsWith("Sering")) return "primary";
  return "muted";
}

function RoleInteractionsMatrix({ selectedRole }) {
  const rows = ROLE_INTERACTIONS.filter(
    (r) => !selectedRole || r.pair.includes(selectedRole)
  );
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Grid3x3 className="h-3.5 w-3.5" /> Matriks interaksi antar-peran: siapa berkomunikasi dengan siapa, jenis interaksi, frekuensi, dan data yang mengalir.
      </p>
      {rows.map((r, i) => (
        <Card key={i} className="!p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <RoleChip role={r.pair[0]} />
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              {r.pair[1] === "All Roles" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-foreground">All Roles</span>
              ) : (
                <RoleChip role={r.pair[1]} />
              )}
            </div>
            <Pill tone={FREQUENCY_TONE(r.frequency)}>{r.frequency}</Pill>
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Jenis Interaksi</p>
              <ul className="mt-1 space-y-0.5">
                {r.types.map((t, ti) => (
                  <li key={ti} className="text-xs text-foreground">• {t}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-accent">Data yang Mengalir</p>
              <p className="mt-1 text-xs text-foreground">{r.data}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data Updates Timeline view                                           */
/* ------------------------------------------------------------------ */

function DataUpdatesTimeline() {
  return (
    <Card className="overflow-hidden !p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40">
              <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground">Step</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground">Module/Sistem</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground">Perubahan Data</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground">Impact</th>
            </tr>
          </thead>
          <tbody>
            {DATA_UPDATES_TIMELINE.map((d, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                <td className="px-3 py-2.5 text-xs font-semibold text-foreground">{d.step}</td>
                <td className="px-3 py-2.5"><Pill tone="accent">{d.module}</Pill></td>
                <td className="px-3 py-2.5 text-xs text-foreground">{d.change}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{d.impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Main export                                                          */
/* ------------------------------------------------------------------ */

const VIEWS = [
  { id: "timeline", label: "Timeline", icon: ListTree },
  { id: "swimlane", label: "Swimlane per Role", icon: Rows3 },
  { id: "parallel", label: "Parallel Flows", icon: GitBranch },
  { id: "matrix", label: "Role Interactions Matrix", icon: Grid3x3 },
  { id: "notifications", label: "Notification Log", icon: Bell },
  { id: "dataupdates", label: "Data Updates Timeline", icon: History },
];

export default function CompleteSystemFlow() {
  const [view, setView] = useState("timeline");
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedEntity, setSelectedEntity] = useState(null);

  const filteredSteps = useMemo(() => {
    return MAIN_FLOW_STEPS.map((s) => ({
      ...s,
      dimmed:
        (selectedRole && !s.roles.includes(selectedRole)) ||
        (selectedEntity && !s.entities.includes(selectedEntity)),
    }));
  }, [selectedRole, selectedEntity]);

  const clearFilters = () => { setSelectedRole(null); setSelectedEntity(null); };

  return (
    <div className="space-y-6">
      <Card className="!p-4 border-primary/20 bg-primary/5">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><GitBranch className="h-4 w-4" /></div>
          <div>
            <Pill tone="primary" className="mb-1">Complete System Flow</Pill>
            <p className="text-sm text-foreground">
              Visualisasi end-to-end seluruh alur AITOMA CMMS: 10 langkah utama (request → work order → completion → rating) beserta 4 alur paralel (warehouse, vendor, asset health, preventive maintenance) yang melibatkan ketujuh peran sistem sekaligus.
            </p>
          </div>
        </div>
      </Card>

      <Legend />

      {/* Filters */}
      <Card className="!p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Filter className="h-3.5 w-3.5" /> Filter Role:</span>
          {FLOW_ROLES.map((r) => (
            <RoleChip key={r} role={r} active={selectedRole === r} onClick={() => setSelectedRole(selectedRole === r ? null : r)} size="md" />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Boxes className="h-3.5 w-3.5" /> Filter Entity:</span>
          {FLOW_ENTITIES.map((e) => (
            <EntityChip key={e.id} entity={e} active={selectedEntity === e.id} onClick={() => setSelectedEntity(selectedEntity === e.id ? null : e.id)} />
          ))}
          {(selectedRole || selectedEntity) && (
            <button onClick={clearFilters} className="ml-1 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" /> Reset
            </button>
          )}
        </div>
      </Card>

      {/* View switcher */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border/70 bg-card p-1.5 soft-card">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition active:scale-[0.98] ${
              view === v.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <v.icon className="h-3.5 w-3.5" /> {v.label}
          </button>
        ))}
      </div>

      <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        {view === "timeline" && (
          <div className="flex flex-col">
            {filteredSteps.map((s, i) => (
              <TimelineStep key={s.id} step={s} index={i} isLast={i === filteredSteps.length - 1} dimmed={s.dimmed} />
            ))}
          </div>
        )}

        {view === "swimlane" && (
          <Card>
            <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground"><LayoutGrid className="h-3.5 w-3.5" /> Klik chip role/entity di atas untuk highlight baris & langkah terkait.</p>
            <SwimlaneView selectedRole={selectedRole} selectedEntity={selectedEntity} />
          </Card>
        )}

        {view === "parallel" && (
          <div className="space-y-3">
            {PARALLEL_FLOWS.filter((f) => !selectedRole || f.roles.includes(selectedRole)).map((f) => (
              <ParallelFlowCard key={f.id} flow={f} />
            ))}
          </div>
        )}

        {view === "matrix" && <RoleInteractionsMatrix selectedRole={selectedRole} />}

        {view === "notifications" && <NotificationView />}

        {view === "dataupdates" && <DataUpdatesTimeline />}
      </motion.div>

      <Card className="!p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Ringkasan Dependency</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <p className="flex items-start gap-1.5 text-xs text-foreground"><RefreshCcw className="mt-0.5 h-3 w-3 shrink-0 text-accent" /> Step 3 (buat WO) bergantung pada Step 2 (approval request).</p>
          <p className="flex items-start gap-1.5 text-xs text-foreground"><RefreshCcw className="mt-0.5 h-3 w-3 shrink-0 text-accent" /> Step 6 (pakai part) memicu Warehouse Flow bila stok rendah.</p>
          <p className="flex items-start gap-1.5 text-xs text-foreground"><RefreshCcw className="mt-0.5 h-3 w-3 shrink-0 text-accent" /> Step 8 (approve completion) memicu Asset Health Flow & Preventive Flow.</p>
          <p className="flex items-start gap-1.5 text-xs text-foreground"><RefreshCcw className="mt-0.5 h-3 w-3 shrink-0 text-accent" /> Step 10 (rating) hanya berjalan setelah Step 8 selesai (WO Completed).</p>
        </div>
      </Card>
    </div>
  );
}
