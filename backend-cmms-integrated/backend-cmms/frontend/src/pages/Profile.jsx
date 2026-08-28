import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useApp, ROLES } from "../store/store";
import { Button, Card, PageHeader, Pill, Reveal } from "../components/kit";

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
  const { user, logout } = useApp();
  const name = user?.name || "Pengguna";
  const roleLabel = ROLES?.[user?.role]?.label || user?.role || "Member";
  const status = String(user?.status || "ACTIVE").toUpperCase();
  const statusLabel = status === "ACTIVE" ? "Aktif" : status === "INACTIVE" ? "Nonaktif" : status;
  const userId = user?.tenantUserId || user?.id || "-";

  return (
    <Reveal className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Profil Saya"
        subtitle="Kelola informasi akun dan lihat status akses Anda."
        action={<Link to="/dashboard"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Kembali</Button></Link>}
      />

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
        <Card className="space-y-5 border-border/70 shadow-sm">
          <div>
            <h3 className="font-display text-base font-bold text-foreground">Informasi akun</h3>
            <p className="mt-1 text-xs text-muted-foreground">Data akun yang sedang digunakan dalam sistem CMMS.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoItem icon={UserRound} label="Nama lengkap" value={name} />
            <InfoItem icon={Mail} label="Email" value={user?.email} />
            <InfoItem icon={ShieldCheck} label="Role akses" value={roleLabel} />
            <InfoItem icon={Building2} label="Perusahaan" value={user?.company} />
          </div>
          <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Keamanan akun</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Jangan membagikan informasi login dan gunakan akun ini hanya pada perangkat yang aman.</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="border-border/70 shadow-sm">
            <h3 className="font-display text-base font-bold text-foreground">Status akses</h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3"><span className="text-xs text-muted-foreground">Status akun</span><Pill tone={status === "ACTIVE" ? "success" : "muted"}>{statusLabel}</Pill></div>
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3"><span className="text-xs text-muted-foreground">Role</span><span className="text-right text-xs font-semibold text-foreground">{roleLabel}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">ID pengguna</span><span className="max-w-36 truncate font-mono text-[11px] text-foreground" title={userId}>{userId}</span></div>
            </div>
          </Card>
          <Card className="border-border/70 bg-muted/[0.18] shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <h3 className="text-sm font-bold text-foreground">Akun terlindungi</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Jika Anda perlu mengubah akses atau data akun, hubungi administrator perusahaan.</p>
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
    </Reveal>
  );
}
