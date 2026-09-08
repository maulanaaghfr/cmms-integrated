import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, RotateCcw, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../store/store";
import { Card, Table, Pill, Button, IconButton, Modal, ConfirmDialog, Field, Input, Select, SearchInput, Reveal } from "../components/kit";
import { listUsers, createUser, updateUser, deleteUser, reactivateUser, listSites, listTeams } from "../lib/organization";
import { requestPasswordReset } from "../lib/auth";

const ROLE_OPTIONS = [
  { value: "COMPANY_ADMIN", label: "Company Admin", tone: "bg-violet-100 text-violet-700" },
  { value: "MANAGER", label: "Manager", tone: "bg-blue-100 text-blue-700" },
  { value: "SUPERVISOR", label: "Supervisor", tone: "bg-cyan-100 text-cyan-700" },
  { value: "TECHNICIAN", label: "Technician", tone: "bg-emerald-100 text-emerald-700" },
  { value: "OPERATOR", label: "Operator", tone: "bg-amber-100 text-amber-700" },
  { value: "VIEWER", label: "Viewer", tone: "bg-slate-100 text-slate-600" },
];
const EMPTY_USER = { full_name: "", email: "", phone: "", employee_code: "", role_key: "TECHNICIAN", primary_site_id: "", temporary_password: "" };
const initials = (name = "") => name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";
const avatarTone = (name = "") => ["bg-rose-600", "bg-violet-600", "bg-amber-600", "bg-blue-600", "bg-emerald-600"][name.length % 5];
const dateLabel = (date) => date ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date)) : "—";
const roleMeta = (key) => ROLE_OPTIONS.find((role) => role.value === key) || { label: key || "—", tone: "bg-slate-100 text-slate-600" };
const displayName = (member = {}) => member.full_name || member.name || member.email?.split("@")[0] || "User";

export default function Users() {
  const { user } = useApp();
  const canEdit = ["company_admin", "manager"].includes(user?.role);
  const [loading, setLoading] = useState(true), [users, setUsers] = useState([]), [sites, setSites] = useState([]), [teams, setTeams] = useState([]);
  const [query, setQuery] = useState(""), [roleFilter, setRoleFilter] = useState("all"), [siteFilter, setSiteFilter] = useState("all");
  const [form, setForm] = useState(null), [selectedUser, setSelectedUser] = useState(null), [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busyUserId, setBusyUserId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersResponse, sitesResponse, teamsResponse] = await Promise.all([listUsers({ per_page: 100 }), listSites(), listTeams()]);
      setUsers(usersResponse.data || []); setSites(sitesResponse.data || []); setTeams(teamsResponse.data || []);
    } catch (error) { toast.error(error.message || "Unable to load users."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const siteName = (id) => sites.find((site) => site.id === id)?.name || "—";
  const teamName = (member) => member.team_name || member.team?.name || (member.team_id && teams.find((team) => team.id === member.team_id)?.name) || "—";
  const filteredUsers = useMemo(() => users.filter((member) => {
    const term = query.trim().toLowerCase();
    return (roleFilter === "all" || member.role_key === roleFilter) && (siteFilter === "all" || member.primary_site_id === siteFilter) && (!term || `${member.full_name || ""} ${member.email || ""}`.toLowerCase().includes(term));
  }), [users, roleFilter, siteFilter, query]);

  const save = async () => {
    if (!form.full_name.trim() || (!form.id && !form.email.trim())) return toast.error("Name and email are required.");
    if (!form.id && !form.temporary_password.trim()) return toast.error("Temporary password is required for a new user.");
    setSaving(true);
    try {
      const payload = { full_name: form.full_name.trim(), phone: form.phone || null, employee_code: form.employee_code || null, role_key: form.role_key, primary_site_id: form.primary_site_id || null };
      if (form.id) await updateUser(form.id, payload); else await createUser({ ...payload, email: form.email.trim(), temporary_password: form.temporary_password });
      toast.success(form.id ? "User updated." : "User invited."); setForm(null); load();
    } catch (error) { toast.error(error.message || "Unable to save user."); } finally { setSaving(false); }
  };

  // Permanent hard delete (2026-09-08) — the backend actually removes the
  // user row and cascades through their work orders, PM records, comments,
  // attachments, signatures, etc. There's no reactivating this afterward.
  // The backend will refuse (409 USER_OWNS_ASSET_RECORDS) if this user is
  // the creator of an asset, since that would cascade-delete the asset and
  // everything logged against it for every user — we just surface that
  // message as-is rather than pretending the delete "succeeded".
  // See OrganizationController::deleteUser() on the backend for the full reasoning.
  const confirmDeleteUser = async () => {
    setBusyUserId(deleting.id);
    try {
      await deleteUser(deleting.id);
      // Update the table immediately after the server confirms the DELETE.
      setUsers((current) => current.filter((member) => member.id !== deleting.id));
      toast.success(`${displayName(deleting)} was permanently deleted.`);
      setDeleting(null);
      if (selectedUser?.id === deleting.id) setSelectedUser(null);
      await load();
    } catch (error) {
      toast.error(error.message || "Unable to delete this user.");
    } finally {
      setBusyUserId(null);
    }
  };

  const handleReactivate = async (member) => {
    setBusyUserId(member.id);
    try {
      await reactivateUser(member.id);
      toast.success(`${displayName(member)} was reactivated.`);
      await load();
    } catch (error) {
      toast.error(error.message || "Unable to reactivate this user.");
    } finally {
      setBusyUserId(null);
    }
  };

  // Admin-triggered "send/resend password reset link" — reuses the same
  // public /auth/forgot-password endpoint the sign-in page's "Forgot
  // password?" link uses, just kicked off from here so an admin can help a
  // technician who's locked out without needing the user's own email access.
  const handleSendReset = async (member) => {
    setBusyUserId(member.id);
    try {
      await requestPasswordReset(member.email);
      toast.success(`Password reset link sent to ${member.email}.`);
    } catch (error) {
      toast.error(error.message || "Unable to send the reset link.");
    } finally {
      setBusyUserId(null);
    }
  };
  const columns = [
    { key: "user", header: "User", render: (member) => <div className="flex min-w-47.5 items-center gap-3"><div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${avatarTone(displayName(member))}`}>{initials(displayName(member))}</div><div className="min-w-0"><p className="truncate text-xs font-bold text-foreground">{displayName(member)}</p><p className="truncate text-[10px] text-slate-400">{member.email}</p></div></div> },
    { key: "role", header: "Role", render: (member) => { const role = roleMeta(member.role_key); return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${role.tone}`}>{role.label}</span>; } },
    { key: "site", header: "Site", render: (member) => <span className="text-[11px] text-slate-500">{siteName(member.primary_site_id)}</span> },
    { key: "team", header: "Team", render: (member) => <span className="text-[11px] text-slate-500">{teamName(member)}</span> },
    { key: "status", header: "Status", render: (member) => <Pill className="px-2 py-0.5 text-[10px]" tone={member.status === "ACTIVE" ? "success" : member.status === "INVITED" ? "warning" : "muted"}>{member.status === "ACTIVE" ? "Active" : member.status === "INVITED" ? "Invited" : "Inactive"}</Pill> },
    { key: "joined", header: "Joined", render: (member) => <span className="whitespace-nowrap text-[11px] text-slate-500">{dateLabel(member.created_at)}</span> },
    {
      key: "actions",
      header: "Actions",
      render: (member) => {
        const isSelf = member.id === user?.tenantUserId;
        const busy = busyUserId === member.id;
        return (
          <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setSelectedUser(member)} className="mr-1 text-[11px] font-semibold text-slate-600 hover:text-primary">View</button>
            {canEdit && (
              <>
                <IconButton title="Edit user" className="h-7 w-7" disabled={busy} onClick={() => setForm({ ...EMPTY_USER, ...member, temporary_password: "" })}>
                  <Pencil className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton title="Send password reset link" className="h-7 w-7" disabled={busy} onClick={() => handleSendReset(member)}>
                  <KeyRound className="h-3.5 w-3.5" />
                </IconButton>
                {member.status === "INACTIVE" ? (
                  <IconButton title="Reactivate user" className="h-7 w-7 hover:text-emerald-600" disabled={busy} onClick={() => handleReactivate(member)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </IconButton>
                ) : (
                  <IconButton title={isSelf ? "You cannot remove your own account" : "Delete user permanently"} className="h-7 w-7 hover:text-destructive" disabled={busy || isSelf} onClick={() => setDeleting(member)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                )}
              </>
            )}
          </div>
        );
      },
    },
  ];

  return <Reveal className="mx-auto max-w-300"><Card className="p-3.5 lg:p-3.5"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-display text-base font-bold">Users</h2><p className="mt-0.5 text-xs text-muted-foreground">{users.length} members in your organization</p></div>{canEdit && <Button className="h-8 px-3 text-xs" onClick={() => setForm({ ...EMPTY_USER, primary_site_id: sites[0]?.id || "" })}><Plus className="h-3.5 w-3.5" />Invite User</Button>}</div><div className="mb-3 flex flex-col gap-2 sm:flex-row"><div className="flex-1 [&>div]:w-full"><SearchInput value={query} onChange={setQuery} placeholder="Search by name or email..." /></div><Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="h-8 py-1.5 text-xs sm:w-32"><option value="all">All Roles</option>{ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</Select><Select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="h-8 py-1.5 text-xs sm:w-32"><option value="all">All Sites</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</Select></div><Table columns={columns} rows={filteredUsers} onRowClick={setSelectedUser} empty={loading ? "Loading users..." : "No users found."} /></Card>
    <Modal open={Boolean(selectedUser)} onClose={() => setSelectedUser(null)} title="User Detail">{selectedUser && <div style={{ padding: "10px 0 0" }}><div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 0 24px" }}><div style={{ width: 46, height: 46, flex: "0 0 46px", display: "grid", placeItems: "center", borderRadius: "50%", background: "#d97706", color: "#fff", fontSize: 16, fontWeight: 700 }}>{initials(displayName(selectedUser))}</div><div><div style={{ color: "#172033", fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{displayName(selectedUser)}</div><div style={{ color: "#73819a", fontSize: 12, marginTop: 2 }}>{roleMeta(selectedUser.role_key).label}</div><span style={{ display: "inline-block", marginTop: 8, borderRadius: 999, background: "#cff5f7", color: "#0e7490", padding: "3px 9px", fontSize: 10, fontWeight: 700 }}>{roleMeta(selectedUser.role_key).label}</span></div></div><div style={{ borderTop: "1px solid #e5eaf1", borderBottom: "1px solid #e5eaf1" }}>{[["Email", selectedUser.email || "—"], ["Phone", selectedUser.phone || "—"], ["Site", siteName(selectedUser.primary_site_id)], ["Team", teamName(selectedUser)], ["Job Title", roleMeta(selectedUser.role_key).label], ["Status", selectedUser.status === "ACTIVE" ? "Active" : selectedUser.status || "—"], ["Joined", dateLabel(selectedUser.created_at)]].map(([label, value]) => <div key={label} style={{ display: "grid", gridTemplateColumns: "105px minmax(0, 1fr)", gap: 16, minHeight: 35, alignItems: "center", borderBottom: "1px solid #e5eaf1", fontSize: 12 }}><span style={{ color: "#8a9ab2" }}>{label}</span><span style={{ color: "#334155", fontWeight: 500 }}>{value}</span></div>)}</div></div>}</Modal>
    <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? "Edit User" : "Invite User"} wide footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save User"}</Button></>}>{form && <div className="grid gap-4 sm:grid-cols-2"><Field label="Full Name" required><Input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></Field>{!form.id && <Field label="Email" required><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>}<Field label="Phone"><Input value={form.phone || ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field><Field label="Employee Code"><Input value={form.employee_code || ""} onChange={(event) => setForm({ ...form, employee_code: event.target.value })} /></Field><Field label="Role"><Select value={form.role_key} onChange={(event) => setForm({ ...form, role_key: event.target.value })}>{ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</Select></Field><Field label="Primary Site"><Select value={form.primary_site_id || ""} onChange={(event) => setForm({ ...form, primary_site_id: event.target.value })}><option value="">Not assigned</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</Select></Field>{!form.id && <div className="sm:col-span-2"><Field label="Temporary Password" required><Input type="password" value={form.temporary_password} onChange={(event) => setForm({ ...form, temporary_password: event.target.value })} placeholder="Minimum 8 characters" /></Field></div>}</div>}</Modal>
    <ConfirmDialog
      open={Boolean(deleting)}
      onClose={() => setDeleting(null)}
      onConfirm={confirmDeleteUser}
      title="Delete user permanently"
      confirmDisabled={Boolean(deleting && busyUserId === deleting.id)}
      message={`Permanently delete ${deleting ? displayName(deleting) : "this user"}? This cannot be undone — their account and everything tied to them (work orders, PM records, comments, attachments, signatures) will be deleted too.`}
    />
  </Reveal>;
}