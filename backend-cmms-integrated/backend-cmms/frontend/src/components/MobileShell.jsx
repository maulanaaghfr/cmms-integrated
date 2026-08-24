import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Home, ClipboardList, Bell, User, ClipboardPlus, WifiOff, Wifi } from "lucide-react";
import Logo from "./Logo";
import { useApp } from "../store/store";
import { listNotifications } from "../lib/dashboard";

export default function MobileShell({ children }) {
  const { user } = useApp();
  const [offline, setOffline] = useState(false);
  const [unread, setUnread] = useState(0);
  const isTech = user?.role === "technician";

  useEffect(() => {
    listNotifications()
      .then((res) => setUnread((res.data || []).filter((n) => !n.read_at).length))
      .catch(() => {});
  }, []);

  const tabs = isTech
    ? [
        { to: "/dashboard", label: "Home", icon: Home },
        { to: "/work-orders", label: "Kerja", icon: ClipboardList },
        { to: "/notifications", label: "Notifikasi", icon: Bell, badge: unread },
        { to: "/profile", label: "Profil", icon: User },
      ]
    : [
        { to: "/dashboard", label: "Home", icon: Home },
        { to: "/requests", label: "Permintaan", icon: ClipboardPlus },
        { to: "/notifications", label: "Notifikasi", icon: Bell, badge: unread },
        { to: "/profile", label: "Profil", icon: User },
      ];

  return (
    <div className="flex min-h-screen flex-col bg-background app-gradient">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card/95 px-4 py-3 backdrop-blur">
        <Logo textClass="text-foreground" />
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setOffline((o) => !o)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              offline ? "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]" : "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
            }`}
            title="Toggle offline mode"
          >
            {offline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
            {offline ? "Offline" : "Online"}
          </button>
        </div>
      </header>

      {offline && (
        <div className="bg-[hsl(var(--warning))]/10 px-4 py-1.5 text-center text-[11px] font-semibold text-[hsl(var(--warning))]">
          Mode offline aktif — perubahan akan disinkronkan otomatis saat online kembali.
        </div>
      )}

      <main className="aitoma-scroll flex-1 overflow-y-auto px-4 py-4 pb-24">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch justify-between px-2">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`relative flex h-9 w-9 items-center justify-center rounded-xl transition ${isActive ? "bg-primary/10" : ""}`}>
                    <t.icon className="h-5 w-5" />
                    {!!t.badge && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                        {t.badge > 9 ? "9+" : t.badge}
                      </span>
                    )}
                  </span>
                  {t.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
