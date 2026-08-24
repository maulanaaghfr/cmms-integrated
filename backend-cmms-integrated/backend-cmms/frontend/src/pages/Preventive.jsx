import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock, CheckCircle2, ClipboardList, Clock3, Eye, MoreVertical, Pause,
  Pencil, Play, Plus, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Button, Card, ConfirmDialog, Field, IconButton, Input, Modal, PageHeader,
  Pill, Reveal, SearchInput, Select, StatCard, Table, Tabs, Textarea,
} from "../components/kit";
import {
  archivePmSchedule, archivePmTemplate, createPmSchedule, createPmTemplate,
  getPmSchedule, listPmOccurrences, listPmSchedules, listPmTemplates,
  pausePmSchedule, resumePmSchedule, updatePmSchedule, updatePmTemplate,
} from "../lib/preventive";
import { listAssets, listSites } from "../lib/assets";
import { listTeams, listUsers } from "../lib/organization";

/* ------------------------------------------------------------------ */
/*  Constants — mirror PmController@templateData / @scheduleData.     */
/*  pm_templates has NO category column and NO tasks column — only    */
/*  site_id + work_instructions (free text). pm_schedules has NO      */
/*  team column. Fields the design mockup shows that don't map to a   */
/*  real column are adapted below (see notes inline) instead of being */
/*  silently dropped on save.                                         */
/* ------------------------------------------------------------------ */

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const INTERVAL_LABELS = { DAY: "Days", WEEK: "Weeks", MONTH: "Months", YEAR: "Years" };
const INTERVAL_UNIT_LABEL = (unit) => INTERVAL_LABELS[unit] || unit;
const SCHEDULE_MODE_LABELS = { FIXED: "Fixed Schedule", COMPLETION_BASED: "Completion-based" };

const templateBlank = {
  site_id: "", name: "", description: "", priority: "MEDIUM", estimated_hours: "",
  status: "ACTIVE", tasks: [""],
};

const scheduleBlank = {
  pm_template_id: "", site_id: "", asset_id: "", name: "",
  schedule_mode: "FIXED", timezone: "Asia/Jakarta",
  start_date: new Date().toISOString().slice(0, 10),
  interval_unit: "MONTH", interval_value: 1,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const itemData = (response) => response?.data || [];
const shortDate = (value) => (value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const longDateTime = (value) => (value ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

const scheduleTone = (status) => ({ ACTIVE: "success", PAUSED: "warning", DRAFT: "muted", RETIRED: "muted" }[status] || "primary");
const priorityTone = (priority) => (priority === "CRITICAL" ? "danger" : priority === "HIGH" ? "warning" : priority === "LOW" ? "muted" : "accent");

// pm_templates.work_instructions is the only free-text column available, so
// the design's "Maintenance Tasks" list is stored there as a numbered list
// and parsed back out when editing — nothing is invented or discarded.
const tasksToInstructions = (tasks) => tasks.map((t) => t.trim()).filter(Boolean).map((t, i) => `${i + 1}. ${t}`).join("\n");
const instructionsToTasks = (text) => {
  if (!text) return [""];
  const lines = text.split("\n").map((l) => l.replace(/^\s*\d+\.\s*/, "").trim()).filter(Boolean);
  return lines.length ? lines : [""];
};

/* ------------------------------------------------------------------ */
/*  Small local component: row action dropdown (View/Edit/Pause/Retire) */
/*  kit.jsx has no dropdown menu primitive, so this is self-contained.  */
/* ------------------------------------------------------------------ */

function ActionMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <IconButton title="Actions" className="h-8 w-8" onClick={() => setOpen((v) => !v)}>
        <MoreVertical className="h-4 w-4" />
      </IconButton>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border bg-card shadow-xl">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { setOpen(false); item.onClick(); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition hover:bg-muted ${item.danger ? "text-destructive" : "text-foreground"}`}
            >
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Preventive() {
  const [tab, setTab] = useState("templates");
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [assets, setAssets] = useState([]);
  const [sites, setSites] = useState([]);
  const [teams, setTeams] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [query, setQuery] = useState("");
  const [templateStatusFilter, setTemplateStatusFilter] = useState("ALL");
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState("ALL");
  const [scheduleSiteFilter, setScheduleSiteFilter] = useState("ALL");
  const [scheduleForm, setScheduleForm] = useState(null);
  const [templateForm, setTemplateForm] = useState(null);
  const [viewSchedule, setViewSchedule] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [pauseTarget, setPauseTarget] = useState(null);
  const [pauseReason, setPauseReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scheduleResponse, templateResponse, occurrenceResponse, assetResponse, siteResponse, teamResponse, userResponse] = await Promise.all([
        listPmSchedules(), listPmTemplates(), listPmOccurrences(), listAssets(), listSites(), listTeams(),
        listUsers({ role: "TECHNICIAN", status: "ACTIVE" }),
      ]);
      setSchedules(itemData(scheduleResponse));
      setTemplates(itemData(templateResponse));
      setOccurrences(itemData(occurrenceResponse));
      setAssets(itemData(assetResponse));
      setSites(itemData(siteResponse));
      setTeams(itemData(teamResponse));
      setTechnicians(itemData(userResponse));
    } catch (error) {
      toast.error(error.message || "Failed to load preventive maintenance data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ---------------------------- lookups ---------------------------- */

  const assetName = (id) => assets.find((item) => item.id === id)?.name || "—";
  const assetSiteId = (id) => assets.find((item) => item.id === id)?.site_id;
  const siteName = (id) => sites.find((item) => item.id === id)?.name || "—";
  const templateName = (id) => templates.find((item) => item.id === id)?.name || "—";
  const templateOf = (id) => templates.find((item) => item.id === id);

  const assetsForSite = (siteId) => assets.filter((item) => !siteId || item.site_id === siteId);
  const templatesForSite = (siteId) => templates.filter((item) => !siteId || item.site_id === siteId).filter((item) => item.status === "ACTIVE");

  const schedulesFor = (templateId) => schedules.filter((s) => s.pm_template_id === templateId);

  /* ---------------------------- derived ----------------------------- */

  const filteredTemplates = useMemo(() => templates
    .filter((item) => templateStatusFilter === "ALL" || item.status === templateStatusFilter)
    .filter((item) => `${item.name} ${item.description || ""}`.toLowerCase().includes(query.toLowerCase())),
  [templates, query, templateStatusFilter]);

  const templateStatusCounts = useMemo(() => ({
    ALL: templates.length,
    DRAFT: templates.filter((t) => t.status === "DRAFT").length,
    ACTIVE: templates.filter((t) => t.status === "ACTIVE").length,
    RETIRED: templates.filter((t) => t.status === "RETIRED").length,
  }), [templates]);

  const filteredSchedules = useMemo(() => schedules
    .filter((item) => scheduleStatusFilter === "ALL" || item.status === scheduleStatusFilter)
    .filter((item) => scheduleSiteFilter === "ALL" || item.site_id === scheduleSiteFilter)
    .filter((item) => `${item.name} ${templateName(item.pm_template_id)} ${assetName(item.asset_id)}`.toLowerCase().includes(query.toLowerCase())),
  [schedules, query, scheduleStatusFilter, scheduleSiteFilter, templates, assets]);

  const filteredOccurrences = useMemo(() => occurrences.filter((item) =>
    `${templateName(item.pm_template_id)} ${assetName(item.asset_id)}`.toLowerCase().includes(query.toLowerCase())), [occurrences, query, templates, assets]);

  const pmStats = useMemo(() => {
    const active = schedules.filter((item) => item.status === "ACTIVE").length;
    const now = new Date();
    const weekLater = new Date(now); weekLater.setDate(now.getDate() + 7);
    const dueSoon = schedules.filter((item) => {
      if (!item.next_due_at) return false;
      const due = new Date(item.next_due_at);
      return due >= now && due <= weekLater;
    }).length;
    const completed = occurrences.filter((item) => item.status === "COMPLETED").length;
    const complianceRate = occurrences.length ? Math.round((completed / occurrences.length) * 100) : 0;
    return { active, dueSoon, complianceRate };
  }, [schedules, occurrences]);

  /* --------------------------- template CRUD ------------------------ */

  const openTemplate = (item = null) => setTemplateForm(item
    ? {
      ...templateBlank, ...item,
      estimated_hours: item.estimated_duration_minutes ? String(item.estimated_duration_minutes / 60) : "",
      tasks: instructionsToTasks(item.work_instructions),
    }
    : { ...templateBlank, site_id: sites[0]?.id || "" });

  const setTask = (index, value) => setTemplateForm((form) => ({ ...form, tasks: form.tasks.map((t, i) => (i === index ? value : t)) }));
  const addTask = () => setTemplateForm((form) => ({ ...form, tasks: [...form.tasks, ""] }));
  const removeTask = (index) => setTemplateForm((form) => ({ ...form, tasks: form.tasks.filter((_, i) => i !== index) }));

  const saveTemplate = async () => {
    if (!templateForm.site_id || !templateForm.name.trim()) {
      toast.error("Site and template name are required.");
      return;
    }
    setSaving(true);
    // pm_templates.code is required + unique by the backend but isn't part of
    // this design — generate a stable, human-readable one from the name so
    // the person never has to think about it.
    const code = templateForm.code || `${templateForm.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 50)}-${Date.now().toString(36).toUpperCase()}`;
    const payload = {
      site_id: templateForm.site_id, code, name: templateForm.name.trim(),
      description: templateForm.description || null, priority: templateForm.priority,
      estimated_duration_minutes: templateForm.estimated_hours ? Math.round(Number(templateForm.estimated_hours) * 60) : null,
      work_instructions: tasksToInstructions(templateForm.tasks) || null, status: templateForm.status,
    };
    try {
      if (templateForm.id) await updatePmTemplate(templateForm.id, payload);
      else await createPmTemplate(payload);
      toast.success(templateForm.id ? "Template updated." : "Template created.");
      setTemplateForm(null);
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to save the template.");
    } finally { setSaving(false); }
  };

  const activateTemplate = async (template) => {
    try {
      await updatePmTemplate(template.id, { status: "ACTIVE" });
      toast.success("Template activated.");
      await load();
    } catch (error) { toast.error(error.message || "Failed to activate the template."); }
  };

  /* --------------------------- schedule CRUD ------------------------- */

  const openSchedule = (schedule = null, template = null) => {
    const siteId = schedule?.site_id || template?.site_id || "";
    const site = sites.find((item) => item.id === siteId);
    const trigger = schedule?.triggers?.[0] || {};
    setScheduleForm({
      ...scheduleBlank, ...schedule,
      pm_template_id: schedule?.pm_template_id || template?.id || "",
      site_id: siteId,
      timezone: schedule?.timezone || site?.timezone || "Asia/Jakarta",
      start_date: schedule?.start_date?.slice(0, 10) || scheduleBlank.start_date,
      interval_unit: trigger.interval_unit || "MONTH",
      interval_value: trigger.interval_value || 1,
      fixed_local_time: trigger.fixed_local_time?.slice(0, 5) || "08:00",
    });
  };

  // Site is derived from whichever of Template / Asset is picked — the
  // design has no visible Site field, but pm_schedules.site_id is required
  // and must match both the template's and the asset's site.
  const chooseTemplate = (templateId) => {
    const template = templateOf(templateId);
    setScheduleForm((form) => ({
      ...form, pm_template_id: templateId, site_id: template?.site_id || form.site_id,
      asset_id: assets.find((a) => a.id === form.asset_id)?.site_id === template?.site_id ? form.asset_id : "",
    }));
  };
  const chooseAsset = (assetId) => {
    const site = assetSiteId(assetId);
    setScheduleForm((form) => ({
      ...form, asset_id: assetId, site_id: form.pm_template_id ? form.site_id : site || form.site_id,
    }));
  };

  const openScheduleDetails = async (schedule) => {
    try {
      const response = await getPmSchedule(schedule.id);
      setViewSchedule(response?.data || schedule);
    } catch (error) {
      toast.error(error.message || "Failed to load schedule details.");
    }
  };

  const editScheduleFromDetails = async (schedule) => {
    try {
      const response = await getPmSchedule(schedule.id);
      openSchedule(response?.data || schedule);
    } catch (error) {
      toast.error(error.message || "Failed to load schedule details.");
    }
  };

  const saveSchedule = async () => {
    if (!scheduleForm.name.trim() || !scheduleForm.site_id || !scheduleForm.asset_id || !scheduleForm.pm_template_id) {
      toast.error("Template, asset, and schedule name are required.");
      return;
    }
    setSaving(true);
    const code = scheduleForm.code || `${scheduleForm.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 50)}-${Date.now().toString(36).toUpperCase()}`;
    const payload = {
      pm_template_id: scheduleForm.pm_template_id, site_id: scheduleForm.site_id, asset_id: scheduleForm.asset_id,
      code, name: scheduleForm.name.trim(), schedule_mode: scheduleForm.schedule_mode,
      timezone: scheduleForm.timezone, start_date: scheduleForm.start_date,
      status: scheduleForm.id ? scheduleForm.status : "ACTIVE",
      trigger: {
        interval_unit: scheduleForm.interval_unit,
        interval_value: Number(scheduleForm.interval_value),
        fixed_local_time: scheduleForm.fixed_local_time || null,
      },
    };
    try {
      if (scheduleForm.id) await updatePmSchedule(scheduleForm.id, payload);
      else await createPmSchedule(payload);
      toast.success(scheduleForm.id ? "Schedule updated." : "Schedule created.");
      setScheduleForm(null);
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to save the schedule.");
    } finally { setSaving(false); }
  };

  const togglePause = async (schedule) => {
    try {
      if (schedule.status === "PAUSED") {
        await resumePmSchedule(schedule.id);
        toast.success("Schedule resumed.");
      } else {
        if (!pauseReason.trim()) { toast.error("A pause reason is required."); return; }
        await pausePmSchedule(schedule.id, { reason: pauseReason.trim() });
        setPauseTarget(null); setPauseReason(""); toast.success("Schedule paused.");
      }
      await load();
    } catch (error) { toast.error(error.message || "Failed to change the schedule status."); }
  };

  const confirmDelete = async () => {
    try {
      if (deleting.kind === "schedule") await archivePmSchedule(deleting.item.id);
      else await archivePmTemplate(deleting.item.id);
      toast.success(`${deleting.kind === "schedule" ? "Schedule" : "Template"} retired.`);
      setDeleting(null);
      await load();
    } catch (error) { toast.error(error.message || "Failed to retire this item."); }
  };

  /* ------------------------------ table columns ---------------------- */

  const scheduleColumns = [
    { key: "name", header: "Name", render: (item) => <span className="font-semibold">{item.name}</span> },
    { key: "template", header: "Template", render: (item) => templateName(item.pm_template_id) },
    { key: "asset", header: "Asset", render: (item) => assetName(item.asset_id) },
    { key: "site", header: "Site", render: (item) => siteName(item.site_id) },
    { key: "trigger", header: "Trigger", render: (item) => item.triggers?.[0] ? `Every ${item.triggers[0].interval_value} ${INTERVAL_UNIT_LABEL(item.triggers[0].interval_unit)}` : "—" },
    { key: "status", header: "Status", render: (item) => <Pill tone={scheduleTone(item.status)}>{item.status}</Pill> },
    { key: "next_due_at", header: "Next Due", render: (item) => shortDate(item.next_due_at) },
    {
      key: "actions", header: "Action", render: (item) => (
        <ActionMenu items={[
          { label: "View", icon: <Eye className="h-3.5 w-3.5" />, onClick: () => openScheduleDetails(item) },
          { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => editScheduleFromDetails(item) },
          item.status === "PAUSED"
            ? { label: "Resume", icon: <Play className="h-3.5 w-3.5" />, onClick: () => togglePause(item) }
            : { label: "Pause", icon: <Pause className="h-3.5 w-3.5" />, onClick: () => setPauseTarget(item) },
          { label: "Retire", icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: () => setDeleting({ kind: "schedule", item }) },
        ]} />
      ),
    },
  ];

  const occurrenceColumns = [
    { key: "template", header: "Template", render: (item) => templateName(item.pm_template_id) },
    { key: "asset", header: "Asset", render: (item) => assetName(item.asset_id) },
    { key: "due_at", header: "Due", render: (item) => shortDate(item.due_at) },
    { key: "generated_at", header: "Generated", render: (item) => item.generated_at ? shortDate(item.generated_at) : "—" },
    { key: "completed_at", header: "Completed", render: (item) => item.completed_at ? shortDate(item.completed_at) : "—" },
    { key: "status", header: "Status", render: (item) => <Pill tone={scheduleTone(item.status) === "primary" ? "accent" : scheduleTone(item.status)}>{item.status}</Pill> },
  ];

  return (
    <Reveal className="mx-auto max-w-page">
      <PageHeader
        title="Preventive Maintenance"
        action={
          <Button
            className="h-9 px-3 text-xs"
            onClick={() => (tab === "schedules" ? openSchedule() : setTemplateForm({ ...templateBlank, site_id: sites[0]?.id || "" }))}
            disabled={!loading && sites.length === 0}
          >
            <Plus className="h-3.5 w-3.5" /> {tab === "schedules" ? "New Schedules" : "New template"}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={ClipboardList} label="Templates" value={templates.length} tone="primary" />
        <StatCard icon={CalendarClock} label="Active schedules" value={pmStats.active} tone="success" />
        <StatCard icon={Clock3} label="Due this week" value={pmStats.dueSoon} tone="warning" />
        <StatCard icon={CheckCircle2} label="Compliance rate" value={`${pmStats.complianceRate}%`} tone="accent" />
      </div>

      <Card className="p-3.5 lg:p-4">
        <div className="mb-4 flex flex-col gap-3 border-b border-border/70 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            tabs={[
              { key: "templates", label: "Templates" },
              { key: "schedules", label: "Schedules" },
              { key: "occurrences", label: "Occurrences" },
            ]}
            active={tab}
            onChange={setTab}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={tab === "schedules" ? "Search schedules..." : tab === "occurrences" ? "Search occurrences..." : "Search templates..."}
            />
            {tab === "schedules" && (
              <>
                <Select className="w-auto" value={scheduleStatusFilter} onChange={(e) => setScheduleStatusFilter(e.target.value)}>
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="DRAFT">Draft</option>
                  <option value="RETIRED">Retired</option>
                </Select>
                <Select className="w-auto" value={scheduleSiteFilter} onChange={(e) => setScheduleSiteFilter(e.target.value)}>
                  <option value="ALL">All Sites</option>
                  {sites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </>
            )}
          </div>
        </div>

        {tab === "templates" ? (
          <>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {[["ALL", "All"], ["DRAFT", "Draft"], ["ACTIVE", "Active"], ["RETIRED", "Retired"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTemplateStatusFilter(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    templateStatusFilter === key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/80 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label} {templateStatusCounts[key]}
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.map((item) => {
                const taskCount = instructionsToTasks(item.work_instructions).filter(Boolean).length;
                const scheduleCount = schedulesFor(item.id).length;
                const hours = item.estimated_duration_minutes ? (item.estimated_duration_minutes / 60) : null;
                return (
                  <div key={item.id} className="flex flex-col rounded-xl border border-border/80 bg-background p-4 transition hover:border-primary/40 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <Pill tone={scheduleTone(item.status)} className="text-[10px]">{item.status}</Pill>
                      <Pill tone={priorityTone(item.priority)} className="text-[10px]">{item.priority}</Pill>
                    </div>
                    <h3 className="mt-2 font-display text-sm font-bold text-foreground">{item.name}</h3>
                    {item.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}

                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{siteName(item.site_id)}</span>
                      {hours != null && <span>{hours % 1 === 0 ? hours : hours.toFixed(1)}h est.</span>}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{taskCount} task{taskCount === 1 ? "" : "s"}</span>
                      <span>{scheduleCount} schedule{scheduleCount === 1 ? "" : "s"}</span>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t pt-3">
                      <div className="flex gap-2">
                        <Button variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => openTemplate(item)}><Pencil className="h-3 w-3" /> Edit</Button>
                        {item.status === "RETIRED" ? (
                          <Button variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => activateTemplate(item)}>Activate</Button>
                        ) : (
                          <Button variant="ghost" className="h-7 px-2.5 text-xs hover:text-destructive" onClick={() => setDeleting({ kind: "template", item })}>Retire</Button>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground/70">Updated {shortDate(item.updated_at)}</span>
                    </div>
                  </div>
                );
              })}
              {!loading && filteredTemplates.length === 0 && (
                <div className="col-span-full py-10 text-center text-sm text-muted-foreground">No PM templates yet.</div>
              )}
            </div>
          </>
        ) : tab === "schedules" ? (
          <Table columns={scheduleColumns} rows={filteredSchedules} empty={loading ? "Loading..." : "No PM schedules yet."} />
        ) : (
          <Table columns={occurrenceColumns} rows={filteredOccurrences} empty={loading ? "Loading..." : "No PM occurrences yet."} />
        )}
      </Card>

      {/* ------------------------------ Template Modal ------------------------------ */}
      <Modal
        open={!!templateForm}
        onClose={() => setTemplateForm(null)}
        title={templateForm?.id ? "Edit PM Template" : "New PM Template"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTemplateForm(null)}>Cancel</Button>
            <Button onClick={saveTemplate} disabled={saving}>{saving ? "Saving..." : "Save Template"}</Button>
          </>
        }
      >
        {templateForm && (
          <div className="flex flex-col gap-4">
            <Field label="Template Name" required>
              <Input placeholder="e.g. CNC Machine Inspection" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
            </Field>
            <Field label="Description">
              <Textarea rows={3} placeholder="Describe the maintenance procedure and purpose..." value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Priority">
                <Select value={templateForm.priority} onChange={(e) => setTemplateForm({ ...templateForm, priority: e.target.value })}>
                  {PRIORITIES.map((item) => <option key={item} value={item}>{item.charAt(0) + item.slice(1).toLowerCase()}</option>)}
                </Select>
              </Field>
              <Field label="Estimated Hours">
                <Input type="number" min="0" step="0.5" placeholder="e.g. 2" value={templateForm.estimated_hours} onChange={(e) => setTemplateForm({ ...templateForm, estimated_hours: e.target.value })} />
              </Field>
            </div>
            <Field label="Site" required>
              <Select value={templateForm.site_id} onChange={(e) => setTemplateForm({ ...templateForm, site_id: e.target.value })}>
                <option value="">Select site</option>
                {sites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Maintenance Tasks">
              <div className="flex flex-col gap-2 rounded-xl border bg-background p-3">
                {templateForm.tasks.map((task, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
                    <Input className="flex-1" value={task} placeholder="Describe this task" onChange={(e) => setTask(index, e.target.value)} />
                    {templateForm.tasks.length > 1 && (
                      <IconButton title="Remove task" className="h-8 w-8 shrink-0" onClick={() => removeTask(index)}><X className="h-3.5 w-3.5" /></IconButton>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="ghost" className="mt-2 h-8 w-fit px-3 text-xs" onClick={addTask}><Plus className="h-3.5 w-3.5" /> Add Task</Button>
            </Field>
          </div>
        )}
      </Modal>

      {/* ------------------------------ Schedule Modal ------------------------------ */}
      <Modal
        open={!!scheduleForm}
        onClose={() => setScheduleForm(null)}
        title={scheduleForm?.id ? "Edit PM Schedule" : "New PM Schedule"}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setScheduleForm(null)}>Cancel</Button>
            <Button onClick={saveSchedule} disabled={saving}>{saving ? "Saving..." : scheduleForm?.id ? "Save Changes" : "Create Schedule"}</Button>
          </>
        }
      >
        {scheduleForm && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Schedule Name" required>
              <Input placeholder="e.g. Boiler B-01 Monthly Treatment" value={scheduleForm.name} onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })} />
            </Field>
            <div />
            <Field label="PM Template" required>
              <Select value={scheduleForm.pm_template_id} onChange={(e) => chooseTemplate(e.target.value)}>
                <option value="">Select template</option>
                {templatesForSite(scheduleForm.site_id || undefined).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Asset" required>
              <Select value={scheduleForm.asset_id} onChange={(e) => chooseAsset(e.target.value)}>
                <option value="">Select asset</option>
                {assetsForSite(scheduleForm.site_id || undefined).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Schedule Type">
              <Select value={scheduleForm.schedule_mode} onChange={(e) => setScheduleForm({ ...scheduleForm, schedule_mode: e.target.value })}>
                {Object.entries(SCHEDULE_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Every" required>
                <Input type="number" min="1" value={scheduleForm.interval_value} onChange={(e) => setScheduleForm({ ...scheduleForm, interval_value: e.target.value })} />
              </Field>
              <Field label="Unit">
                <Select value={scheduleForm.interval_unit} onChange={(e) => setScheduleForm({ ...scheduleForm, interval_unit: e.target.value })}>
                  {Object.entries(INTERVAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Start Date" required>
              <Input type="date" value={scheduleForm.start_date} onChange={(e) => setScheduleForm({ ...scheduleForm, start_date: e.target.value })} />
            </Field>
            {scheduleForm.id && (
              <Field label="Status">
                <Select value={scheduleForm.status} onChange={(e) => setScheduleForm({ ...scheduleForm, status: e.target.value })}>
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                </Select>
              </Field>
            )}
          </div>
        )}
      </Modal>

      {/* ------------------------------ View Schedule Modal ------------------------------ */}
      <Modal
        open={!!viewSchedule}
        onClose={() => setViewSchedule(null)}
        title="Schedule Details"
        footer={
          <>
            <Button variant="ghost" onClick={() => setViewSchedule(null)}>Close</Button>
            <Button onClick={() => { const target = viewSchedule; setViewSchedule(null); editScheduleFromDetails(target); }}>Edit</Button>
          </>
        }
      >
        {viewSchedule && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Pill tone={scheduleTone(viewSchedule.status)}>{viewSchedule.status}</Pill>
              <Pill tone="accent">{SCHEDULE_MODE_LABELS[viewSchedule.schedule_mode] || viewSchedule.schedule_mode}</Pill>
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-foreground">{viewSchedule.name}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div><p className="font-semibold uppercase text-muted-foreground">Template</p><p className="mt-1">{templateName(viewSchedule.pm_template_id)}</p></div>
              <div><p className="font-semibold uppercase text-muted-foreground">Asset</p><p className="mt-1">{assetName(viewSchedule.asset_id)}</p></div>
              <div><p className="font-semibold uppercase text-muted-foreground">Site</p><p className="mt-1">{siteName(viewSchedule.site_id)}</p></div>
              <div><p className="font-semibold uppercase text-muted-foreground">Timezone</p><p className="mt-1">{viewSchedule.timezone}</p></div>
              <div><p className="font-semibold uppercase text-muted-foreground">Trigger</p><p className="mt-1">{viewSchedule.triggers?.[0] ? `Every ${viewSchedule.triggers[0].interval_value} ${INTERVAL_UNIT_LABEL(viewSchedule.triggers[0].interval_unit)}` : "—"}</p></div>
              <div><p className="font-semibold uppercase text-muted-foreground">Local time</p><p className="mt-1">{viewSchedule.triggers?.[0]?.fixed_local_time?.slice(0, 5) || "—"}</p></div>
              <div><p className="font-semibold uppercase text-muted-foreground">Start date</p><p className="mt-1">{shortDate(viewSchedule.start_date)}</p></div>
              <div><p className="font-semibold uppercase text-muted-foreground">Next due</p><p className="mt-1">{longDateTime(viewSchedule.next_due_at)}</p></div>
              {viewSchedule.status === "PAUSED" && (
                <div className="col-span-2">
                  <p className="font-semibold uppercase text-muted-foreground">Pause reason</p>
                  <p className="mt-1">{viewSchedule.pause_reason || "—"}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!pauseTarget}
        onClose={() => setPauseTarget(null)}
        title="Pause PM Schedule"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPauseTarget(null)}>Cancel</Button>
            <Button onClick={() => togglePause(pauseTarget)}>Pause schedule</Button>
          </>
        }
      >
        <Field label="Reason" required>
          <Textarea value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Retire PM item"
        message={`Retire ${deleting?.kind === "schedule" ? "schedule" : "template"} "${deleting?.item?.name}"?`}
      />
    </Reveal>
  );
}
