import { apiActiveTenant, apiTenant } from "./api";

export const listSites = (params) => apiActiveTenant("/sites", { params: { per_page: 100, ...params } });
export const createSite = (body) => apiActiveTenant("/sites", { method: "POST", body });
export const updateSite = (id, body) => apiActiveTenant(`/sites/${id}`, { method: "PATCH", body });
export const archiveSite = (id) => apiActiveTenant(`/sites/${id}`, { method: "DELETE" });

export const listLocations = (params) => apiActiveTenant("/locations", { params: { per_page: 100, ...params } });
export const getLocation = (id) => apiActiveTenant(`/locations/${id}`);
export const createLocation = (body) => apiActiveTenant("/locations", { method: "POST", body });
export const updateLocation = (id, body) => apiActiveTenant(`/locations/${id}`, { method: "PATCH", body });
export const archiveLocation = (id) => apiActiveTenant(`/locations/${id}`, { method: "DELETE" });

export const listUsers = (params) => apiActiveTenant("/users", { params: { per_page: 100, ...params } });
export const createUser = (body) => apiActiveTenant("/users", { method: "POST", body });
export const updateUser = (id, body) => apiActiveTenant(`/users/${id}`, { method: "PATCH", body });

// Resolve the caller's OWN tenant_user record.
//
// FIX (2026-09-04): this must never be implemented as "search listUsers()
// for a row matching my email/id". For role TECHNICIAN, listUsers() is
// scoped by team membership (not primary_site_id) — a technician who has
// been assigned work orders but hasn't been added to any team yet gets an
// EMPTY result back and effectively can't find themselves, which used to
// leave `user.tenantUserId` as null after login and silently broke every
// "is this assigned to me" check in the technician UI.
//
// getMyTenantUser() hits GET /users/me instead, which always returns the
// signed-in user's own row regardless of team/site scoping.
export const getMyTenantUser = () => apiActiveTenant("/users/me");
// Same thing, but callable against an explicit tenant domain — needed
// right after login, before the "active tenant" is set in localStorage.
export const getMyTenantUserOnDomain = (domain) => apiTenant(domain, "/users/me");

export const listTeams = (params) => apiActiveTenant("/teams", { params: { per_page: 100, ...params } });
export const getTeam = (id) => apiActiveTenant(`/teams/${id}`);
export const createTeam = (body) => apiActiveTenant("/teams", { method: "POST", body });
export const updateTeam = (id, body) => apiActiveTenant(`/teams/${id}`, { method: "PATCH", body });
export const archiveTeam = (id) => apiActiveTenant(`/teams/${id}`, { method: "DELETE" });

// Team membership. Backend requires the target user's primary_site_id to
// match the team's site_id (TEAM_MEMBER_SITE_MISMATCH otherwise) — filter
// the picker to same-site, active users before calling this.
export const addTeamMember = (teamId, body) => apiActiveTenant(`/teams/${teamId}/members`, { method: "POST", body });
export const removeTeamMember = (teamId, tenantUserId) => apiActiveTenant(`/teams/${teamId}/members/${tenantUserId}`, { method: "DELETE" });