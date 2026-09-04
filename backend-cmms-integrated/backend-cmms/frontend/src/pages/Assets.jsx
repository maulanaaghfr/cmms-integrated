import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, Eye, Boxes, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../store/store";
import {
  PageHeader, Card, Table, Pill, Button, IconButton, SearchInput,
  Modal, ConfirmDialog, Field, Input, Select, Textarea, Reveal, StatCard,
} from "../components/kit";
import {
  listAssets, getAsset, createAsset, updateAsset, archiveAsset,
  listAssetCategories, listSites, listLocations,
} from "../lib/assets";
import { AssetQr, printAssetQrLabel } from "../components/CodeTools";

/* Real DB enums — see database/migrations/tenant/..._create_organization_and_asset_tables.php */
const STATUSES = ["OPERATIONAL", "UNDER_MAINTENANCE", "DOWN", "STANDBY", "OUT_OF_SERVICE"];
const STATUS_LABEL = {
  OPERATIONAL: "Operational", UNDER_MAINTENANCE: "Dalam Perawatan", DOWN: "Down",
  STANDBY: "Standby", OUT_OF_SERVICE: "Tidak Digunakan",
};
const STATUS_TONE = {
  OPERATIONAL: "success", UNDER_MAINTENANCE: "warning", DOWN: "danger",
  STANDBY: "muted", OUT_OF_SERVICE: "muted",
};
const CRITICALITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const CRIT_TONE = { LOW: "muted", MEDIUM: "accent", HIGH: "warning", CRITICAL: "danger" };

const blank = {
  site_id: "", location_id: "", asset_category_id: "", code: "", name: "",
  description: "", status: "OPERATIONAL", criticality: "MEDIUM",
  manufacturer: "", model: "", serial_number: "", installation_date: "",
  barcode: "", request_approval_required: false,
};

export default function Assets() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canEdit = user?.role === "company_admin" || user?.role === "manager";

  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sites, setSites] = useState([]);
  const [locations, setLocations] = useState([]);

  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [catF, setCatF] = useState("all");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState(null);
  const [del, setDel] = useState(null);

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || "-";
  const siteName = (id) => sites.find((s) => s.id === id)?.name || "-";
  const locationName = (id) => locations.find((l) => l.id === id)?.name || "-";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsRes, catRes, sitesRes, locRes] = await Promise.all([
        listAssets({ search: q || undefined, status: statusF !== "all" ? statusF : undefined }),
        listAssetCategories(),
        listSites(),
        listLocations(),
      ]);
      setAssets(assetsRes.data || []);
      setCategories(catRes.data || []);
      setSites(sitesRes.data || []);
      setLocations(locRes.data || []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat data aset.");
    } finally {
      setLoading(false);
    }
  }, [q, statusF]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => assets.filter((a) =>
    catF === "all" || a.asset_category_id === catF
  ), [assets, catF]);

  const stats = useMemo(() => {
    const down = assets.filter((a) => ["DOWN", "OUT_OF_SERVICE"].includes(a.status)).length;
    const maint = assets.filter((a) => a.status === "UNDER_MAINTENANCE").length;
    const critical = assets.filter((a) => a.criticality === "CRITICAL").length;
    return { down, maint, critical };
  }, [assets]);

  const openNew = () => setForm({ ...blank, site_id: sites[0]?.id || "" });
  const openEdit = (a) => setForm({ ...blank, ...a });
  const openView = async (a) => {
    setView(a); // show basic info immediately
    try {
      const full = await getAsset(a.id);
      setView(full.data); // then fill in work_orders/operators once loaded
    } catch (err) {
      toast.error(err.message || "Gagal memuat detail aset.");
    }
  };

  useEffect(() => {
    const assetId = searchParams.get("asset_id");
    const asset = assets.find((item) => item.id === assetId);
    if (asset && !view) openView(asset);
  }, [assets, searchParams, view]);

  const locationsForSite = (siteId) => locations.filter((l) => l.site_id === siteId);

  const save = async () => {
    if (!form.name.trim() || !form.code.trim() || !form.site_id || !form.asset_category_id) {
      toast.error("Kode, nama, site, dan kategori wajib diisi.");
      return;
    }
    setSaving(true);
    const payload = {
      site_id: form.site_id,
      location_id: form.location_id || null,
      asset_category_id: form.asset_category_id,
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description || null,
      status: form.status,
      criticality: form.criticality,
      manufacturer: form.manufacturer || null,
      model: form.model || null,
      serial_number: form.serial_number || null,
      installation_date: form.installation_date || null,
      barcode: form.barcode || null,
      request_approval_required: !!form.request_approval_required,
    };
    try {
      if (form.id) {
        await updateAsset(form.id, payload);
        toast.success("Aset diperbarui.");
      } else {
        await createAsset(payload);
        toast.success("Aset ditambahkan.");
      }
      setForm(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menyimpan aset.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDel = async () => {
    try {
      await archiveAsset(del.id);
      toast.success("Aset diarsipkan.");
      setDel(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menghapus aset.");
    }
  };

  const columns = [
    { key: "code", header: "Kode", render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.code}</span> },
    { key: "name", header: "Aset", render: (r) => <div><div className="font-semibold">{r.name}</div><div className="text-xs text-muted-foreground">{categoryName(r.asset_category_id)} · {siteName(r.site_id)}</div></div> },
    { key: "status", header: "Status", render: (r) => <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] || r.status}</Pill> },
    { key: "criticality", header: "Kritikalitas", render: (r) => <Pill tone={CRIT_TONE[r.criticality]}>{r.criticality}</Pill> },
    { key: "manufacturer", header: "Manufacturer", render: (r) => r.manufacturer || "-" },
    { key: "act", header: "", render: (r) => (
      <div className="flex justify-end gap-1.5">
        <IconButton onClick={(e) => { e.stopPropagation(); openView(r); }}><Eye className="h-4 w-4" /></IconButton>
        {canEdit && <IconButton onClick={(e) => { e.stopPropagation(); openEdit(r); }}><Pencil className="h-4 w-4" /></IconButton>}
        {canEdit && <IconButton onClick={(e) => { e.stopPropagation(); setDel(r); }} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></IconButton>}
      </div>
    ) },
  ];
  const newColumns = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span> },
    { key: "name", header: "Name", render: (r) => <span className="text-xs font-semibold">{r.name}</span> },
    { key: "status", header: "Status", render: (r) => <Pill className="px-2 py-0.5 text-[10px]" tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] || r.status}</Pill> },
    { key: "category", header: "Category", render: (r) => <span className="text-[11px] text-muted-foreground">{categoryName(r.asset_category_id)}</span> },
    { key: "site", header: "Site", render: (r) => <span className="text-[11px] text-muted-foreground">{siteName(r.site_id)}</span> },
    { key: "location", header: "Location", render: (r) => <span className="text-[11px] text-muted-foreground">{r.location_id ? locationName(r.location_id) : "—"}</span> },
    { key: "nextPm", header: "Next PM", render: (r) => <span className="whitespace-nowrap text-[11px] text-muted-foreground">{r.next_pm_date || r.next_pm_at || "—"}</span> },
  ];

  return (
    <Reveal>
      {sites.length === 0 && !loading && (
        <div className="mb-5 flex gap-2 rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10 p-3 text-sm text-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
          Belum ada Site untuk company ini. Aset butuh Site sebelum bisa dibuat.
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Boxes} label="Total assets" value={assets.length} tone="primary" />
        <StatCard icon={ShieldCheck} label="Operational" value={assets.filter((a) => a.status === "OPERATIONAL").length} tone="success" />
        <StatCard icon={AlertTriangle} label="Under maintenance" value={stats.maint} tone="warning" />
        <StatCard icon={AlertTriangle} label="Out of service" value={stats.down} tone="accent" />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-base font-bold">Assets</h2><p className="text-xs text-muted-foreground">{assets.length} assets</p></div>{canEdit && <Button className="px-3 py-2 text-xs" onClick={openNew} disabled={sites.length === 0}><Plus className="h-3.5 w-3.5" /> Add asset</Button>}</div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={q} onChange={setQ} placeholder="Cari nama, kode, serial, barcode..." />
          <div className="flex gap-2">
            <Select value={catF} onChange={(e) => setCatF(e.target.value)} className="w-40">
              <option value="all">Semua Kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="w-44">
              <option value="all">Semua Status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          </div>
        </div>
        <Table columns={newColumns} rows={rows} onRowClick={openView}
          empty={loading ? "Memuat..." : "Tidak ada aset ditemukan."} />
      </Card>

      {/* form modal */}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit Aset" : "Tambah Aset"} wide
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Batal</Button><Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}>
        {form && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Kode Aset" required><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="AST-001" /></Field>
              <Field label="Nama Aset" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Kategori" required>
                <Select value={form.asset_category_id} onChange={(e) => setForm({ ...form, asset_category_id: e.target.value })}>
                  <option value="">Pilih kategori</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Site" required>
                <Select value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value, location_id: "" })}>
                  <option value="">Pilih site</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Lokasi (opsional)">
                <Select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} disabled={!form.site_id}>
                  <option value="">Tanpa lokasi spesifik</option>
                  {locationsForSite(form.site_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
              <Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select></Field>
              <Field label="Kritikalitas"><Select value={form.criticality} onChange={(e) => setForm({ ...form, criticality: e.target.value })}>{CRITICALITIES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
              <Field label="Manufacturer"><Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></Field>
              <Field label="Model"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
              <Field label="Serial Number"><Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></Field>
              <Field label="Barcode"><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
              <Field label="Tanggal Instalasi"><Input type="date" value={form.installation_date || ""} onChange={(e) => setForm({ ...form, installation_date: e.target.value })} /></Field>
            </div>
            <Field label="Deskripsi"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></Field>
          </div>
        )}
      </Modal>

      {/* view modal */}
      <Modal open={!!view} onClose={() => setView(null)} title="Detail Aset" wide>
        {view && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-lg font-bold text-foreground">{view.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{view.code} · {view.manufacturer} {view.model}</div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Pill tone={STATUS_TONE[view.status]}>{STATUS_LABEL[view.status] || view.status}</Pill>
                <Pill tone={CRIT_TONE[view.criticality]}>{view.criticality}</Pill>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><div className="text-xs text-muted-foreground">Kategori</div><div className="font-medium text-foreground">{categoryName(view.asset_category_id)}</div></div>
              <div><div className="text-xs text-muted-foreground">Site</div><div className="font-medium text-foreground">{siteName(view.site_id)}</div></div>
              <div><div className="text-xs text-muted-foreground">Lokasi</div><div className="font-medium text-foreground">{view.location_id ? locationName(view.location_id) : "-"}</div></div>
              <div><div className="text-xs text-muted-foreground">Serial Number</div><div className="font-medium text-foreground">{view.serial_number || "-"}</div></div>
              <div><div className="text-xs text-muted-foreground">Barcode</div><div className="font-medium text-foreground">{view.barcode || "-"}</div></div>
              <div><div className="text-xs text-muted-foreground">Tgl Instalasi</div><div className="font-medium text-foreground">{view.installation_date || "-"}</div></div>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-4 sm:flex-row sm:items-start">
              <AssetQr value={`${window.location.origin}/assets/${view.id}`} size={150} />
              <div className="flex-1 text-center sm:text-left"><p className="text-sm font-semibold">QR Asset/Mesin</p><p className="mt-1 text-xs text-muted-foreground">Scan untuk membuka detail asset ini.</p><div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start"><Button onClick={() => navigate(`/work-orders?asset_id=${view.id}`)}>Buat Work Order</Button><Button variant="ghost" onClick={async () => { try { await printAssetQrLabel({ value: `${window.location.origin}/assets/${view.id}`, title: view.name, code: view.code }); } catch (err) { toast.error(err.message || "Gagal membuat label QR."); } }}>Print QR 1:1</Button></div></div>
            </div>
            {view.description && (
              <div><div className="mb-1 text-xs text-muted-foreground">Deskripsi</div><p className="text-sm text-foreground">{view.description}</p></div>
            )}
            {Array.isArray(view.work_orders) && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work Order Terkait ({view.work_orders.length})</div>
                {view.work_orders.length === 0
                  ? <p className="text-sm text-muted-foreground">Belum ada work order untuk aset ini.</p>
                  : <div className="divide-y rounded-xl border">{view.work_orders.map((w) => (
                      <div key={w.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span>{w.title}</span><Pill tone="primary">{w.status}</Pill>
                      </div>
                    ))}</div>}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={confirmDel}
        title="Arsipkan Aset" message={`Yakin ingin mengarsipkan "${del?.name}"? Aset akan disembunyikan dari daftar aktif.`} />
    </Reveal>
  );
}