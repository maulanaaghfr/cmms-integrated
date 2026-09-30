import React, { useCallback, useEffect, useState } from "react";
import { LogOut, ShieldCheck, Clock3, Award, Save, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useApp, ROLES, passwordStrength } from "../../store/store";
import { listWorkOrders } from "../../lib/workorders";
import { changePassword } from "../../lib/auth";

export default function MobileProfile() {
  const { user, logout, saveProfile, markPasswordChanged } = useApp();
  const [workOrders, setWorkOrders] = useState([]);
  const [profile, setProfile] = useState({ fullName: user?.name || "", phone: user?.phone || "" });
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [changingPassword, setChangingPassword] = useState(false);

  const saveProfileEdit = async (e) => {
    e.preventDefault();
    if (!profile.fullName.trim()) return toast.error("Nama lengkap wajib diisi.");
    setSaving(true);
    try { await saveProfile(profile); toast.success("Profil berhasil diperbarui."); }
    catch (err) { toast.error(err.message || "Profil gagal diperbarui."); }
    finally { setSaving(false); }
  };

  const updatePassword = async (e) => {
    e.preventDefault();
    if (passwordStrength(password.newPassword).score < 2) return toast.error("Password baru terlalu lemah.");
    if (password.newPassword !== password.confirmPassword) return toast.error("Konfirmasi password tidak cocok.");
    setChangingPassword(true);
    try {
      await changePassword({ currentPassword: password.currentPassword, password: password.newPassword, passwordConfirmation: password.confirmPassword });
      markPasswordChanged?.();
      toast.success("Password berhasil diubah.");
      setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) { toast.error(err.message || "Password gagal diubah."); }
    finally { setChangingPassword(false); }
  };

  const load = useCallback(async () => {
    try {
      const res = await listWorkOrders({ per_page: 100 });
      setWorkOrders(res.data || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const myCompleted = workOrders.filter((w) =>
    w.current_assignee_id === user?.tenantUserId && ["COMPLETED", "CLOSED"].includes(w.status)
  ).length;

  const myActive = workOrders.filter((w) =>
    w.current_assignee_id === user?.tenantUserId && ["ASSIGNED", "IN_PROGRESS"].includes(w.status)
  ).length;

  const roleLabel = ROLES[user?.role]?.label || user?.role || "-";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 soft-card">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {(user?.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="font-display text-base font-bold text-foreground">{user?.name}</div>
          <div className="text-xs text-muted-foreground">{roleLabel} · {user?.company}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <MiniStat icon={ShieldCheck} value={myCompleted} label="WO Selesai" />
        <MiniStat icon={Clock3} value={myActive} label="WO Aktif" />
        <MiniStat icon={Award} value={user?.email ? user.email.split("@")[0] : "-"} label="Username" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 soft-card space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Info Akun</p>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Email</span>
          <span className="font-medium text-foreground">{user?.email || "-"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Peran</span>
          <span className="font-medium text-foreground">{roleLabel}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Perusahaan</span>
          <span className="font-medium text-foreground">{user?.company || "-"}</span>
        </div>
      </div>

      <form onSubmit={saveProfileEdit} className="rounded-2xl border border-border bg-card p-4 soft-card space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Edit Profil</p>
        <div>
          <label className="text-xs text-muted-foreground">Nama Lengkap</label>
          <input value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Nomor Telepon</label>
          <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="08xxxxxxxxxx" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
        <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          <Save className="h-4 w-4" /> {saving ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
      </form>

      <form onSubmit={updatePassword} className="rounded-2xl border border-border bg-card p-4 soft-card space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ubah Password</p>
        <input type="password" value={password.currentPassword} onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} placeholder="Password saat ini" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        <input type="password" value={password.newPassword} onChange={(e) => setPassword({ ...password, newPassword: e.target.value })} placeholder="Password baru" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        <input type="password" value={password.confirmPassword} onChange={(e) => setPassword({ ...password, confirmPassword: e.target.value })} placeholder="Konfirmasi password baru" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        <button type="submit" disabled={changingPassword} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-2.5 text-sm font-semibold text-foreground disabled:opacity-60">
          <KeyRound className="h-4 w-4" /> {changingPassword ? "Mengubah..." : "Ubah Password"}
        </button>
      </form>

      <button
        onClick={logout}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 py-3 text-sm font-semibold text-destructive active:scale-[0.99]"
      >
        <LogOut className="h-4 w-4" /> Keluar
      </button>
    </div>
  );
}

function MiniStat({ icon: Icon, value, label }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center soft-card">
      <Icon className="mx-auto mb-1 h-4 w-4 text-primary" />
      <div className="font-display text-sm font-extrabold text-foreground truncate">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
