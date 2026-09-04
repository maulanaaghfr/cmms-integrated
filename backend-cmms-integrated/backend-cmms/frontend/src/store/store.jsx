import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiLogin, apiLogout, apiFetchSession, selectTenant, apiChangePassword } from "../lib/auth";
import { getToken } from "../lib/api";

/* ---------------------------------- utils --------------------------------- */
export function idr(n) {
  return "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}
export function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/* ------------------------------- role config ------------------------------ */
export const ROLES = {
  super_admin: { label: "Super Admin Aitoma", scope: "Internal Aitoma — platform, clients & billing" },
  company_admin: { label: "Administrator", scope: "Full access — WO, requests, assets, locations, people & settings" },
  limited_admin: { label: "Limited Administrator", scope: "Same as Administrator, tanpa akses Settings & People/Teams" },
  manager: { label: "Maintenance Manager", scope: "Work orders, technicians & schedules" },
  supervisor: { label: "Supervisor", scope: "Kelola lokasi, tim, aset, dan preventive maintenance pada site sendiri" },
  technician: { label: "Technician", scope: "Create/complete WO, assets, locations — edit/delete data sendiri" },
  limited_technician: { label: "Limited Technician", scope: "Hanya melihat WO yang ditugaskan ke dirinya" },
  operator: { label: "Equipment Operator", scope: "Request maintenance & view equipment" },
  requester: { label: "Requester", scope: "Hanya submit request & lihat status" },
  view_only: { label: "View Only", scope: "Melihat semua data, tidak dapat mengubah" },
  provider: { label: "Provider (Vendor)", scope: "Akses eksternal — kolaborasi WO bersama, compliance & chat" },
};

export const CLIENT_ROLE_OPTIONS = ["company_admin", "limited_admin", "manager", "technician", "limited_technician", "operator", "requester", "view_only"];
export const DEPARTMENTS = ["Maintenance", "Operations", "Production", "Engineering", "Warehouse", "Procurement", "Management"];

/* trial length by tier (days) — used by Login signup form (demo only) */
export const TRIAL_DAYS = { Basic: 15, Professional: 15, Enterprise: 30 };

export function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function passwordStrength(pw) {
  let s = 0;
  if (!pw) return { score: 0, label: "Terlalu lemah", tone: "danger" };
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const meta = [
    { label: "Terlalu lemah", tone: "danger" },
    { label: "Lemah", tone: "danger" },
    { label: "Cukup", tone: "warning" },
    { label: "Kuat", tone: "accent" },
    { label: "Sangat kuat", tone: "success" },
  ];
  return { score: s, ...meta[s] };
}

export function genPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s + "!";
}

/* AI Insights — static/demo data, no backend endpoint yet */
export const AI_INSIGHTS = [
  { id: 1, type: "Predictive Maintenance", severity: "critical", asset: "Industrial Chiller Unit", title: "Kegagalan kompresor diprediksi dalam 72 jam", detail: "Signature getaran dan drift suhu cocok dengan pola pra-kegagalan historis. Confidence 94%. Segera buat work order korektif.", confidence: 94 },
  { id: 2, type: "Anomaly Detection", severity: "high", asset: "Packaging Line Palletizer", title: "Arus motor abnormal terdeteksi", detail: "Amperage motor 18% di atas baseline selama 6 siklus berturut-turut. Kemungkinan keausan bearing.", confidence: 81 },
  { id: 3, type: "Smart Prioritization", severity: "medium", asset: "Hydraulic Press 500T", title: "Naikkan prioritas WO-8802 di atas tugas PM", detail: "Kebocoran seal berdampak pada throughput Line 1 (est. 240 unit/jam). Prioritas disarankan menjadi High.", confidence: 88 },
  { id: 4, type: "Cost Optimization", severity: "low", asset: "Air Compressor GA-90", title: "Perpanjang interval filter 2 minggu", detail: "Pola penggunaan menunjukkan duty cycle lebih rendah. Optimasi jadwal menghemat ~Rp 2.700.000/kuartal.", confidence: 76 },
  { id: 5, type: "Intelligent Scheduling", severity: "medium", asset: "Robotic Welding Cell", title: "Jadwalkan ulang kalibrasi ke slot Selasa pagi", detail: "Rizky Pratama memiliki beban kerja 64% dan lokasi terdekat pada Selasa pagi \u2014 estimasi waktu tempuh 8 menit lebih cepat dibanding jadwal saat ini.", confidence: 82 },
  { id: 6, type: "Document Intelligence", severity: "low", asset: "Boiler System Unit 2", title: "Manual servis terbaru tersedia untuk unit ini", detail: "Sistem menemukan revisi manual pemeliharaan (v1.6) dengan prosedur pressure-relief yang diperbarui \u2014 relevansi 91% terhadap riwayat kerja unit ini.", confidence: 91 },
];

/* -------------------------------- context --------------------------------- */
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(() => !!getToken());
  const [pendingTenantChoice, setPendingTenantChoice] = useState(null);

  // Re-hydrate session from stored token on page refresh
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await apiFetchSession();
      if (cancelled) return;
      if (session) setUser(session.user);
      setAuthLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await apiLogin(email, password);
    if (!res.ok) return { ok: false, error: res.error };
    if (res.needsTenantSelection) {
      setPendingTenantChoice({ apiUser: res.user, memberships: res.memberships });
      return { ok: true, needsTenantSelection: true, memberships: res.memberships };
    }
    setUser(res.user);
    return { ok: true, user: res.user };
  }, []);

  const completeTenantSelection = useCallback(async (membership) => {
    if (!pendingTenantChoice) return { ok: false, error: "Sesi login sudah kadaluarsa, coba masuk lagi." };
    const sessionUser = await selectTenant(pendingTenantChoice.apiUser, membership);
    setUser(sessionUser);
    setPendingTenantChoice(null);
    return { ok: true, user: sessionUser };
  }, [pendingTenantChoice]);

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
    setPendingTenantChoice(null);
  }, []);

  /**
   * Change the signed-in user's temporary/expired password.
   *
   * FIX (2026-09-04): required because a user with `must_change_password`
   * is blocked from EVERY tenant-scoped API call (work orders, users,
   * notifications, ...) by the backend — but nothing in the frontend ever
   * gave that user a way to actually change the password, so they'd land
   * on an empty dashboard with silent 403s in the console and no
   * indication why. See ChangePassword.jsx, rendered by Shell() in App.jsx
   * whenever `user.mustChangePassword` is true, before any other route.
   *
   * On success we re-fetch the whole session (not just flip a flag)
   * because must_change_password being true was also blocking
   * resolveTenantUserId()'s call to GET /users/me — so the user's session
   * so far may have `tenantUserId: null` too. Re-running apiFetchSession()
   * resolves both in one go.
   */
  const changePassword = useCallback(async ({ currentPassword, password, passwordConfirmation }) => {
    try {
      await apiChangePassword({ currentPassword, password, passwordConfirmation });
      const session = await apiFetchSession();
      if (session) setUser(session.user);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || "Gagal mengganti password." };
    }
  }, []);

  // Demo-only signup — not connected to real onboarding backend.
  // Real tenant creation goes through Super Admin or onboarding flow.
  // Demo-only password reset
  const value = {
    user,
    authLoading,
    pendingTenantChoice,
    completeTenantSelection,
    login,
    logout,
    changePassword,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

/* permission helper */
export function can(role, action) {
  const perms = {
    super_admin: ["*"],
    company_admin: ["users", "settings", "assets", "workorders", "requests", "locations", "manufacturers", "pm", "inventory", "technicians", "analytics", "ai", "billing"],
    limited_admin: ["assets", "workorders", "requests", "locations", "manufacturers", "pm", "inventory", "technicians", "analytics", "ai"],
    manager: ["workorders", "requests", "pm", "inventory", "technicians", "analytics", "ai", "assets:view", "locations:view", "manufacturers:view"],
    supervisor: ["workorders", "requests", "pm", "inventory", "assets", "locations", "teams"],
    technician: ["workorders:mine", "workorders:create", "assets:view", "locations:view"],
    limited_technician: ["workorders:mine:view"],
    operator: ["requests", "assets:view"],
    requester: ["requests:create", "requests:view"],
    view_only: ["assets:view", "workorders:view", "locations:view", "manufacturers:view", "inventory:view", "analytics:view"],
    provider: ["workorders:shared", "compliance", "chat"],
  };
  const list = perms[role] || [];
  return list.includes("*") || list.includes(action);
}