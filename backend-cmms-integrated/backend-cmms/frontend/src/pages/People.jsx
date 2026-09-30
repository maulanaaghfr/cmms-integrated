import React, { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck, UsersRound, UserRoundPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { listTeams, listUsers } from "../lib/organization";
import { Card, PageHeader, Pill, Reveal, StatCard } from "../components/kit";

const initials = (name = "") => name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";

export default function People() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { const [userResponse, teamResponse] = await Promise.all([listUsers({ per_page: 200 }), listTeams({ per_page: 200 })]); setUsers(userResponse?.data || []); setTeams(teamResponse?.data || []); }
    catch (error) { toast.error(error.message || "Data People gagal dimuat."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const activeUsers = users.filter((user) => user.status === "ACTIVE");
  const technicians = users.filter((user) => ["TECHNICIAN", "SUPERVISOR"].includes(user.role_key));
  const invited = users.filter((user) => user.status === "INVITED");

  return <Reveal className="mx-auto max-w-5xl">
    <PageHeader title="People" subtitle="Kelola user, tim maintenance, dan akses workspace Anda." />
    <section className="relative isolate mb-5 overflow-hidden rounded-2xl bg-[linear-gradient(120deg,hsl(222_47%_11%),hsl(214_75%_30%))] px-5 py-6 text-white shadow-xl shadow-primary/10 sm:px-7">
      <div className="pointer-events-none absolute -right-12 -top-20 -z-10 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">People workspace</p>
      <h2 className="mt-2 max-w-xl font-display text-2xl font-extrabold tracking-tight">Bangun tim maintenance yang solid.</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-300">Atur peran, tanggung jawab, dan kolaborasi tim dalam satu tempat yang terkontrol.</p>
      <div className="mt-5 flex flex-wrap gap-2"><Link to="/users" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow-lg shadow-primary/20 hover:brightness-110"><UserRoundPlus className="h-4 w-4" /> Kelola user <ArrowRight className="h-3.5 w-3.5" /></Link><Link to="/teams" className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"><UsersRound className="h-4 w-4" /> Kelola teams</Link></div>
    </section>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard icon={UsersRound} label="TOTAL USER" value={loading ? "—" : users.length} /><StatCard icon={CheckCircle2} label="USER AKTIF" value={loading ? "—" : activeUsers.length} tone="success" /><StatCard icon={ShieldCheck} label="TEKNISI & SUPERVISOR" value={loading ? "—" : technicians.length} tone="accent" /><StatCard icon={UserRoundPlus} label="UNDANGAN TERKIRIM" value={loading ? "—" : invited.length} tone="warning" /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Card><div className="mb-4 flex items-center justify-between"><div><h3 className="font-display text-base font-bold">User terbaru</h3><p className="mt-1 text-xs text-muted-foreground">Akun yang terdaftar di workspace</p></div><Link to="/users" className="text-xs font-semibold text-primary">Lihat semua</Link></div>{users.slice(0, 5).map((user) => <div key={user.id} className="flex items-center gap-3 border-b border-border/60 py-3 last:border-0"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials(user.full_name || user.email)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.full_name || user.email}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div><Pill tone={user.status === "ACTIVE" ? "success" : "warning"}>{user.status === "ACTIVE" ? "Aktif" : "Diundang"}</Pill></div>)}{!loading && users.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Belum ada user.</p>}</Card>
      <Card><div className="mb-4 flex items-center justify-between"><div><h3 className="font-display text-base font-bold">Tim maintenance</h3><p className="mt-1 text-xs text-muted-foreground">Kolaborasi berdasarkan site dan keahlian</p></div><Link to="/teams" className="text-xs font-semibold text-primary">Lihat semua</Link></div>{teams.slice(0, 5).map((team) => <div key={team.id} className="flex items-center gap-3 border-b border-border/60 py-3 last:border-0"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><UsersRound className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{team.name}</p><p className="truncate text-xs text-muted-foreground">{team.specialty || "Tim maintenance"}</p></div><Pill tone={team.is_active ? "success" : "muted"}>{team.is_active ? "Aktif" : "Nonaktif"}</Pill></div>)}{!loading && teams.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Belum ada team.</p>}</Card>
    </div>
  </Reveal>;
}
