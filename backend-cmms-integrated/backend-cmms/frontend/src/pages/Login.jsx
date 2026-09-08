import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, ArrowRight, Sparkles, Wrench, Gauge, ArrowLeft,
  Mail, CheckCircle2, BookOpen, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import Logo from "../components/Logo";
import { useApp, passwordStrength } from "../store/store";
import { Input, Field, Button, Select } from "../components/kit";
import { listPublicPlans, registerOnboarding } from "../lib/onboarding";
import { requestPasswordReset, resetPasswordWithToken } from "../lib/auth";

const strengthBar = { danger: "bg-destructive", warning: "bg-[hsl(var(--warning))]", accent: "bg-accent", success: "bg-[hsl(var(--success))]" };

// Input password + tombol mata buat toggle show/hide
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

function BrandPanel() {
  return (
    <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-sidebar p-12 lg:flex">
      <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/30 blur-3xl floaty" />
      <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-accent/20 blur-3xl floaty" style={{ animationDelay: "2s" }} />
      <Logo textClass="text-white" />
      <div className="relative z-10">
        <h1 className="font-display text-5xl font-extrabold leading-tight text-white">
          AITOMA<span className="text-primary">.</span>
        </h1>
        <p className="mt-3 max-w-md text-lg text-sidebar-foreground">
          Platform CMMS bertenaga AI untuk manajemen aset, work order, dan maintenance prediktif — dalam satu dashboard cerdas.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4 max-w-md">
          {[
            { icon: Sparkles, t: "AI Predictive" }, { icon: Wrench, t: "Work Orders" },
            { icon: Gauge, t: "Real-time KPIs" }, { icon: Building2, t: "Multi-tenant" },
          ].map((f) => (
            <div key={f.t} className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 backdrop-blur">
              <f.icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-white">{f.t}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="relative z-10 text-xs text-sidebar-foreground">© 2026 Aitoma. All rights reserved.</p>
    </div>
  );
}

export default function Login() {
  const { login, pendingTenantChoice, completeTenantSelection } = useApp();
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // signup state
  const [su, setSu] = useState({ companyName: "", adminName: "", email: "", phone: "", city: "", industry: "Manufacturing", planId: "", password: "", confirmPassword: "", agree: false });
  const [plans, setPlans] = useState([]);
  // forgot state
  const [fp, setFp] = useState({ email: "", sent: false, code: "", newPassword: "", confirmPassword: "" });

  useEffect(() => {
    if (mode !== "signup" || plans.length) return;
    listPublicPlans().then((response) => {
      const available = response?.data || [];
      setPlans(available);
      if (available[0]) setSu((current) => current.planId ? current : { ...current, planId: available[0].id });
    }).catch((error) => toast.error(error.message || "Gagal memuat paket pendaftaran."));
  }, [mode, plans.length]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const resetEmail = params.get("email");
    if (token && resetEmail) {
      setFp({ email: resetEmail, sent: true, code: token, newPassword: "", confirmPassword: "" });
      setMode("forgot");
    }
  }, []);

  const submitSignin = async (e) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Lengkapi email dan password.");
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    if (res.needsTenantSelection) return; // tenant picker renders below
    toast.success(`Selamat datang, ${res.user.name.split(" ")[0]}!`);
  };

  const chooseTenant = async (membership) => {
    setBusy(true);
    const res = await completeTenantSelection(membership);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Selamat datang, ${res.user.name.split(" ")[0]}!`);
  };

  const submitSignup = async (e) => {
    e.preventDefault();
    if (!su.companyName.trim() || !su.email.trim() || !su.password) return toast.error("Lengkapi data wajib.");
    if (passwordStrength(su.password).score < 2) return toast.error("Password terlalu lemah.");
    if (su.password !== su.confirmPassword) return toast.error("Konfirmasi password tidak cocok.");
    if (!su.agree) return toast.error("Anda harus menyetujui Syarat & Ketentuan.");
    if (!su.planId) return toast.error("Pilih paket yang tersedia.");
    setBusy(true);
    try {
      const slug = su.companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await registerOnboarding({
        full_name: su.adminName.trim(), email: su.email.trim(), phone: su.phone || null,
        password: su.password, password_confirmation: su.confirmPassword,
        company: { name: su.companyName.trim(), email: su.email.trim(), phone: su.phone || null, industry: su.industry, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta", requested_slug: slug },
        plan_id: su.planId, billing_period: "MONTHLY", terms_accepted: true, privacy_accepted: true,
      });
      toast.success("Pendaftaran diterima. Periksa email untuk verifikasi sebelum tenant diprovisioning.");
      setMode("signin");
    } catch (error) { toast.error(error.message || "Pendaftaran gagal."); }
    finally { setBusy(false); }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    if (!fp.sent) {
      if (!fp.email.trim()) return toast.error("Masukkan email Anda.");
      setBusy(true);
      try {
        await requestPasswordReset(fp.email.trim());
        setFp({ ...fp, sent: true });
        toast.success("Jika akun tersedia, tautan reset telah dikirim ke email Anda.");
      } catch (error) { toast.error(error.message || "Gagal meminta reset password."); }
      finally { setBusy(false); }
      return;
    }
    if (!fp.code || passwordStrength(fp.newPassword).score < 2) return toast.error("Tautan reset dan password baru yang kuat wajib diisi.");
    if (fp.newPassword !== fp.confirmPassword) return toast.error("Konfirmasi password tidak cocok.");
    setBusy(true);
    try {
      await resetPasswordWithToken({ email: fp.email, token: fp.code, password: fp.newPassword, passwordConfirmation: fp.confirmPassword });
      toast.success("Password berhasil direset. Silakan masuk.");
      window.history.replaceState({}, "", "/");
      setEmail(fp.email); setPassword(""); setMode("signin"); setFp({ email: "", sent: false, code: "", newPassword: "", confirmPassword: "" });
    } catch (error) { toast.error(error.message || "Reset password gagal."); }
    finally { setBusy(false); }
  };

  const ps = passwordStrength(su.password);
  const fps = passwordStrength(fp.newPassword);

  return (
    <div className="flex min-h-screen bg-background app-gradient">
      <BrandPanel />
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <motion.div key={mode} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="mx-auto w-full max-w-md">
          <div className="lg:hidden mb-8"><Logo /></div>

          <AnimatePresence mode="wait">
            {/* ------------- PICK COMPANY (multi-tenant accounts) ------------- */}
            {pendingTenantChoice && (
              <motion.div key="tenant-pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h2 className="font-display text-3xl font-extrabold text-foreground">Pilih Perusahaan</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Akun Anda terhubung ke lebih dari satu perusahaan. Pilih salah satu untuk masuk.
                </p>
                <div className="mt-6 space-y-2">
                  {pendingTenantChoice.memberships
                    .filter((m) => m.status === "ACTIVE" && m.domain)
                    .map((m) => (
                      <button
                        key={m.membershipId}
                        type="button"
                        onClick={() => chooseTenant(m)}
                        className="flex w-full items-center justify-between rounded-xl border border-input px-4 py-3 text-left transition hover:border-primary hover:bg-primary/5"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">{m.tenantName}</p>
                          <p className="text-xs text-muted-foreground">{m.roleKey}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                </div>
              </motion.div>
            )}

            {/* ---------------- SIGN IN ---------------- */}
            {!pendingTenantChoice && mode === "signin" && (
              <motion.div key="signin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h2 className="font-display text-3xl font-extrabold text-foreground">Masuk ke AITOMA</h2>
                <p className="mt-1 text-sm text-muted-foreground">Masukkan email dan password akun Anda.</p>

                <form onSubmit={submitSignin} className="mt-6 space-y-4">
                  <Field label="Email" required>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@perusahaan.id" autoComplete="username" />
                  </Field>
                  <Field label="Password" required>
                    <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                  </Field>
                  <div className="flex justify-end -mt-1"><button type="button" onClick={() => setMode("forgot")} className="text-xs font-semibold text-primary hover:underline">Lupa password?</button></div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? "Memproses..." : <>Masuk <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </form>

                <p className="mt-4 text-center text-sm text-muted-foreground">
                  Belum punya akun?{" "}
                  <button onClick={() => setMode("signup")} className="font-semibold text-primary hover:underline">Coba gratis 15 hari</button>
                </p>
              </motion.div>
            )}

            {/* ---------------- SIGN UP ---------------- */}
            {!pendingTenantChoice && mode === "signup" && (
              <motion.div key="signup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button onClick={() => setMode("signin")} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Kembali
                </button>
                <h2 className="font-display text-3xl font-extrabold text-foreground">Mulai Free Trial</h2>
                <p className="mt-1 text-sm text-muted-foreground">Daftarkan perusahaan Anda dan coba AITOMA gratis.</p>
                <p className="mt-2 rounded-lg bg-[hsl(var(--warning))]/10 px-3 py-2 text-xs text-[hsl(var(--warning))]">
                  Mode demo — pendaftaran ini belum tersambung ke alur onboarding backend (verifikasi email &amp; provisioning tenant). Untuk akun produksi, buat lewat Super Admin dulu.
                </p>

                <form onSubmit={submitSignup} className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Nama Perusahaan" required>
                      <Input value={su.companyName} onChange={(e) => setSu({ ...su, companyName: e.target.value })} placeholder="PT Contoh Industri" />
                    </Field>
                    <Field label="Nama Anda" required>
                      <Input value={su.adminName} onChange={(e) => setSu({ ...su, adminName: e.target.value })} placeholder="Nama lengkap" />
                    </Field>
                    <Field label="Email Kerja" required>
                      <Input type="email" value={su.email} onChange={(e) => setSu({ ...su, email: e.target.value })} placeholder="anda@perusahaan.id" />
                    </Field>
                    <Field label="No. Telepon">
                      <Input value={su.phone} onChange={(e) => setSu({ ...su, phone: e.target.value })} placeholder="0812xxxx" />
                    </Field>
                    <Field label="Kota">
                      <Input value={su.city} onChange={(e) => setSu({ ...su, city: e.target.value })} placeholder="Jakarta" />
                    </Field>
                    <Field label="Industri">
                      <Select value={su.industry} onChange={(e) => setSu({ ...su, industry: e.target.value })}>
                        {["Manufacturing", "Steel & Metals", "Food & Beverage", "Pharmaceutical", "Textile", "Agriculture", "Oil & Gas", "Other"].map((i) => <option key={i}>{i}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Pilih Paket Trial">
                    <div className="space-y-2">
                      {plans.map((p) => {
                        const active = su.planId === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSu({ ...su, planId: p.id })}
                            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                              active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input hover:bg-muted/50"
                            }`}
                          >
                            <div>
                              <p className="text-sm font-semibold text-foreground">{p.name}</p>
                              <p className="text-xs text-muted-foreground">Trial {p.trial_days} hari</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-foreground">Rp {new Intl.NumberFormat("id-ID").format(Number(p.monthly_price || 0))}<span className="text-xs font-normal text-muted-foreground">/bln</span></p>
                              {active && <CheckCircle2 className="ml-auto mt-1 h-4 w-4 text-primary" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label="Password" required>
                    <PasswordInput value={su.password} onChange={(e) => setSu({ ...su, password: e.target.value })} placeholder="Minimal 8 karakter" />
                  </Field>
                  {su.password && (
                    <div>
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < ps.score ? strengthBar[ps.tone] : "bg-muted"}`} />
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Kekuatan password: <span className="font-semibold">{ps.label}</span></p>
                    </div>
                  )}
                  <Field label="Konfirmasi Password" required>
                    <PasswordInput value={su.confirmPassword} onChange={(e) => setSu({ ...su, confirmPassword: e.target.value })} placeholder="Ulangi password" />
                  </Field>
                  {su.confirmPassword && su.confirmPassword !== su.password && (
                    <p className="-mt-2 text-xs text-destructive">Password tidak cocok.</p>
                  )}
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={su.agree} onChange={(e) => setSu({ ...su, agree: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]" />
                    <span>Saya menyetujui <span className="font-semibold text-primary">Syarat & Ketentuan</span> dan <span className="font-semibold text-primary">Kebijakan Privasi</span> AITOMA.</span>
                  </label>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? "Membuat akun..." : <>Buat Akun & Mulai Trial <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </form>
              </motion.div>
            )}

            {/* ---------------- FORGOT PASSWORD ---------------- */}
            {!pendingTenantChoice && mode === "forgot" && (
              <motion.div key="forgot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button onClick={() => { setMode("signin"); setFp({ email: "", sent: false, code: "", newPassword: "", confirmPassword: "" }); }} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Kembali
                </button>
                <h2 className="font-display text-3xl font-extrabold text-foreground">Reset Password</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {fp.code ? "Pilih password baru untuk akun Anda." : fp.sent ? "Periksa email Anda dan buka tautan reset yang kami kirimkan." : "Kami akan mengirim tautan reset ke email Anda."}
                </p>
                <form onSubmit={submitForgot} className="mt-6 space-y-4">
                  {!fp.sent && <Field label="Email" required>
                    <Input type="email" value={fp.email} onChange={(e) => setFp({ ...fp, email: e.target.value })} placeholder="nama@perusahaan.id" />
                  </Field>}
                  {fp.code && (
                    <>
                      <Field label="Password Baru" required>
                        <PasswordInput value={fp.newPassword} onChange={(e) => setFp({ ...fp, newPassword: e.target.value })} placeholder="Minimal 8 karakter" />
                      </Field>
                      <Field label="Konfirmasi Password Baru" required>
                        <PasswordInput value={fp.confirmPassword} onChange={(e) => setFp({ ...fp, confirmPassword: e.target.value })} placeholder="Ulangi password baru" />
                      </Field>
                      {fp.newPassword && (
                        <div className="flex gap-1">
                          {[0, 1, 2, 3].map((i) => (
                            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < fps.score ? strengthBar[fps.tone] : "bg-muted"}`} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {!fp.sent && <Button type="submit" disabled={busy} className="w-full">{busy ? "Memproses..." : <>Kirim Tautan Reset <ArrowRight className="h-4 w-4" /></>}</Button>}
                  {fp.code && <Button type="submit" disabled={busy} className="w-full">{busy ? "Memproses..." : <>Reset Password <CheckCircle2 className="h-4 w-4" /></>}</Button>}
                </form>
                {/* FIX: once a reset link has been requested (fp.sent) but the user
                    hasn't opened the emailed link yet (fp.code still empty), the form
                    used to render no fields and no button at all — a dead end if the
                    email was slow, filtered to spam, or sent to the wrong inbox. This
                    lets them fire off another link without leaving the screen. */}
                {fp.sent && !fp.code && (
                  <div className="mt-4 space-y-2 text-center">
                    <p className="text-xs text-muted-foreground">Tidak menerima email?</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await requestPasswordReset(fp.email.trim());
                          toast.success("Tautan reset dikirim ulang. Periksa email Anda.");
                        } catch (error) { toast.error(error.message || "Gagal mengirim ulang tautan reset."); }
                        finally { setBusy(false); }
                      }}
                      className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                    >
                      Kirim ulang tautan reset
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8 text-center">
            <a
              href="/system-guide"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 transition hover:underline"
            >
              <BookOpen className="h-4 w-4" /> Lihat System Guide — panduan alur & role sistem
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}