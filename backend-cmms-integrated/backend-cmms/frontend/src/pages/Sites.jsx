import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Field, Input, Modal, Reveal } from "../components/kit";
import { createSite, listSites } from "../lib/organization";
import { listAssets } from "../lib/assets";
import { listWorkOrders } from "../lib/workorders";

const blankSite = { code: "", name: "", address: "", timezone: "Asia/Jakarta" };

export default function Sites() {
  const [loading, setLoading] = useState(true), [sites, setSites] = useState([]), [assets, setAssets] = useState([]), [orders, setOrders] = useState([]);
  const [form, setForm] = useState(null), [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const [siteResponse, assetResponse, orderResponse] = await Promise.all([listSites(), listAssets(), listWorkOrders()]); setSites(siteResponse.data || []); setAssets(assetResponse.data || []); setOrders(orderResponse.data || []); }
    catch (error) { toast.error(error.message || "Unable to load sites."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const activeStatuses = ["PENDING_APPROVAL", "OPEN", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"];
  const activeOrders = (siteId) => orders.filter((order) => order.site_id === siteId && activeStatuses.includes(order.status)).length;
  const totalActiveOrders = orders.filter((order) => activeStatuses.includes(order.status)).length;
  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error("Site code and name are required.");
    setSaving(true);
    try { await createSite({ ...form, code: form.code.trim(), name: form.name.trim(), address: form.address || null }); toast.success("Site created."); setForm(null); load(); }
    catch (error) { toast.error(error.message || "Unable to create site."); } finally { setSaving(false); }
  };
  const stats = useMemo(() => ({ total: sites.length, active: sites.filter((site) => site.is_active).length, assets: assets.length, workOrders: totalActiveOrders }), [sites, assets, totalActiveOrders]);
  return <Reveal className="mx-auto max-w-[1200px]"><div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Total Sites", stats.total, "text-primary"], ["Active Sites", stats.active, "text-emerald-600"], ["Total Assets", stats.assets, "text-cyan-600"], ["Active WO", stats.workOrders, "text-amber-600"]].map(([label, value, color]) => <Card key={label} className="flex min-h-[80px] items-center gap-3 p-4"><span className={`grid h-9 w-9 place-items-center rounded-lg bg-muted ${color}`}><Building2 className="h-4 w-4" /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="font-display text-xl font-bold">{value}</p></div></Card>)}</div><div className="mb-4 flex items-start justify-between"><div><h2 className="font-display text-lg font-bold">Manajemen Sites</h2><p className="text-xs text-muted-foreground">{sites.length} sites registered</p></div><Button className="px-3 py-2 text-xs" onClick={() => setForm({ ...blankSite })}><Plus className="h-3.5 w-3.5" />Add Site</Button></div><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{sites.map((site) => { const siteAssets = assets.filter((asset) => asset.site_id === site.id); return <Card key={site.id} className="min-h-[176px] p-4"><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="truncate text-xs font-bold">{site.name}</h3><p className="mt-0.5 font-mono text-[10px] text-primary">{site.code}</p></div><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${site.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{site.is_active ? "• Active" : "Inactive"}</span></div><p className="mt-1 line-clamp-2 min-h-[30px] text-[10px] text-slate-400">{site.address || "No address provided"}</p></div></div><div className="mt-4 grid grid-cols-3 border-t pt-3 text-center"><div><p className="text-xs font-bold">{site.code || "—"}</p><p className="text-[10px] text-slate-400">Code</p></div><div><p className="text-xs font-bold">{siteAssets.length}</p><p className="text-[10px] text-slate-400">Assets</p></div><div><p className="text-xs font-bold">{activeOrders(site.id)}</p><p className="text-[10px] text-slate-400">Active WO</p></div></div></Card>; })}{!loading && <button type="button" onClick={() => setForm({ ...blankSite })} className="grid min-h-[176px] place-items-center rounded-xl border border-dashed bg-card text-center text-slate-400 transition hover:border-primary hover:text-primary"><span><Plus className="mx-auto mb-2 h-5 w-5" /><span className="text-xs">Add new site</span></span></button>}</div><Modal open={Boolean(form)} onClose={() => setForm(null)} title="Add Site" footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button disabled={saving} onClick={save}>{saving ? "Saving..." : "Save Site"}</Button></>}>{form && <div className="space-y-4"><Field label="Site Code" required><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="JKT-01" /></Field><Field label="Site Name" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Address"><Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field><Field label="Timezone"><Input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></Field></div>}</Modal></Reveal>;
}
