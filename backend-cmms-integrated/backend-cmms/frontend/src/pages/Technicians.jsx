import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Star, ShieldAlert, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../store/store";
import {
  PageHeader, Card, Pill, Button, IconButton, Modal, ConfirmDialog, Field, Input, Select, Reveal, StatCard, Tabs,
} from "../components/kit";
import { listUsers, createUser, updateUser, deleteUser } from "../lib/organization";
import { listWorkOrders } from "../lib/workorders";

const ROLE_OPTIONS = [
  { value: "TECHNICIAN", label: "Technician" },
  { value: "SUPERVISOR", label: "Supervisor" },
];

const blank = {
  full_name: "", email: "", phone: "", employee_code: "",
  role_key: "TECHNICIAN", primary_site_id: "", temporary_password: "",
};

const daysUntil = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

export default function Technicians() {
  const { user } = useApp();
  const canEdit = user?.role === "company_admin" || user?.role === "manager";

  const [tab, setTab] = useState("profiles");
  const [loading, setLoading] = useState(true);
  const [technicians, setTechnicians] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [sites, setSites] = useState([]);

  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [techRes, woRes, sitesRes] = await Promise.all([
        listUsers({ role: "TECHNICIAN", status: "ACTIVE", per_page: 100 }),
        listWorkOrders({ per_page: 100 }),
        import("../lib/assets").then((m) => m.listSites()),
      ]);
      setTechnicians(techRes.data || []);
      setWorkOrders(woRes.data || []);
      setSites(sitesRes.data || []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat data teknisi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeWoCount = (techId) =>
    workOrders.filter((w) => w.current_assignee_id === techId && !["COMPLETED", "CLOSED", "CANCELLED"].includes(w.status)).length;

  const completedWoCount = (techId) =>
    workOrders.filter((w) => w.current_assignee_id === techId && ["COMPLETED", "CLOSED"].includes(w.status)).length;

  const avgUtilization = useMemo(() => {
    if (!technicians.length) return 0;
    const total = technicians.reduce((s, t) => {
      const active = activeWoCount(t.id);
      const load = Math.min(Math.round((active / 5) * 100), 100);
      return s + load;
    }, 0);
    return Math.round(total / technicians.length);
  }, [technicians, workOrders]);

  const save = async () => {
    if (!form.full_name?.trim() || !form.email?.trim()) {
      toast.error("Nama dan email wajib diisi.");
      return;
    }
    if (!form.id && !form.temporary_password?.trim()) {
      toast.error("Password sementara wajib diisi untuk user baru.");
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        const payload = {
          full_name: form.full_name.trim(),
          phone: form.phone || null,
          employee_code: form.employee_code || null,
          role_key: form.role_key,
          primary_site_id: form.primary_site_id || null,
        };
        await updateUser(form.id, payload);
        toast.success("Teknisi diperbarui.");
      } else {
        const payload = {
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone || null,
          employee_code: form.employee_code || null,
          role_key: form.role_key,
          primary_site_id: form.primary_site_id || null,
          temporary_password: form.temporary_password,
        };
        await createUser(payload);
        toast.success("Teknisi ditambahkan.");
      }
      setForm(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menyimpan teknisi.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDel = async () => {
    if (!del || deleting) return;
    setDeleting(true);
    try {
      await deleteUser(del.id);
      // Remove it immediately from the visible profile cards. The follow-up
      // reload keeps the list consistent with the database after the DELETE.
      setTechnicians((current) => current.filter((technician) => technician.id !== del.id));
      toast.success(`Teknisi "${del.full_name}" berhasil dihapus.`);
      setDel(null);
      await load();
    } catch (err) {
      toast.error(err.message || "Gagal menghapus teknisi.");
    } finally {
      setDeleting(false);
    }
  };

  const leaderboard = useMemo(() =>
    [...technicians].sort((a, b) => completedWoCount(b.id) - completedWoCount(a.id)),
    [technicians, workOrders]
  );

  const getInitials = (name) =>
    (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const getLoadPct = (techId) => Math.min(Math.round((activeWoCount(techId) / 5) * 100), 100);

  return (
    <Reveal>
      <PageHeader
        title="Teknisi & Beban Kerja"
        subtitle="Pantau kapasitas tim dan performa teknisi dari database."
        action={canEdit && (
          <Button onClick={() => setForm({ ...blank, primary_site_id: sites[0]?.id || "" })}>
            <Plus className="h-4 w-4" /> Tambah Teknisi
          </Button>
        )}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Star} label="Total Teknisi Aktif" value={technicians.length} tone="warning" />
        <StatCard icon={Trophy} label="Utilisasi Rata-rata" value={`${avgUtilization}%`} tone="primary" />
        <StatCard icon={ShieldAlert} label="WO Aktif" value={workOrders.filter((w) => ["ASSIGNED", "IN_PROGRESS"].includes(w.status)).length} tone="danger" />
      </div>

      <div className="mb-4">
        <Tabs
          tabs={[
            { key: "profiles", label: "Profil & Beban Kerja" },
            { key: "leaderboard", label: "Leaderboard" },
          ]}
          active={tab} onChange={setTab}
        />
      </div>

      {tab === "profiles" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loading && <p className="col-span-full text-sm text-muted-foreground">Memuat...</p>}
          {!loading && technicians.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">Belum ada teknisi terdaftar.</p>
          )}
          {technicians.map((t) => {
            const active = activeWoCount(t.id);
            const completed = completedWoCount(t.id);
            const load = getLoadPct(t.id);
            const loadTone = load > 85 ? "bg-destructive" : load > 60 ? "bg-[hsl(var(--warning))]" : "bg-[hsl(var(--success))]";
            return (
              <Card key={t.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                      {getInitials(t.full_name)}
                    </div>
                    <div>
                      <div className="font-display font-bold text-foreground">{t.full_name}</div>
                      <div className="text-xs text-muted-foreground">{t.role_key} · {t.employee_code || t.email}</div>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1.5">
                      <IconButton onClick={() => setForm({ ...blank, ...t })}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton onClick={() => setDel(t)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Beban Kerja</span>
                    <span className="font-semibold text-foreground">{load}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${loadTone}`} style={{ width: `${load}%` }} />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-center">
                  <div>
                    <div className="font-display text-lg font-bold text-foreground">{active}</div>
                    <div className="text-[10px] text-muted-foreground">WO Aktif</div>
                  </div>
                  <div>
                    <div className="font-display text-lg font-bold text-foreground">{completed}</div>
                    <div className="text-[10px] text-muted-foreground">Selesai</div>
                  </div>
                  <div>
                    <div className="font-display text-lg font-bold text-foreground">
                      <Pill tone={t.status === "ACTIVE" ? "success" : "muted"} className="text-[10px]">{t.status}</Pill>
                    </div>
                    <div className="text-[10px] text-muted-foreground">Status</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "leaderboard" && (
        <Card>
          <div className="space-y-2">
            {leaderboard.map((t, i) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-display text-lg font-bold text-muted-foreground">#{i + 1}</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {getInitials(t.full_name)}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{t.full_name}</div>
                    <div className="text-xs text-muted-foreground">{t.role_key}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <div className="font-bold text-foreground">{completedWoCount(t.id)}</div>
                    <div className="text-[10px] text-muted-foreground">WO Selesai</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-foreground">{activeWoCount(t.id)}</div>
                    <div className="text-[10px] text-muted-foreground">WO Aktif</div>
                  </div>
                </div>
              </div>
            ))}
            {!loading && leaderboard.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data teknisi.</p>
            )}
          </div>
        </Card>
      )}

      <Modal
        open={!!form} onClose={() => setForm(null)}
        title={form?.id ? "Edit Teknisi" : "Tambah Teknisi"} wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>Batal</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </>
        }
      >
        {form && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nama Lengkap" required>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            {!form.id && (
              <Field label="Email" required>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
            )}
            <Field label="Telepon">
              <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Kode Karyawan">
              <Input value={form.employee_code || ""} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
            </Field>
            <Field label="Peran">
              <Select value={form.role_key} onChange={(e) => setForm({ ...form, role_key: e.target.value })}>
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </Field>
            <Field label="Site Utama">
              <Select value={form.primary_site_id || ""} onChange={(e) => setForm({ ...form, primary_site_id: e.target.value })}>
                <option value="">Tidak ditentukan</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            {!form.id && (
              <div className="sm:col-span-2">
                <Field label="Password Sementara" required>
                  <Input
                    type="password"
                    value={form.temporary_password}
                    onChange={(e) => setForm({ ...form, temporary_password: e.target.value })}
                    placeholder="Min. 8 karakter"
                  />
                </Field>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} onConfirm={confirmDel}
        title="Hapus Teknisi Permanen"
        confirmDisabled={deleting}
        message={`Hapus "${del?.full_name}" secara permanen? Data user dan aktivitas yang terhubung akan ikut dihapus. Tindakan ini tidak dapat dibatalkan.`}
      />
    </Reveal>
  );
}
