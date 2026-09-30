import React, { useState } from "react";
import { NavLink, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Building2, CreditCard, TrendingUp, Users2, Settings,
  Boxes, ClipboardList, CalendarClock, Package, Wrench, BarChart3, Sparkles,
  Receipt, ClipboardPlus, ShoppingCart, Menu, X, LogOut, ChevronRight, Clock, ArrowUpRight, Bell,
  MapPin, Factory, BellRing, ChevronDown, CircleAlert, Search,
} from "lucide-react";
import Logo from "./Logo";
import { useApp, ROLES } from "../store/store";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../lib/dashboard";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin", "company_admin", "manager", "technician", "operator", "vendor", "warehouse"] },
  { to: "/parts/barcode", label: "Parts / Barcode", icon: Package, roles: ["technician"] },
  { to: "/companies", label: "Client Companies", icon: Building2, roles: ["super_admin"] },
  { to: "/subscriptions", label: "Subscriptions", icon: CreditCard, roles: ["super_admin"] },
  { to: "/revenue", label: "Revenue & Billing", icon: TrendingUp, roles: ["super_admin"] },
  { to: "/platform-users", label: "Platform Users", icon: Users2, roles: ["super_admin"] },
  { to: "/settings", label: "System Settings", icon: Settings, roles: ["super_admin"] },
  { to: "/notifications", label: "Notifications", icon: BellRing, roles: ["company_admin", "manager", "technician", "operator", "vendor", "warehouse"] },
  { to: "/requests", label: "Maintenance Requests", icon: ClipboardPlus, roles: ["operator", "company_admin", "manager"] },
  { to: "/work-orders", label: "Work Orders", icon: ClipboardList, roles: ["company_admin", "manager", "technician"] },
  { to: "/technicians", label: "Technicians", icon: Wrench, roles: ["company_admin", "manager"] },
  { to: "/assets", label: "Assets", icon: Boxes, roles: ["company_admin", "technician", "operator"], children: [{ label: "All Assets", to: "/assets" }, { label: "Categories", to: "/asset-categories" }, { label: "Sites", to: "/sites" }, { label: "Locations", to: "/locations" }] },
  { to: "/people", label: "People", icon: Users2, roles: ["company_admin"], children: [{ label: "Overview", to: "/people" }, { label: "Users", to: "/users" }, { label: "Teams", to: "/teams" }] },
  { to: "/procurement", label: "Procurement", icon: ShoppingCart, roles: ["company_admin", "manager", "vendor", "warehouse"] },
  { to: "/preventive", label: "Preventive Maintenance", icon: CalendarClock, roles: ["company_admin"] },
  { to: "/ai-insights", label: "AI Insights", icon: Sparkles, roles: ["company_admin"] },
  { to: "/analytics", label: "Analytics", icon: BarChart3, roles: ["company_admin", "manager"] },
  { to: "/inventory", label: "Inventory", icon: Package, roles: ["company_admin", "manager", "warehouse"] },
  { to: "/billing", label: "Billing", icon: Receipt, roles: ["company_admin"] },
  { to: "/profile", label: "Profil", icon: Users2, roles: ["manager", "technician", "operator"] },
];

function NotificationBell() {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const loadNotifs = React.useCallback(async () => {
    if (["super_admin"].includes(user?.role)) return;
    try {
      const res = await listNotifications();
      setNotifications(res.data || []);
    } catch { /* silent */ }
  }, [user]);

  React.useEffect(() => { loadNotifs(); }, [loadNotifs]);

  const unread = notifications.filter((n) => !n.read_at).length;

  const handleRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    } catch { /* silent */ }
  };

  const handleReadAll = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch { /* silent */ }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
              className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border bg-card p-2 shadow-2xl">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-sm font-semibold text-foreground">Notifikasi</span>
                {unread > 0 && <button onClick={handleReadAll} className="text-xs font-semibold text-primary">Tandai semua dibaca</button>}
              </div>
              <div className="max-h-80 overflow-y-auto aitoma-scroll">
                {notifications.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Belum ada notifikasi.</p>}
                {notifications.slice(0, 20).map((n) => (
                  <button key={n.id} onClick={() => handleRead(n.id)}
                    className={`block w-full rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-muted ${n.read_at ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-1.5 font-semibold text-foreground">{!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}{n.title}</div>
                    <div className="mt-0.5 text-muted-foreground">{n.message || n.body}</div>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Derives what the top banner/badge should say from the real subscription.
// Returns: undefined while loading, or one of:
//   null                              -> nothing to show (super_admin, or an active non-trial plan)
//   { type: "trial", left, planName, endsAt }
//   { type: "none" }                  -> no subscription/plan at all yet
function useBillingBanner(user) {
  const [banner, setBanner] = React.useState(undefined);

  React.useEffect(() => {
    if (!user || ["super_admin", "vendor", "warehouse", "technician", "operator", "manager"].includes(user.role)) {
      setBanner(null);
      return;
    }
    let cancelled = false;
    import("../lib/billing").then(({ getSubscription }) => {
      getSubscription()
        .then((res) => {
          if (cancelled) return;
          const sub = res?.data;
          if (sub?.pending?.plan?.name) {
            // A plan was picked but the invoice isn't paid yet — nudge to finish paying,
            // this takes priority over the "no plan"/trial nudges below.
            setBanner({ type: "pending", planName: sub.pending.plan.name, dueAt: sub.pending.invoice?.due_at || null });
          } else if (!sub || !sub.plan?.name) {
            setBanner({ type: "none" });
          } else if (sub.status === "TRIAL" && sub.trial_ends_at) {
            const endsAt = new Date(`${sub.trial_ends_at}T23:59:59`);
            const left = Math.ceil((endsAt.getTime() - Date.now()) / 86400000);
            setBanner({ type: "trial", left, planName: sub.plan?.name || "", endsAt: sub.trial_ends_at });
          } else {
            setBanner(null); // has an active, non-trial plan — nothing to nudge
          }
        })
        .catch(() => { if (!cancelled) setBanner(null); });
    });
    return () => { cancelled = true; };
  }, [user]);

  return banner;
}

function TrialBanner({ banner, canUpgrade }) {
  if (!banner) return null;

  if (banner.type === "pending") {
    const dueLabel = banner.dueAt
      ? new Date(`${banner.dueAt}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
      : null;
    return (
      <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/[0.08] px-4 py-3 text-amber-700 lg:mx-7">
        <span className="inline-flex items-start gap-2">
          <CircleAlert className="h-4 w-4" />
          <span>
            <b className="block text-xs">Paket {banner.planName} belum aktif — menunggu pembayaran.</b>
            <span className="block text-[11px] font-medium">
              {dueLabel ? `Selesaikan pembayaran sebelum ${dueLabel} agar paket aktif otomatis.` : "Selesaikan pembayaran agar paket aktif otomatis."}
            </span>
          </span>
        </span>
        {canUpgrade && (
          <Link to="/billing" className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-primary-foreground hover:brightness-110">
            Bayar sekarang <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    );
  }

  if (banner.type === "none") {
    return (
      <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/[0.08] px-4 py-3 text-amber-700 lg:mx-7">
        <span className="inline-flex items-start gap-2">
          <CircleAlert className="h-4 w-4" />
          <span>
            <b className="block text-xs">You don&apos;t have an active plan yet.</b>
            <span className="block text-[11px] font-medium">Choose a plan to unlock all CMMS features.</span>
          </span>
        </span>
        {canUpgrade && (
          <Link to="/billing?upgrade=1" className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-primary-foreground hover:brightness-110">
            Choose a plan <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    );
  }

  // type === "trial"
  const urgent = banner.left <= 3;
  const ended = banner.left <= 0;
  const formattedDate = new Date(`${banner.endsAt}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className={`mx-4 mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border px-4 py-3 lg:mx-7 ${urgent ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/[0.08] text-amber-700"}`}>
      <span className="inline-flex items-start gap-2">
        <CircleAlert className="h-4 w-4" />
        <span>
          <b className="block text-xs">
            {ended
              ? "Your trial has ended."
              : `Your ${banner.planName} trial ends in ${banner.left} day${banner.left === 1 ? "" : "s"} (${formattedDate}).`}
          </b>
          <span className="block text-[11px] font-medium">Upgrade now to keep your data and access all features.</span>
        </span>
      </span>
      {canUpgrade && (
        <Link to="/billing?upgrade=1" className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-primary-foreground hover:brightness-110">
          Upgrade <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

export default function AppLayout({ children }) {
  const { user, logout } = useApp();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const banner = useBillingBanner(user);

  const roleOrder = {
    manager: ["/dashboard", "/requests", "/work-orders", "/technicians", "/inventory", "/procurement", "/analytics", "/notifications", "/profile"],
    technician: ["/dashboard", "/work-orders", "/assets", "/parts/barcode", "/notifications", "/profile"],
    operator: ["/dashboard", "/requests", "/assets", "/notifications", "/profile"],
    vendor: ["/dashboard", "/procurement", "/notifications"],
    warehouse: ["/dashboard", "/inventory", "/procurement", "/notifications"],
  };
  const items = NAV.filter((n) => n.roles.includes(user.role)).sort((a, b) => {
    const order = roleOrder[user.role];
    if (!order) return 0;
    return (order.indexOf(a.to) < 0 ? 999 : order.indexOf(a.to)) - (order.indexOf(b.to) < 0 ? 999 : order.indexOf(b.to));
  });
  const roleLabels = {
    // The Manager workspace follows the supplied Aitoma design language.
    manager: { "/requests": "Permintaan", "/work-orders": "Work Order", "/technicians": "Teknisi", "/inventory": "Inventaris", "/procurement": "Pengadaan", "/analytics": "Analytics", "/notifications": "Notifikasi", "/profile": "Pengaturan" },
    operator: { "/requests": "Permintaan Saya", "/assets": "Peralatan", "/notifications": "Notifikasi", "/profile": "Profil" },
    vendor: { "/procurement": "Procurement", "/notifications": "Notifications" },
  };
  const navLabel = (item) => roleLabels[user.role]?.[item.to] || item.label;
  const current = items.find((n) => n.to === location.pathname) || items[0];
  const isSuper = user.role === "super_admin";
  const isManager = user.role === "manager";
  const isOperator = user.role === "operator";
  const isTechnician = user.role === "technician";

  const SideContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
        <Logo textClass="text-white" />
        <button className="lg:hidden text-sidebar-foreground" onClick={() => setOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>
      {isSuper && (
        <div className="mx-4 mb-3 rounded-xl bg-primary/20 px-3 py-2 text-xs font-semibold text-primary-foreground">
          <span className="text-primary">●</span> Internal Platform Console
        </div>
      )}
      {isManager && (
        <div className="mx-4 mb-3 rounded-xl border border-sky-400/30 bg-sky-950/70 px-3 py-3 text-sky-100">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em]">Manager workspace</p>
          <p className="mt-1 text-[11px] text-sky-200/80">Review, assign, monitor</p>
        </div>
      )}
      {isOperator && (
        <div className="mx-4 mb-3 rounded-xl border border-emerald-400/20 bg-emerald-950/60 px-3 py-2.5 text-emerald-100">
          <p className="text-[11px] font-semibold"><span className="mr-1.5 text-emerald-400">●</span>Online · Shift A aktif</p>
        </div>
      )}
      
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 aitoma-scroll">
        {items.map((n) => {
          const sectionActive = location.pathname === n.to || n.children?.some((child) => child.to === location.pathname);
          return (
          <div key={n.to}>
          <NavLink
            key={n.to}
            to={n.to}
            onClick={() => setOpen(false)}
            className={() =>
              `flex items-center gap-3 rounded-lg px-3 ${isManager ? "min-h-10 py-2.5" : "py-2"} text-sm font-medium transition ${
                sectionActive
                  ? "bg-[#2563EB] text-white shadow-lg shadow-blue-900/30"
                  : "text-sidebar-foreground hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <n.icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
            {navLabel(n)}
          </NavLink>
          {n.children && sectionActive && !isOperator && (
            <div className="ml-5 mt-1 space-y-0.5 border-l border-white/10 pl-3">
              {n.children.map((child, index) => <Link key={`${child.label}-${index}`} to={child.to} className={`block rounded px-2 py-1 text-xs transition ${child.to === location.pathname ? "bg-primary/25 font-semibold text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white"}`}>{child.label}</Link>)}
            </div>
          )}
          </div>
          );
        })}
      </nav>
      <div className={`border-t border-white/10 p-4 ${isManager ? "bg-cyan-950/30" : ""}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-primary-foreground ${isManager ? "bg-primary" : "bg-primary"}`}>
            {user.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </div>
          <div className="min-w-0 flex-1">
            <Link to="/profile" onClick={() => setOpen(false)} className="truncate text-sm font-semibold text-white hover:text-primary">{user.name}</Link>
            <div className="truncate text-xs text-sidebar-foreground">{ROLES[user.role].label}</div>
          </div>
          <button onClick={logout} title="Logout" className="text-sidebar-foreground hover:text-white">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`flex min-h-screen ${isManager ? "bg-[#F8FAFC]" : isOperator ? "operator-theme bg-[#f6f8fb]" : isTechnician ? "technician-theme bg-[#f6f8fb]" : "bg-background"}`}>
      {/* desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block ${isManager ? "bg-[#0F172A]" : "bg-sidebar"}`}>
        <SideContent />
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className={`fixed inset-y-0 left-0 z-50 w-64 lg:hidden ${isManager ? "bg-[#0F172A]" : "bg-sidebar"}`}
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "tween", duration: 0.25 }}>
              <SideContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <header className={`sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur lg:px-6 ${isManager ? "border-[#E2E8F0] bg-white/95" : "border-border/70 bg-card/95"}`}>
          <button className="lg:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <div className="min-w-0">
            <h1 className={`truncate font-display text-sm font-extrabold ${isManager ? "text-foreground" : "text-foreground"}`}>{isManager && location.pathname === "/dashboard" ? "Dashboard" : ({ "/profile": isManager ? "Pengaturan" : "Profil Saya", "/users": "Users", "/teams": "Teams", "/sites": "Sites", "/locations": "Locations", "/asset-categories": "Categories" }[location.pathname] || navLabel(current))}</h1>
            <p className="hidden text-[10px] text-muted-foreground sm:block">{new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden w-48 md:block lg:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input aria-label="Pencarian global" placeholder="Cari WO, aset, permintaan..." className="h-9 w-full rounded-lg border border-border/80 bg-background pl-9 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            {banner?.type === "trial" && (
              <span className={`hidden rounded-lg border px-3 py-1.5 text-xs font-semibold sm:block ${banner.left <= 3 ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
                {banner.left > 0 ? `Trial: ${banner.left}d remaining` : "Trial ended"}
              </span>
            )}
            {banner?.type === "none" && (
              <span className="hidden rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 sm:block">
                No active plan
              </span>
            )}
            {isOperator && (
              <Link to="/requests?create=1" className="hidden items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:inline-flex">
                <span className="text-base leading-none">+</span> Ajukan Permintaan
              </Link>
            )}
            <NotificationBell />
            <Link
              to="/profile"
              className="hidden items-center gap-2 rounded-xl border border-border/70 bg-background px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:bg-primary/[0.04] hover:text-foreground sm:inline-flex"
              aria-label="Buka profil saya"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2563EB] text-[10px] text-white">{user.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
              <span className="max-w-32 truncate">{user.name}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>
        <TrialBanner banner={banner} canUpgrade={user.role === "company_admin"} />
        <main className={`flex-1 px-4 py-5 lg:px-7 lg:py-5 ${isManager ? "bg-[#F8FAFC]" : ""}`}>
          {isManager && location.pathname !== "/dashboard" && (
            <div className="mx-auto mb-5 flex max-w-[1240px] items-center justify-between border-b border-[#E2E8F0] pb-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563EB]">Manager workspace</p><p className="mt-1 text-xs text-slate-500">Review, assign, monitor</p></div>
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-semibold text-blue-700">Maintenance Manager</span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
