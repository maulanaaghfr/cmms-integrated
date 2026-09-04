import React, { useState } from "react";
import { Eye, EyeOff, KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import Logo from "../components/Logo";
import { useApp, passwordStrength } from "../store/store";
import { Input, Field, Button } from "../components/kit";

const strengthBar = { danger: "bg-destructive", warning: "bg-[hsl(var(--warning))]", accent: "bg-accent", success: "bg-[hsl(var(--success))]" };

function PasswordInput({ value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/**
 * Mandatory "change your temporary password" screen.
 *
 * FIX (2026-09-04): this page didn't exist before. The backend has always
 * refused tenant-scoped requests (work orders, users, notifications, ...)
 * for any account with `must_change_password = true` — but nothing in the
 * frontend ever surfaced that requirement to the user or gave them a way
 * to satisfy it. They'd log in fine, land on an empty dashboard, and every
 * background API call would silently fail with 403 PASSWORD_CHANGE_REQUIRED
 * in the console — which looked exactly like "work order tidak muncul",
 * but had nothing to do with assignment or scoping.
 *
 * Rendered by Shell() in App.jsx whenever `user.mustChangePassword` is
 * true, BEFORE the normal desktop/mobile routes — so no other page can be
 * reached (and no other page's data-fetching 403s) until this is done.
 */
export default function ChangePassword() {
  const { user, logout, changePassword } = useApp();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const strength = passwordStrength(password);

  const submit = async (e) => {
    e.preventDefault();
    if (!currentPassword) return toast.error("Masukkan password sementara Anda saat ini.");
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
    toast.success("Password berhasil diganti. Selamat datang!");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 soft-card sm:p-8">
        <Logo />
        <div className="mt-6 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-lg font-extrabold text-foreground">Ganti password sementara</h1>
            <p className="text-xs text-muted-foreground">
              Halo {user?.name || ""}, akun Anda dibuatkan password sementara. Ganti dulu dengan password baru sebelum bisa melihat data.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Password saat ini" required>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Password sementara dari admin"
              autoComplete="current-password"
            />
          </Field>

          <Field label="Password baru" required>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 8 karakter, huruf & angka"
              autoComplete="new-password"
            />
            {password && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full transition-all ${strengthBar[strength.tone]}`} style={{ width: `${(strength.score / 4) * 100}%` }} />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">{strength.label}</span>
              </div>
            )}
          </Field>

          <Field label="Konfirmasi password baru" required>
            <PasswordInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Ulangi password baru"
              autoComplete="new-password"
            />
          </Field>

          <Button type="submit" disabled={loading} className="w-full justify-center">
            {loading ? "Menyimpan..." : "Ganti password & lanjutkan"}
          </Button>

          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Keluar dan masuk lagi nanti
          </button>
        </form>
      </div>
    </div>
  );
}