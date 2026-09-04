import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, UsersRound, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Button, Card, ConfirmDialog, Field, IconButton, Input, Modal, PageHeader,
  Pill, Reveal, SearchInput, Select,
} from "../components/kit";
import {
  addTeamMember, archiveTeam, createTeam, getTeam, listSites, listTeams,
  listUsers, removeTeamMember, updateTeam,
} from "../lib/organization";

/* ------------------------------------------------------------------ */
/*  This mirrors OrganizationController@teamData exactly:              */
/*  site_id, code, name, specialty, supervisor_user_id, is_active.    */
/*  "specialty" needed a migration (2026_08_21_010000_add_specialty_   */
/*  to_teams.php) since the table didn't have it before — see backend  */
/*  changes alongside this file.                                       */
/* ------------------------------------------------------------------ */

const teamBlank = { site_id: "", name: "", specialty: "", supervisor_user_id: "" };

export default function Teams() {
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [sites, setSites] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamForm, setTeamForm] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [memberDetailLoading, setMemberDetailLoading] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberType, setNewMemberType] = useState("MEMBER");
  const [addingMember, setAddingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamResponse, siteResponse, userResponse] = await Promise.all([
        listTeams(), listSites(), listUsers({ per_page: 200 }),
      ]);
      setTeams(teamResponse?.data || []);
      setSites(siteResponse?.data || []);
      setUsers(userResponse?.data || []);
    } catch (error) {
      toast.error(error.message || "Failed to load teams.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const siteName = (id) => sites.find((s) => s.id === id)?.name || "—";
  const userName = (id) => users.find((u) => u.id === id)?.full_name || "—";
  const supervisorsForSite = (siteId) => users.filter((u) => u.role_key === "SUPERVISOR" && u.status === "ACTIVE" && (!siteId || u.primary_site_id === siteId));
  const memberCount = (team) => (team.members ? team.members.length : team.members_count ?? team.member_count ?? null);

  const filteredTeams = useMemo(() => teams
    .filter((t) => siteFilter === "all" || t.site_id === siteFilter)
    .filter((t) => `${t.code || ""} ${t.name} ${t.specialty || ""}`.toLowerCase().includes(query.toLowerCase())),
  [teams, query, siteFilter]);

  /* --------------------------- member management ------------------------- */

  const openDetail = async (team) => {
    setSelectedTeam(team);
    setNewMemberUserId("");
    setNewMemberType("MEMBER");
    setMemberDetailLoading(true);
    try {
      const response = await getTeam(team.id);
      setSelectedTeam(response?.data || team);
    } catch (error) {
      toast.error(error.message || "Failed to load team members.");
    } finally {
      setMemberDetailLoading(false);
    }
  };

  const refreshSelectedTeam = async (teamId) => {
    try {
      const response = await getTeam(teamId);
      setSelectedTeam(response?.data || null);
    } catch (error) {
      toast.error(error.message || "Failed to refresh team members.");
    }
    load();
  };

  // Only active users based at the same site as the team, and not already
  // an active member, are valid picks — mirrors the backend's
  // TEAM_MEMBER_SITE_MISMATCH check in OrganizationController@addTeamMember.
  const availableMemberOptions = useMemo(() => {
    if (!selectedTeam) return [];
    const existingIds = new Set((selectedTeam.members || []).map((m) => m.tenant_user_id));
    return users.filter((u) => u.status === "ACTIVE" && u.primary_site_id === selectedTeam.site_id && !existingIds.has(u.id));
  }, [users, selectedTeam]);

  const addMember = async () => {
    if (!newMemberUserId) {
      toast.error("Select a technician to add.");
      return;
    }
    setAddingMember(true);
    try {
      await addTeamMember(selectedTeam.id, { tenant_user_id: newMemberUserId, member_type: newMemberType });
      toast.success("Member added to the team.");
      setNewMemberUserId("");
      setNewMemberType("MEMBER");
      await refreshSelectedTeam(selectedTeam.id);
    } catch (error) {
      toast.error(error.message || "Failed to add member.");
    } finally {
      setAddingMember(false);
    }
  };

  const removeMember = async (tenantUserId) => {
    setRemovingMemberId(tenantUserId);
    try {
      await removeTeamMember(selectedTeam.id, tenantUserId);
      toast.success("Member removed from the team.");
      await refreshSelectedTeam(selectedTeam.id);
    } catch (error) {
      toast.error(error.message || "Failed to remove member.");
    } finally {
      setRemovingMemberId(null);
    }
  };

  /* --------------------------- create / edit ------------------------- */

  const openCreate = () => setTeamForm({ ...teamBlank, site_id: sites[0]?.id || "" });

  const openEdit = (team) => setTeamForm({
    ...teamBlank, ...team, supervisor_user_id: team.supervisor_user_id || "",
  });

  const saveTeam = async () => {
    if (!teamForm.site_id || !teamForm.name.trim()) {
      toast.error("Site and team name are required.");
      return;
    }
    setSaving(true);
    // teams.code is required + unique per site by the backend, but isn't part
    // of this design — generate a stable one from the name automatically.
    const code = teamForm.code || `${teamForm.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36).toUpperCase()}`;
    const payload = {
      site_id: teamForm.site_id, code, name: teamForm.name.trim(),
      specialty: teamForm.specialty || null,
      supervisor_user_id: teamForm.supervisor_user_id || null,
    };
    try {
      if (teamForm.id) await updateTeam(teamForm.id, payload);
      else await createTeam(payload);
      toast.success(teamForm.id ? "Team updated." : "Team created.");
      setTeamForm(null);
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to save the team.");
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try {
      await archiveTeam(deleting.id);
      toast.success("Team archived.");
      setDeleting(null);
      if (selectedTeam?.id === deleting.id) setSelectedTeam(null);
      await load();
    } catch (error) { toast.error(error.message || "Failed to archive the team."); }
  };

  return (
    <Reveal className="mx-auto max-w-page">
      <PageHeader
        title="Teams"
        subtitle="Maintenance teams across all sites"
        action={<Button className="h-9 px-3 text-xs" onClick={openCreate} disabled={!loading && sites.length === 0}><Plus className="h-3.5 w-3.5" /> New Team</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 [&>div]:w-full"><SearchInput value={query} onChange={setQuery} placeholder="Search teams..." /></div>
        <Select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="h-10 sm:w-44">
          <option value="all">All Sites</option>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredTeams.map((team) => {
          const count = memberCount(team);
          return (
            <div
              key={team.id}
              onClick={() => openDetail(team)}
              className="cursor-pointer rounded-xl border border-border/80 bg-background p-4 transition hover:border-primary/50 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><UsersRound className="h-5 w-5" /></span>
                  <div>
                    <h3 className="font-display text-sm font-bold">{team.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{siteName(team.site_id)}</p>
                  </div>
                </div>
                <Pill tone={team.is_active ? "success" : "muted"} className="text-[10px]">{team.is_active ? "Active" : "Inactive"}</Pill>
              </div>

              {team.specialty && (
                <div className="mt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Specialty</p>
                  <p className="mt-0.5 text-xs text-foreground">{team.specialty}</p>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
                <span className="text-muted-foreground">Supervisor: <span className="font-medium text-foreground">{team.supervisor_user_id ? userName(team.supervisor_user_id) : "—"}</span></span>
                {count != null && <span className="font-medium text-foreground">{count} member{count === 1 ? "" : "s"}</span>}
              </div>

              <div className="mt-3 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <IconButton title="Edit team" className="h-7 w-7" onClick={() => openEdit(team)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                <IconButton title="Archive team" className="h-7 w-7 hover:text-destructive" onClick={() => setDeleting(team)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
              </div>
            </div>
          );
        })}
        {!loading && filteredTeams.length === 0 && <p className="col-span-full py-10 text-center text-sm text-muted-foreground">No teams found.</p>}
      </div>

      {/* ------------------------------ Team Detail Modal ------------------------------ */}
      <Modal
        open={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
        title="Team Detail"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelectedTeam(null)}>Close</Button>
            <Button onClick={() => { const t = selectedTeam; setSelectedTeam(null); openEdit(t); }}>Edit</Button>
          </>
        }
      >
        {selectedTeam && (
          <div className="space-y-5">
            <h4 className="font-display text-base font-extrabold">{selectedTeam.name}</h4>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><dt className="text-muted-foreground">Site</dt><dd className="font-medium text-foreground">{siteName(selectedTeam.site_id)}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-muted-foreground">Supervisor</dt><dd className="font-medium text-foreground">{selectedTeam.supervisor_user_id ? userName(selectedTeam.supervisor_user_id) : "—"}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-muted-foreground">Specialty</dt><dd className="font-medium text-foreground">{selectedTeam.specialty || "—"}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-muted-foreground">Status</dt><dd className="font-medium text-foreground">{selectedTeam.is_active ? "Active" : "Inactive"}</dd></div>
            </dl>

            <div className="border-t pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h5 className="text-sm font-bold text-foreground">Members</h5>
                <span className="text-xs text-muted-foreground">{(selectedTeam.members || []).length} technician{(selectedTeam.members || []).length === 1 ? "" : "s"}</span>
              </div>

              {memberDetailLoading ? (
                <p className="py-3 text-xs text-muted-foreground">Loading members...</p>
              ) : (
                <div className="space-y-1.5">
                  {(selectedTeam.members || []).length === 0 && (
                    <p className="rounded-lg border border-dashed py-3 text-center text-xs text-muted-foreground">No members yet. Add one below.</p>
                  )}
                  {(selectedTeam.members || []).map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{member.full_name}</p>
                        <p className="text-[11px] text-muted-foreground">{member.role_key}{member.member_type === "LEAD" ? " · Lead" : ""}</p>
                      </div>
                      <IconButton
                        title="Remove from team"
                        className="h-7 w-7 shrink-0 hover:text-destructive"
                        disabled={removingMemberId === member.tenant_user_id}
                        onClick={() => removeMember(member.tenant_user_id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Select className="flex-1" value={newMemberUserId} onChange={(e) => setNewMemberUserId(e.target.value)}>
                  <option value="">
                    {availableMemberOptions.length === 0 ? "No eligible users at this site" : "Select a technician..."}
                  </option>
                  {availableMemberOptions.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name} ({u.role_key})</option>
                  ))}
                </Select>
                <Select className="sm:w-32" value={newMemberType} onChange={(e) => setNewMemberType(e.target.value)}>
                  <option value="MEMBER">Member</option>
                  <option value="LEAD">Lead</option>
                </Select>
                <Button className="sm:w-auto" onClick={addMember} disabled={addingMember || !newMemberUserId}>
                  <UserPlus className="h-4 w-4" /> {addingMember ? "Adding..." : "Add"}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Only active users whose primary site matches this team's site ({siteName(selectedTeam.site_id)}) can be added.</p>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------ Create / Edit Modal ------------------------------ */}
      <Modal
        open={!!teamForm}
        onClose={() => setTeamForm(null)}
        title={teamForm?.id ? "Edit Team" : "New Team"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTeamForm(null)}>Cancel</Button>
            <Button onClick={saveTeam} disabled={saving}>{saving ? "Saving..." : "Save Team"}</Button>
          </>
        }
      >
        {teamForm && (
          <div className="flex flex-col gap-4">
            <Field label="Team Name" required>
              <Input placeholder="e.g. Tim Machining A" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} />
            </Field>
            <Field label="Site" required>
              <Select value={teamForm.site_id} onChange={(e) => setTeamForm({ ...teamForm, site_id: e.target.value, supervisor_user_id: "" })}>
                <option value="">Select site</option>
                {sites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Specialty">
              <Input placeholder="e.g. Machining & Rotating Equipment" value={teamForm.specialty} onChange={(e) => setTeamForm({ ...teamForm, specialty: e.target.value })} />
            </Field>
            <Field label="Supervisor">
              <Select value={teamForm.supervisor_user_id} onChange={(e) => setTeamForm({ ...teamForm, supervisor_user_id: e.target.value })}>
                <option value="">Unassigned</option>
                {supervisorsForSite(teamForm.site_id).map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
              </Select>
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Archive team"
        message={`Archive team "${deleting?.name}"? Its members will stay in the organization but the team itself will be marked inactive.`}
      />
    </Reveal>
  );
}