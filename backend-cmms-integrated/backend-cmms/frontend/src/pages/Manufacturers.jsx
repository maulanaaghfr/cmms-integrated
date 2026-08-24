import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Factory, Boxes, Package } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../store/store";
import {
  PageHeader, Card, Table, Pill, Button, IconButton, SearchInput,
  Modal, ConfirmDialog, Field, Input, Reveal,
} from "../components/kit";
import {
  listManufacturers, createManufacturer, updateManufacturer, archiveManufacturer,
} from "../lib/manufacturers";
import { listAssets } from "../lib/assets";
import { listSpareParts } from "../lib/inventory";

function ScoreBar({ label, value }) {
  const color = value >= 85 ? "bg-[hsl(var(--success))]" : value >= 65 ? "bg-[hsl(var(--warning))]" : "bg-destructive";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

const blank = {
  name: "", contact_person: "", email: "", phone: "",
  address: "", website: "", quality_score: 80, delivery_score: 80, support_score: 80,
};

export default function Manufacturers() {
  const { user } = useApp();
  const canEdit = ["company_admin", "manager"].includes(user?.role);

  const [loading, setLoading] = useState(true);
  const [manufacturers, setManufacturers] = useState([]);
  const [assets, setAssets] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [view, setView] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mfgRes, assetsRes, partsRes] = await Promise.all([
        listManufacturers({ search: q || undefined }),
        listAssets({ per_page: 200 }),
        listSpareParts({ per_page: 200 }),
      ]);
      setManufacturers(mfgRes.data || []);
      setAssets(assetsRes.data || []);
      setSpareParts(partsRes.data || []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat data manufacturer.");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() =>
    manufacturers.filter((m) => (m.name || "").toLowerCase().includes(q.toLowerCase())),
    [manufacturers, q]
  );

  // Count assets/parts linked by manufacturer name (best-effort match)
  const linkedAssets = (name) => assets.filter((a) => (a.manufacturer || "").toLowerCase() === (name || "").toLowerCase());
  const linkedParts = (name) => spareParts.filter((p) => false); // spare_parts don't have manufacturer field yet

  const save = async () => {
    if (!form.name?.trim()) { toast.error("Nama manufacturer wajib diisi."); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      website: form.website || null,
      quality_score: Number(form.quality_score) || 80,
      delivery_score: Number(form.delivery_score) || 80,
      support_score: Number(form.support_score) || 80,
    };
    try {
      if (form.id) {
        await updateManufacturer(form.id, payload);
        toast.success("Manufacturer diperbarui.");
      } else {
        await createManufacturer(payload);
        toast.success("Manufacturer ditambahkan.");
      }
      setForm(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menyimpan manufacturer.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDel = async () => {
    try {
      await archiveManufacturer(del.id);
      toast.success("Manufacturer diarsipkan.");
      setDel(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menghapus manufacturer.");
    }
  };

  const columns = [
    {
      key: "name", header: "Manufacturer", render: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Factory className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.website || "-"}</div>
          </div>
        </div>
      ),
    },
    { key: "contact", header: "Kontak", render: (r) => <span className="text-xs text-muted-foreground">{r.contact_person || "-"} · {r.phone || "-"}</span> },
    { key: "assets", header: "Asset Terkait", render: (r) => <Pill tone="primary">{linkedAssets(r.name).length}</Pill> },
    { key: "quality", header: "Quality", render: (r) => <span className="text-xs font-semibold text-foreground">{r.quality_score}%</span> },
    {
      key: "act", header: "", render: (r) => (
        <div className="flex justify-end gap-1.5">
          <IconButton onClick={() => setView(r)}><Factory className="h-4 w-4" /></IconButton>
          {canEdit && <IconButton onClick={() => setForm({ ...blank, ...r })}><Pencil className="h-4 w-4" /></IconButton>}
          {canEdit && <IconButton onClick={() => setDel(r)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></IconButton>}
        </div>
      ),
    },
  ];

  return (
    <Reveal>
      <PageHeader
        title="Manufacturers"
        subtitle="Master data manufacturer/supplier — terhubung ke asset & spare part."
        action={canEdit && (
          <Button onClick={() => setForm({ ...blank })}>
            <Plus className="h-4 w-4" /> Tambah Manufacturer
          </Button>
        )}
      />
      <Card>
        <div className="mb-4"><SearchInput value={q} onChange={setQ} placeholder="Cari manufacturer..." /></div>
        <Table columns={columns} rows={rows} empty={loading ? "Memuat..." : "Belum ada manufacturer."} />
      </Card>

      {/* Form Modal */}
      <Modal
        open={!!form} onClose={() => setForm(null)}
        title={form?.id ? "Edit Manufacturer" : "Tambah Manufacturer"} wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>Batal</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </>
        }
      >
        {form && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nama Manufacturer" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Kontak Person">
              <Input value={form.contact_person || ""} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Telepon">
              <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Alamat">
              <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="Website">
              <Input value={form.website || ""} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </Field>
            <Field label="Quality Score (0-100)">
              <Input type="number" min="0" max="100" value={form.quality_score} onChange={(e) => setForm({ ...form, quality_score: e.target.value })} />
            </Field>
            <Field label="Delivery Score (0-100)">
              <Input type="number" min="0" max="100" value={form.delivery_score} onChange={(e) => setForm({ ...form, delivery_score: e.target.value })} />
            </Field>
            <Field label="Support Score (0-100)">
              <Input type="number" min="0" max="100" value={form.support_score} onChange={(e) => setForm({ ...form, support_score: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      {/* View Modal */}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.name} wide>
        {view && (
          <div className="space-y-4">
            <div className="rounded-xl border p-3 text-sm text-foreground">
              {view.contact_person || "-"} · {view.email || "-"} · {view.phone || "-"}<br />
              <span className="text-xs text-muted-foreground">{view.address || "-"}</span>
            </div>
            <div className="space-y-3 rounded-xl border p-3">
              <p className="text-xs font-semibold text-muted-foreground">Performance Tracking</p>
              <ScoreBar label="Quality" value={view.quality_score} />
              <ScoreBar label="Delivery Time" value={view.delivery_score} />
              <ScoreBar label="Support" value={view.support_score} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-3 text-center">
                <Boxes className="mx-auto h-5 w-5 text-primary" />
                <p className="mt-1 font-display text-xl font-extrabold text-foreground">{linkedAssets(view.name).length}</p>
                <p className="text-xs text-muted-foreground">Asset terkait</p>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <Package className="mx-auto h-5 w-5 text-accent" />
                <p className="mt-1 font-display text-xl font-extrabold text-foreground">{linkedParts(view.name).length}</p>
                <p className="text-xs text-muted-foreground">Spare part terkait</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} onConfirm={confirmDel}
        title="Arsipkan Manufacturer" message={`Arsipkan "${del?.name}"?`}
      />
    </Reveal>
  );
}
