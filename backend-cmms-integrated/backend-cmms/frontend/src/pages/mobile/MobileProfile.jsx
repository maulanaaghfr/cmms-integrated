import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, ShieldCheck, Clock3, TrendingUp, KeyRound, Eye, EyeOff, Mail, Building2, BadgeCheck } from "lucide-react";
import { useApp, ROLES, passwordStrength } from "../../store/store";
import { Sheet } from "../../components/mobile-kit";
import { listWorkOrders } from "../../lib/workorders";

const strengthBar = { danger: "bg-destructive", warning: "bg-[hsl(var(--warning))]", accent: "bg-accent", success: "bg-[hsl(var(--success))]" };

export default function MobileProfile() {
  const { user, logout } = useApp();
  const [workOrders, setWorkOrders] = useState([]);
  const [pwOpen, setPwOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await listWorkOrders({ per_page: 100 });
      setWorkOrders(res.data || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mine = workOrders.filter((w) => w.current_assignee_id === user?.tenantUserId);
  const myCompleted = mine.filter((w) => ["COMPLETED", "CLOSED"].includes(w.status)).length;
  const myActive = mine.filter((w) => ["ASSIGNED", "IN_PROGRESS", "ON_HOLD"].includes(w.status)).length;
  const totalDone = mine.filter((w) => ["COMPLETED", "CLOSED", "CANCELLED"].includes(w.status)).length;
  const completionRate = totalDone > 0 ? Math.round((myCompleted / totalDone) * 100) : null;

  const roleLabel = ROLES[user?.role]?.label || user?.role || "-";
  const initials = (user?.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 soft-card">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate font-display text-base font-bold text-foreground">{user?.name}</div>
            <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
          </div>
          <div className="truncate text-xs text-muted-foreground">{roleLabel} · {user?.company}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <MiniStat icon={ShieldCheck} value={myCompleted} label="WO Selesai" />
        <MiniStat icon={Clock3} value={myActive} label="WO Aktif" />
        <MiniStat icon={TrendingUp} value={completionRate !== null ? `${completionRate}%` : "-"} label="Tingkat Selesai" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 soft-card space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Info Akun</p>
        <InfoRow icon={Mail} label="Email" value={user?.email || "-"} />
        <InfoRow icon={ShieldCheck} label="Peran" value={roleLabel} />
        <InfoRow icon={Building2} label="Perusahaan" value={user?.company || "-"} />
      </div>

      <div className="space-y-2.5">
        <button
          onClick={() => setPwOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left soft-card active:scale-[0.99]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><KeyRound className="h-4 w-4" /></div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground">Ganti Password</div>
            <div className="text-xs text-muted-foreground">Perbarui password akun secara berkala</div>
          </div>
        </button>

        <button
          onClick={() => setConfirmLogout(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 py-3 text-sm font-semibold text-destructive active:scale-[0.99]"
        >
          <LogOut className="h-4 w-4" /> Keluar
        </button>
      </div>

      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />

      <Sheet open={confirmLogout} onClose={() => setConfirmLogout(false)} title="Keluar dari akun?">
        <p className="text-sm text-muted-foreground">Kamu perlu login kembali untuk mengakses work order dan notifikasi.</p>
        <div className="mt-4 flex gap-2">
          <button onClick={() => setConfirmLogout(false)} className="flex-1 rounded-xl border bg-background py-2.5 text-sm font-semibold text-muted-foreground">Batal</button>
          <button onClick={logout} className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground">Ya, Keluar</button>
        </div>
      </Sheet>
    </div>
  );
}

function ChangePasswordSheet({ open, onClose }) {
  const { changePassword } = useApp();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const strength = password ? passwordStrength(password) : null;

  const reset = () => { setCurrentPassword(""); setPassword(""); setConfirm(""); setShow(false); };

  const submit = async () => {
    if (!currentPassword) return toast.error("Masukkan password Anda saat ini.");
    if (password.length < 8) return toast.error("Password baru minimal 8 karakter.");
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return toast.error("Password baru harus mengandung huruf dan angka.");
    if (password !== confirm) return toast.error("Konfirmasi password tidak sama dengan password baru.");
    setLoading(true);
    const res = await changePassword({ currentPassword, password, passwordConfirmation: confirm });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error || "Gagal mengganti password. Periksa kembali password saat ini.");
      return;
    }
    toast.success("Password berhasil diganti.");
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={() => { reset(); onClose(); }} title="Ganti Password">
      <div className="space-y-3">
        <div className="relative">
          <input
            type={show ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Password saat ini" autoComplete="current-password"
            className="w-full rounded-xl border bg-background px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="relative">
          <input
            type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password baru" autoComplete="new-password"
            className="w-full rounded-xl border bg-background px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {strength && (
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i < strength.score ? strengthBar[strength.tone] : "bg-muted"}`} />
            ))}
          </div>
        )}
        <div className="relative">
          <input
            type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="Konfirmasi password baru" autoComplete="new-password"
            className="w-full rounded-xl border bg-background px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button type="button" onClick={() => setShow((s) => !s)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {show ? "Sembunyikan" : "Tampilkan"} password
        </button>

        <button onClick={submit} disabled={loading} className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {loading ? "Menyimpan..." : "Simpan Password Baru"}
        </button>
      </div>
    </Sheet>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
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