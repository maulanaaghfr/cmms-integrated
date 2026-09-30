import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Building2, CheckCircle2, KeyRound, LockKeyhole, Mail,
  Save, ShieldCheck, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useApp, ROLES, passwordStrength } from "../store/store";
import { changePassword } from "../lib/auth";
import { Button, Card, Field, Input, PageHeader, Pill, Reveal } from "../components/kit";

function initials(name) {
  return String(name || "User")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "U";
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-border/60 bg-muted/[0.18] p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-foreground">{value || "Belum diatur"}</p>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, logout, saveProfile, markPasswordChanged } = useApp();
  const [profile, setProfile] = useState({ fullName: user?.name || "", phone: user?.phone || "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");
  const [notificationPrefs, setNotificationPrefs] = useState({ request: true, workOrder: true, sla: true, stock: true, approval: true, daily: false });
  const [slaForm, setSlaForm] = useState({ default: "", critical: "", high: "", medium: "" });

  const name = user?.name || "Pengguna";
  const roleLabel = ROLES?.[user?.role]?.label || user?.role || "Member";
  const status = String(user?.status || "ACTIVE").toUpperCase();
  const statusLabel = status === "ACTIVE" ? "Aktif" : status === "INACTIVE" ? "Nonaktif" : status;
  const userId = user?.tenantUserId || user?.id || "-";

  const save = async (event) => {
    event.preventDefault();
    if (!profile.fullName.trim()) return toast.error("Nama lengkap wajib diisi.");
    setSaving(true);
    try { await saveProfile(profile); toast.success("Profil berhasil diperbarui."); }
    catch (error) { toast.error(error.message || "Profil gagal diperbarui."); }
    finally { setSaving(false); }
  };

  const updatePassword = async (event) => {
    event.preventDefault();
    if (passwordStrength(password.newPassword).score < 2) return toast.error("Password baru terlalu lemah.");
    if (password.newPassword !== password.confirmPassword) return toast.error("Konfirmasi password tidak cocok.");
    setChangingPassword(true);
    try {
      await changePassword({ currentPassword: password.currentPassword, password: password.newPassword, passwordConfirmation: password.confirmPassword });
      markPasswordChanged();
      toast.success("Password berhasil diubah.");
      setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) { toast.error(error.message || "Password gagal diubah."); }
    finally { setChangingPassword(false); }
  };

  if (user?.role === "operator") {
    return <OperatorProfile user={user} logout={logout} />;
  }

  return (
    <Reveal className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Pengaturan"
        subtitle="Kelola profil, notifikasi, dan konfigurasi SLA."
      />

      <div className="flex gap-6 border-b border-slate-200 text-sm font-semibold text-slate-500">
        {[['profile', 'Profil & Akun'], ['notifications', 'Notifikasi'], ['sla', 'Sistem & SLA']].map(([key, label]) => <button key={key} onClick={() => setSettingsTab(key)} className={`border-b-2 px-1 pb-3 ${settingsTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent'}`}>{label}</button>)}
      </div>

      {settingsTab !== "profile" && <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Card className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-blue-600 text-xl font-bold text-white">{initials(name)}</div><h2 className="mt-3 font-display text-lg font-bold">{name}</h2><p className="text-sm text-slate-500">{roleLabel}</p><p className="text-xs text-slate-400">{user?.company || "Aitoma CMMS"}</p><div className="my-4 border-t border-slate-100" /><div className="space-y-2 text-left text-xs text-slate-500"><div>{user?.email || "Email belum tersedia"}</div><div>{profile.phone || "Nomor telepon belum tersedia"}</div><div>{user?.department || "Teknik & Pemeliharaan"}</div></div></Card>
          <Card><Button variant="ghost" className="w-full justify-start"><LockKeyhole className="h-4 w-4" /> Ganti Password</Button></Card>
        </div>
        {settingsTab === "notifications" ? <Card><h2 className="font-display text-base font-bold">Preferensi Notifikasi</h2><div className="mt-4 divide-y divide-slate-100">{[["request", "Permintaan Baru", "Notifikasi saat ada permintaan maintenance baru masuk"], ["workOrder", "Update Work Order", "Notifikasi perubahan status WO yang Anda kelola"], ["sla", "SLA Alert", "Peringatan ketika WO mendekati atau melewati batas SLA"], ["stock", "Stok Rendah", "Peringatan ketika stok spare part mencapai level minimum"], ["approval", "Menunggu Persetujuan", "Notifikasi saat teknisi mengajukan WO untuk disetujui"], ["daily", "Laporan Harian", "Ringkasan harian dikirim setiap pukul 07:00"]].map(([key, label, hint]) => <div key={key} className="flex items-center justify-between gap-4 py-4"><div><div className="text-sm font-semibold">{label}</div><div className="text-xs text-slate-400">{hint}</div></div><button onClick={() => setNotificationPrefs((p) => ({ ...p, [key]: !p[key] }))} className={`relative h-5 w-9 rounded-full ${notificationPrefs[key] ? "bg-blue-600" : "bg-slate-200"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${notificationPrefs[key] ? "left-4" : "left-0.5"}`} /></button></div>)}</div><div className="mt-4 flex justify-end"><Button onClick={() => toast.success("Preferensi disimpan di sesi ini.")}>Simpan</Button></div></Card> : <div className="space-y-4"><Card><h2 className="font-display text-base font-bold">Konfigurasi SLA</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="SLA Default (jam)"><Input value={slaForm.default} onChange={(e) => setSlaForm({ ...slaForm, default: e.target.value })} placeholder="—" /></Field><Field label="SLA Kritis (jam)"><Input value={slaForm.critical} onChange={(e) => setSlaForm({ ...slaForm, critical: e.target.value })} placeholder="—" /></Field><Field label="SLA Tinggi (jam)"><Input value={slaForm.high} onChange={(e) => setSlaForm({ ...slaForm, high: e.target.value })} placeholder="—" /></Field><Field label="SLA Sedang (jam)"><Input value={slaForm.medium} onChange={(e) => setSlaForm({ ...slaForm, medium: e.target.value })} placeholder="—" /></Field></div><div className="mt-4 flex justify-end"><Button onClick={() => toast.info("Konfigurasi SLA belum memiliki endpoint backend.")}>Simpan</Button></div></Card><Card><h2 className="font-display text-base font-bold">Informasi Sistem</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-400">Versi CMMS</span><b className="mt-1 block text-sm">—</b></div><div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-400">Database</span><b className="mt-1 block text-sm">—</b></div></div></Card></div>}
      </div>}

      {settingsTab === "profile" && <>

      {user?.mustChangePassword && (
        <Card className="border-amber-300 bg-amber-50 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="text-sm font-bold">Buat password baru untuk mengaktifkan akses</h2>
              <p className="mt-1 text-xs leading-5">Akun ini masih menggunakan password sementara. Endpoint tenant akan dibuka setelah password baru berhasil disimpan.</p>
            </div>
          </div>
        </Card>
      )}

      <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.13] via-background to-background p-5 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-primary text-2xl font-extrabold text-primary-foreground shadow-lg shadow-primary/25">{initials(name)}</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Akun aktif</p>
              <h2 className="mt-1 truncate font-display text-2xl font-extrabold text-foreground">{name}</h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">{user?.email || "Email belum tersedia"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Pill tone={status === "ACTIVE" ? "success" : "muted"} className="gap-1.5 px-3 py-1.5 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> {statusLabel}</Pill>
            <Pill tone="primary" className="px-3 py-1.5 text-xs">{roleLabel}</Pill>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          <Card className="space-y-5 border-border/70 shadow-sm">
            <div>
              <h3 className="font-display text-base font-bold text-foreground">Edit informasi akun</h3>
              <p className="mt-1 text-xs text-muted-foreground">Perbarui nama dan nomor telepon yang ditampilkan di workspace.</p>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nama lengkap" required><Input value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} /></Field>
                <Field label="Nomor telepon"><Input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="08xxxxxxxxxx" /></Field>
              </div>
              <Field label="Email"><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={user?.email || ""} disabled /></div></Field>
              <div className="flex justify-end"><Button type="submit" className="w-full sm:w-auto" disabled={saving}><Save className="h-4 w-4" />{saving ? "Menyimpan..." : "Simpan perubahan"}</Button></div>
            </form>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="h-5 w-5" /></span>
              <div>
                <h3 className="font-display text-base font-bold text-foreground">Keamanan akun</h3>
                <p className="mt-1 text-xs text-muted-foreground">Gunakan password kuat untuk melindungi akun Anda.</p>
              </div>
            </div>
            <form onSubmit={updatePassword} className="space-y-4">
              <Field label="Password saat ini" required><Input type="password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} autoComplete="current-password" /></Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Password baru" required><Input type="password" value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} autoComplete="new-password" /></Field>
                <Field label="Konfirmasi password" required><Input type="password" value={password.confirmPassword} onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })} autoComplete="new-password" /></Field>
              </div>
              <div className="flex justify-end"><Button type="submit" variant="ghost" disabled={changingPassword}>{changingPassword ? "Mengubah..." : "Ubah password"}</Button></div>
            </form>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border-border/70 shadow-sm">
            <h3 className="font-display text-base font-bold text-foreground">Status akses</h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3"><span className="text-xs text-muted-foreground">Status akun</span><Pill tone={status === "ACTIVE" ? "success" : "muted"}>{statusLabel}</Pill></div>
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3"><span className="text-xs text-muted-foreground">Role</span><span className="text-right text-xs font-semibold text-foreground">{roleLabel}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">ID pengguna</span><span className="max-w-36 truncate font-mono text-[11px] text-foreground" title={userId}>{userId}</span></div>
            </div>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <h3 className="font-display text-base font-bold text-foreground">Ringkasan akun</h3>
            <div className="mt-4 space-y-3">
              <InfoItem icon={ShieldCheck} label="Status akun" value={statusLabel} />
              <InfoItem icon={UserRound} label="Peran" value={roleLabel} />
              <InfoItem icon={Building2} label="Perusahaan" value={user?.company || "Aitoma Platform"} />
              <InfoItem icon={Mail} label="Email terverifikasi" value={user?.email || "-"} />
            </div>
          </Card>

          <Card className="border-border/70 bg-muted/[0.18] shadow-sm">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <h3 className="text-sm font-bold text-foreground">Akun terlindungi</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Jangan membagikan informasi login dan gunakan akun ini hanya pada perangkat yang aman.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="flex flex-col items-start justify-between gap-4 border-destructive/15 bg-destructive/[0.03] sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-bold text-foreground">Keluar dari akun</h3>
          <p className="mt-1 text-xs text-muted-foreground">Gunakan tombol ini setelah selesai menggunakan perangkat bersama.</p>
        </div>
        <Button variant="danger" onClick={logout}>Keluar</Button>
      </Card>
      </>}
    </Reveal>
  );
}

function OperatorProfile({ user, logout }) {
  const { saveProfile, markPasswordChanged } = useApp();
  const [profile, setProfile] = useState({ fullName: user?.name || "", phone: user?.phone || "" });
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [changingPassword, setChangingPassword] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    if (!profile.fullName.trim()) return toast.error("Nama lengkap wajib diisi.");
    setSaving(true);
    try { await saveProfile(profile); toast.success("Profil berhasil diperbarui."); }
    catch (error) { toast.error(error.message || "Profil gagal diperbarui."); }
    finally { setSaving(false); }
  };

  const updatePassword = async (event) => {
    event.preventDefault();
    if (passwordStrength(password.newPassword).score < 2) return toast.error("Password baru terlalu lemah.");
    if (password.newPassword !== password.confirmPassword) return toast.error("Konfirmasi password tidak cocok.");
    setChangingPassword(true);
    try {
      await changePassword({ currentPassword: password.currentPassword, password: password.newPassword, passwordConfirmation: password.confirmPassword });
      markPasswordChanged();
      toast.success("Password berhasil diubah.");
      setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) { toast.error(error.message || "Password gagal diubah."); }
    finally { setChangingPassword(false); }
  };

  return <div className="mx-auto max-w-[1040px] space-y-5 pb-8">
    <div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Profil</h1><p className="mt-1 text-xs text-slate-400">Kelola informasi akun dan pengaturan</p></div>
    <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
      <div className="space-y-3"><section className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-blue-600 text-lg font-bold text-white">OP</div><h2 className="mt-3 text-sm font-bold text-slate-900">{user?.name || "Operator 1"}</h2><p className="mt-1 text-xs text-slate-500">Operator Produksi</p><p className="mt-3 text-[10px] text-emerald-600">● Aktif · {user?.company || "PT Contoh Industri"}</p><div className="mt-4 grid grid-cols-3 border-t border-slate-100 pt-4 text-[10px] text-slate-400"><span>Shift<strong className="mt-1 block text-slate-700">A</strong></span><span>Divisi<strong className="mt-1 block text-slate-700">Prod.</strong></span><span>Sejak<strong className="mt-1 block text-slate-700">2019</strong></span></div></section><button onClick={logout} className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600">↪ Keluar dari Akun</button></div>
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Informasi Akun</p><div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2">{[["Username", user?.username || user?.email || "operator01"], ["Role", "Operator Produksi"], ["Divisi", user?.department || "Produksi — Shift A"], ["Email", user?.email || "operator01@pt-example.co.id"], ["Perusahaan", user?.company || "PT Contoh Industri"], ["No. Karyawan", user?.employee_number || "KRY-2019-0412"], ["Bergabung", "1 Maret 2019"]].map(([label, value]) => <div key={label}><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-medium text-slate-700">{value}</p></div>)}</div></section>

        <Card className="space-y-5 border-border/70 shadow-sm">
          <div>
            <h3 className="font-display text-base font-bold text-foreground">Edit informasi akun</h3>
            <p className="mt-1 text-xs text-muted-foreground">Perbarui nama dan nomor telepon yang ditampilkan di workspace.</p>
          </div>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nama lengkap" required><Input value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} /></Field>
              <Field label="Nomor telepon"><Input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="08xxxxxxxxxx" /></Field>
            </div>
            <Field label="Email"><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={user?.email || ""} disabled /></div></Field>
            <div className="flex justify-end"><Button type="submit" className="w-full sm:w-auto" disabled={saving}><Save className="h-4 w-4" />{saving ? "Menyimpan..." : "Simpan perubahan"}</Button></div>
          </form>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="h-5 w-5" /></span>
            <div>
              <h3 className="font-display text-base font-bold text-foreground">Keamanan akun</h3>
              <p className="mt-1 text-xs text-muted-foreground">Gunakan password kuat untuk melindungi akun Anda.</p>
            </div>
          </div>
          <form onSubmit={updatePassword} className="space-y-4">
            <Field label="Password saat ini" required><Input type="password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} autoComplete="current-password" /></Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Password baru" required><Input type="password" value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} autoComplete="new-password" /></Field>
              <Field label="Konfirmasi password" required><Input type="password" value={password.confirmPassword} onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })} autoComplete="new-password" /></Field>
            </div>
            <div className="flex justify-end"><Button type="submit" variant="ghost" disabled={changingPassword}>{changingPassword ? "Mengubah..." : "Ubah password"}</Button></div>
          </form>
        </Card>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><h2 className="border-b border-slate-100 px-5 py-4 text-sm font-bold text-slate-800">Pengaturan & Bantuan</h2>{[["♧", "Notifikasi", "Kelola alert dan notifikasi"], ["?", "Bantuan", "FAQ dan dokumentasi"], ["□", "Laporkan Masalah", "Feedback dan bug report"]].map(([icon, title, desc]) => <button key={title} className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-4 text-left last:border-0 hover:bg-slate-50"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">{icon}</span><span className="flex-1"><b className="block text-xs text-slate-700">{title}</b><small className="mt-0.5 block text-[10px] text-slate-400">{desc}</small></span><span className="text-slate-400">›</span></button>)}</section>
      </div>
    </div><p className="text-center text-[10px] text-slate-300">Aitoma CMMS v2.4.1 · © 2024 Aitoma Technologies</p>
  </div>;
}
