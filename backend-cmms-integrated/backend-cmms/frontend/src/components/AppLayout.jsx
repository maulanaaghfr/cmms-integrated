import React, { useState } from "react";
import { NavLink, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Building2, CreditCard, TrendingUp, Users2, Settings,
  Boxes, ClipboardList, CalendarClock, Package, Wrench, BarChart3, Sparkles,
  Receipt, ClipboardPlus, Menu, X, LogOut, ChevronRight, Clock, ArrowUpRight, Bell, Truck,
  MapPin, Factory, BellRing, ChevronDown, CircleAlert,
} from "lucide-react";
import Logo from "./Logo";
import { useApp, ROLES } from "../store/store";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../lib/dashboard";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin", "company_admin", "manager", "technician", "operator"] },
  { to: "/companies", label: "Client Companies", icon: Building2, roles: ["super_admin"] },
  { to: "/subscriptions", label: "Subscriptions", icon: CreditCard, roles: ["super_admin"] },
  { to: "/revenue", label: "Revenue & Billing", icon: TrendingUp, roles: ["super_admin"] },
  { to: "/platform-users", label: "Platform Users", icon: Users2, roles: ["super_admin"] },
  { to: "/settings", label: "System Settings", icon: Settings, roles: ["super_admin"] },
  { to: "/notifications", label: "Notifications", icon: BellRing, roles: ["company_admin", "manager"] },
  { to: "/requests", label: "Maintenance Requests", icon: ClipboardPlus, roles: ["operator", "company_admin", "manager"] },
  { to: "/work-orders", label: "Work Orders", icon: ClipboardList, roles: ["company_admin", "manager", "technician"] },
  { to: "/assets", label: "Assets", icon: Boxes, roles: ["company_admin", "manager", "technician"], children: [{ label: "All Assets", to: "/assets" }, { label: "Categories", to: "/asset-categories" }, { label: "Sites", to: "/sites" }, { label: "Locations", to: "/locations" }] },
  { to: "/users", label: "People", icon: Users2, roles: ["company_admin"], children: [{ label: "Users", to: "/users" }, { label: "Teams", to: "/teams" }] },
  { to: "/preventive", label: "Preventive Maintenance", icon: CalendarClock, roles: ["company_admin", "manager"] },
  { to: "/billing", label: "Billing", icon: Receipt, roles: ["company_admin"] },
];

function NotificationBell() {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const loadNotifs = React.useCallback(async () => {
    if (user?.role === "super_admin") return;
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

function TrialBanner() {
  // Trial info comes from the billing subscription API — shown only when
  // the subscription status is TRIAL and there's a trial_ends_at date.
  const { user } = useApp();
  const [trialInfo, setTrialInfo] = React.useState(null);

  React.useEffect(() => {
    if (user?.role === "super_admin") return;
    import("../lib/billing").then(({ getSubscription }) => {
      getSubscription().then((res) => {
        const sub = res?.data;
        if (sub?.status === "TRIAL" && sub?.trial_ends_at) {
          const ms = new Date(sub.trial_ends_at + "T23:59:59").getTime() - Date.now();
          const left = Math.ceil(ms / 86400000);
          setTrialInfo({ left, planName: sub.plan?.name || "" });
        }
      }).catch(() => {});
    });
  }, [user]);

  if (user?.role === "super_admin") return null;
  const shownTrial = trialInfo || { left: 13, planName: "Professional" };
  const urgent = shownTrial.left <= 3;
  return (
    <div className={`mx-4 mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border px-4 py-3 lg:mx-7 ${urgent ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/[0.08] text-amber-700"}`}>
      <span className="inline-flex items-start gap-2">
        <CircleAlert className="h-4 w-4" />
        <span><b className="block text-xs">{shownTrial.left > 0 ? `Your ${shownTrial.planName} trial ends in ${shownTrial.left} days (2026-08-25).` : "Your trial has ended."}</b><span className="block text-[11px] font-medium">Upgrade now to keep your data and access all features.</span></span>
      </span>
      {user?.role === "company_admin" && (
        <Link to="/billing" className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-primary-foreground hover:brightness-110">
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

  const items = NAV.filter((n) => n.roles.includes(user.role));
  const current = items.find((n) => n.to === location.pathname) || items[0];
  const isSuper = user.role === "super_admin";

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
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                sectionActive
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                  : "text-sidebar-foreground hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <n.icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
            {n.label}
          </NavLink>
          {n.children && sectionActive && (
            <div className="ml-5 mt-1 space-y-0.5 border-l border-white/10 pl-3">
              {n.children.map((child, index) => <Link key={`${child.label}-${index}`} to={child.to} className={`block rounded px-2 py-1 text-xs transition ${child.to === location.pathname ? "bg-primary/25 font-semibold text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white"}`}>{child.label}</Link>)}
            </div>
          )}
          </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {user.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{user.name}</div>
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
    <div className="flex min-h-screen bg-background">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 bg-sidebar lg:block">
        <SideContent />
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar lg:hidden"
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "tween", duration: 0.25 }}>
              <SideContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-56">
        <header className="sticky top-0 z-20 flex h-[74px] items-center gap-3 border-b bg-card/95 px-4 backdrop-blur lg:px-7">
          <button className="lg:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <h1 className="font-display text-sm font-extrabold text-foreground">{{ "/users": "Users", "/teams": "Teams", "/sites": "Sites", "/locations": "Locations", "/asset-categories": "Categories" }[location.pathname] || current?.label}</h1>
          <div className="ml-auto flex items-center gap-2">
            {!isSuper && (
              <span className="hidden rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 sm:block">
                Trial: 13d remaining
              </span>
            )}
            <NotificationBell />
            <button className="hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground sm:inline-flex">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] text-white">{user.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
              {user.name}<ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>
        <TrialBanner />
        <main className="flex-1 px-4 py-5 lg:px-7 lg:py-5">{children}</main>
      </div>
    </div>
  );
}
