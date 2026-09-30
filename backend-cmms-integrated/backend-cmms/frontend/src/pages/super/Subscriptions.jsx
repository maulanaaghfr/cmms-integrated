import React, { useCallback, useEffect, useState } from "react";
import { Archive, Building2, Check, CreditCard, Pencil, Plus, Power, RotateCcw, Trash2, Users2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { idr } from "../../store/store";
import { Button, Card, Field, Input, Modal, PageHeader, Pill, Reveal, StatCard } from "../../components/kit";
import { apiCentral } from "../../lib/api";
import { listPlatformTenants } from "../../lib/dashboard";

const emptyForm = { key: "", version_number: 1, name: "", description: "", monthly_price: "", annual_price: "", currency_code: "IDR", max_users: "", max_assets: "", max_sites: "", is_public: true };

const numberOrNull = (value) => {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
// Kosong = tanpa batas. Selain itu harus bilangan bulat >= 1.
const isValidLimit = (value) => value === "" || value === null || value === undefined || (Number.isInteger(Number(value)) && Number(value) >= 1);
const limitLabel = (value) => value ?? "∞";
const subscribersOf = (plan) => Number(plan?.subscriber_count || 0);

const limitFields = [
  ["max_users", "Maksimal User"],
  ["max_assets", "Maksimal Aset"],
  ["max_sites", "Maksimal Site"],
];

const statusTone = (status) => (status === "PUBLISHED" ? "success" : "muted");

const confirmCopy = (c) => {
  if (!c) return { title: "", text: "", action: "" };
  const n = subscribersOf(c.plan);
  const running = n > 0 ? ` ${n} subscriber yang sedang berjalan tetap memakai paketnya sampai akhir periode.` : "";
  if (c.type === "publish") return { title: "Publish package?", text: `"${c.plan.name}" akan tersedia untuk dipilih Company Admin.`, action: "Publish" };
  if (c.type === "delete") return { title: "Hapus package?", text: `"${c.plan.name}" akan dihapus (soft delete). Belum ada subscriber yang memakainya.`, action: "Hapus" };
  if (c.type === "save") return { title: "Simpan perubahan?", text: `Paket ini dipakai ${n} subscriber. Perubahan harga, layanan, dan limit baru berlaku di periode berikutnya. Company Admin akan diberi tahu lewat notifikasi dan email.`, action: "Simpan perubahan" };
  if (c.status === "INACTIVE") return { title: "Nonaktifkan package?", text: `"${c.plan.name}" tidak akan muncul di pilihan Company Admin.${running}`, action: "Nonaktifkan" };
  if (c.status === "ARCHIVED") return { title: "Arsipkan package?", text: `"${c.plan.name}" akan disembunyikan dari daftar dan dari pilihan Company Admin.${running}`, action: "Arsipkan" };
  if (c.status === "DRAFT") return { title: "Jadikan draft?", text: `"${c.plan.name}" tidak akan muncul di pilihan Company Admin.${running}`, action: "Jadikan draft" };
  return { title: "Aktifkan kembali?", text: `"${c.plan.name}" akan dipublish dan muncul lagi di pilihan Company Admin.`, action: "Aktifkan" };
};

export default function Subscriptions() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  // { type: "publish" | "delete" | "status" | "save", plan, status?, body? }
  const [confirm, setConfirm] = useState(null);
  const [confirming, setConfirming] = useState(false);
  // plan yang tidak boleh dihapus karena masih punya subscriber
  const [blocked, setBlocked] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, tenantsRes] = await Promise.all([
        apiCentral("/platform/plans", { params: { per_page: 100 } }),
        listPlatformTenants(),
      ]);
      setPlans(plansRes?.data || []);
      setTenants(tenantsRes?.data || []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat data subscription.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingPlan(null); setForm({ ...emptyForm }); };

  const openEdit = (plan) => {
    setEditingPlan(plan);
    setForm({
      key: plan.key || "",
      version_number: plan.version_number || 1,
      name: plan.name || "",
      description: plan.description || "",
      monthly_price: plan.monthly_price ?? "",
      annual_price: plan.annual_price ?? "",
      currency_code: plan.currency_code || "IDR",
      max_users: plan.max_users ?? "",
      max_assets: plan.max_assets ?? "",
      max_sites: plan.max_sites ?? "",
      is_public: Boolean(plan.is_public),
    });
  };

  const closeForm = () => { if (!saving) setForm(null); };
  const updateField = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const doSave = async (body) => {
    setSaving(true);
    try {
      if (editingPlan) { await apiCentral(`/platform/plans/${editingPlan.id}`, { method: "PUT", body }); toast.success("Package berhasil diperbarui."); }
      else { await apiCentral("/platform/plans", { method: "POST", body }); toast.success("Package berhasil dibuat sebagai DRAFT."); }
      setForm(null); setConfirm(null); await load();
    } catch (err) { toast.error(err.message || "Gagal menyimpan package."); }
    finally { setSaving(false); }
  };

  const savePlan = async () => {
    if (!form?.key.trim() || !form?.name.trim()) return toast.error("Key dan nama package wajib diisi.");
    if (form.monthly_price === "" || Number(form.monthly_price) < 0) return toast.error("Harga bulanan wajib diisi dan tidak boleh negatif.");
    if (form.annual_price !== "" && Number(form.annual_price) <= 0) return toast.error("Harga tahunan harus lebih dari 0, atau kosongkan.");
    if (!limitFields.every(([name]) => isValidLimit(form[name]))) return toast.error("Limit harus bilangan bulat minimal 1, atau kosongkan untuk tanpa batas.");
    if (form.currency_code.trim().length !== 3) return toast.error("Currency harus 3 huruf, contoh: IDR.");

    const body = {
      key: form.key.trim().toLowerCase().replace(/\s+/g, "-"),
      version_number: Number(form.version_number || 1),
      name: form.name.trim(),
      description: form.description.trim() || null,
      monthly_price: Number(form.monthly_price),
      annual_price: numberOrNull(form.annual_price),
      currency_code: form.currency_code.trim().toUpperCase(),
      max_users: numberOrNull(form.max_users),
      max_assets: numberOrNull(form.max_assets),
      max_sites: numberOrNull(form.max_sites),
      is_public: Boolean(form.is_public),
    };
    if (editingPlan && subscribersOf(editingPlan) > 0) return setConfirm({ type: "save", plan: editingPlan, body });
    await doSave(body);
  };

  const requestDelete = (plan) => {
    if (subscribersOf(plan) > 0) return setBlocked(plan);
    setConfirm({ type: "delete", plan });
  };

  const requestStatus = (plan, status) => { setBlocked(null); setConfirm({ type: "status", plan, status }); };

  const runConfirm = async () => {
    if (!confirm) return;
    if (confirm.type === "save") return doSave(confirm.body);
    const { type, plan, status } = confirm;
    setConfirming(true);
    try {
      if (type === "publish") {
        await apiCentral(`/platform/plans/${plan.id}/publish`, { method: "POST" });
        toast.success(`${plan.name} berhasil dipublish.`);
      } else if (type === "status") {
        await apiCentral(`/platform/plans/${plan.id}/status`, { method: "PATCH", body: { status } });
        toast.success(`Status ${plan.name} diubah menjadi ${status}.`);
      } else {
        await apiCentral(`/platform/plans/${plan.id}`, { method: "DELETE" });
        toast.success("Package berhasil dihapus.");
      }
      setConfirm(null); await load();
    } catch (err) {
      toast.error(err.message || "Aksi gagal dijalankan.");
    } finally { setConfirming(false); }
  };

  const visiblePlans = plans.filter((plan) => showArchived || plan.status !== "ARCHIVED");
  const activeTenants = tenants.filter((tenant) => tenant.status === "ACTIVE").length;
  const avgPrice = plans.length ? plans.reduce((sum, plan) => sum + Number(plan.monthly_price || 0), 0) / plans.length : 0;
  const copy = confirmCopy(confirm);
  const editingNote = editingPlan && (editingPlan.status !== "DRAFT" || subscribersOf(editingPlan) > 0);

  return <Reveal>
    <PageHeader title="Subscription Management" subtitle="Buat dan kelola paket harga, limit user, aset, site, serta status publik." action={<Button onClick={openCreate}><Plus className="h-4 w-4" />Tambah Package</Button>} />
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard icon={CreditCard} label="Total Plan" value={plans.length} tone="primary" />
      <StatCard icon={Building2} label="Tenant Aktif" value={activeTenants} tone="accent" />
      <StatCard icon={Wallet} label="Rata-rata Harga" value={idr(avgPrice)} tone="success" />
    </div>
    <label className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Tampilkan arsip</label>
    {loading && <p className="text-sm text-muted-foreground">Memuat...</p>}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {visiblePlans.map((plan) => <Card key={plan.id} className="flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-lg font-bold text-foreground">{plan.name}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Pill tone={statusTone(plan.status)}>{plan.status}</Pill>
              {plan.is_public && <Pill tone="primary">PUBLIC</Pill>}
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" className="!p-2" title="Edit" onClick={() => openEdit(plan)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" className="!p-2 !text-destructive" title="Hapus" onClick={() => requestDelete(plan)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="mt-3 font-display text-3xl font-extrabold text-foreground">{idr(plan.monthly_price)}<span className="text-sm font-medium text-muted-foreground">/bln</span></div>
        <div className="mt-1 text-xs text-muted-foreground">Tahunan: {plan.annual_price ? idr(plan.annual_price) : "Tidak diatur"}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-muted/40 p-2"><b className="block text-sm text-foreground">{limitLabel(plan.max_users)}</b>user</div>
          <div className="rounded-lg bg-muted/40 p-2"><b className="block text-sm text-foreground">{limitLabel(plan.max_assets)}</b>aset</div>
          <div className="rounded-lg bg-muted/40 p-2"><b className="block text-sm text-foreground">{limitLabel(plan.max_sites)}</b>site</div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Users2 className="h-3.5 w-3.5" />{subscribersOf(plan)} subscriber</div>
        {plan.description && <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {plan.status === "DRAFT" && <Button className="w-full" onClick={() => setConfirm({ type: "publish", plan })}><Check className="h-4 w-4" />Publish Package</Button>}
          {plan.status === "PUBLISHED" && <>
            <Button variant="ghost" className="flex-1" onClick={() => requestStatus(plan, "INACTIVE")}><Power className="h-4 w-4" />Nonaktifkan</Button>
            <Button variant="ghost" className="flex-1" onClick={() => requestStatus(plan, "ARCHIVED")}><Archive className="h-4 w-4" />Arsipkan</Button>
          </>}
          {(plan.status === "INACTIVE" || plan.status === "ARCHIVED") && <Button variant="ghost" className="w-full" onClick={() => requestStatus(plan, "PUBLISHED")}><RotateCcw className="h-4 w-4" />Aktifkan kembali</Button>}
        </div>
      </Card>)}
      {!loading && visiblePlans.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Belum ada subscription package.</p>}
    </div>

    <Modal open={Boolean(form)} onClose={closeForm} title={editingPlan ? "Edit Subscription Package" : "Tambah Subscription Package"} wide footer={<><Button variant="ghost" onClick={closeForm} disabled={saving}>Batal</Button><Button onClick={savePlan} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Package"}</Button></>}>
      {form && <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {editingNote && <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground md:col-span-2">Perubahan harga, layanan, dan limit tidak mengubah langganan yang sedang berjalan. Subscriber memakai versi baru mulai periode berikutnya dan diberi tahu lewat notifikasi dan email.</div>}
        <Field label="Package Key" required><Input value={form.key} onChange={(event) => updateField("key", event.target.value)} placeholder="contoh: vip" disabled={Boolean(editingPlan)} /></Field>
        <Field label="Nama Package" required><Input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="VIP" /></Field>
        <Field label="Harga Bulanan" required><Input type="number" min="0" value={form.monthly_price} onChange={(event) => updateField("monthly_price", event.target.value)} placeholder="500000" /></Field>
        <Field label="Harga Tahunan"><Input type="number" min="0" value={form.annual_price} onChange={(event) => updateField("annual_price", event.target.value)} placeholder="5000000" /></Field>
        {limitFields.map(([name, label]) => <Field key={name} label={label}><Input type="number" min="1" step="1" value={form[name]} onChange={(event) => updateField(name, event.target.value)} placeholder="Tanpa batas" /></Field>)}
        <Field label="Currency"><Input value={form.currency_code} maxLength={3} onChange={(event) => updateField("currency_code", event.target.value)} placeholder="IDR" /></Field>
        <div className="md:col-span-2"><Field label="Deskripsi"><textarea className="min-h-24 w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" value={form.description} onChange={(event) => updateField("description", event.target.value)} placeholder="Jelaskan isi package ini." /></Field></div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground md:col-span-2"><input type="checkbox" checked={form.is_public} onChange={(event) => updateField("is_public", event.target.checked)} />Tampilkan package ini untuk pilihan Company Admin</label>
      </div>}
    </Modal>

    <Modal open={Boolean(confirm)} onClose={() => { if (!confirming && !saving) setConfirm(null); }} title={copy.title} footer={<><Button variant="ghost" onClick={() => setConfirm(null)} disabled={confirming || saving}>Batal</Button><Button onClick={runConfirm} disabled={confirming || saving}>{confirming || saving ? "Memproses..." : copy.action}</Button></>}>
      <p className="text-sm text-muted-foreground">{copy.text}</p>
    </Modal>

    <Modal open={Boolean(blocked)} onClose={() => setBlocked(null)} title="Package tidak bisa dihapus" footer={<>
      <Button variant="ghost" onClick={() => setBlocked(null)}>Tutup</Button>
      {blocked?.status !== "DRAFT" && <Button variant="ghost" onClick={() => requestStatus(blocked, "DRAFT")}>Jadikan draft</Button>}
      {blocked?.status !== "INACTIVE" && <Button variant="ghost" onClick={() => requestStatus(blocked, "INACTIVE")}>Nonaktifkan</Button>}
      {blocked?.status !== "ARCHIVED" && <Button onClick={() => requestStatus(blocked, "ARCHIVED")}>Arsipkan</Button>}
    </>}>
      {blocked && <p className="text-sm text-muted-foreground">"{blocked.name}" masih dipakai {subscribersOf(blocked)} subscriber, jadi tidak boleh dihapus. Ubah statusnya menjadi draft, nonaktif, atau arsip. Subscriber yang sedang berjalan tetap memakai paketnya sampai akhir periode.</p>}
    </Modal>
  </Reveal>;
}
