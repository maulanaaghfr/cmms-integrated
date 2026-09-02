// Real authentication against the Laravel backend (Sanctum bearer tokens),
// mapped into the role/user shape the existing frontend pages already
// consume (`user.role`, `user.name`, `user.company`, ...) so pages don't
// all need to be rewritten at once.
//
// IMPORTANT — role model mismatch:
// The backend only knows these roles today:
//   - platform_role (user-level):        null | "SUPER_ADMIN"
//   - tenant role_key (per membership):  COMPANY_ADMIN | MANAGER | SUPERVISOR
//                                         | TECHNICIAN | OPERATOR | VIEWER
// The original demo UI has more roles than that (limited_admin,
// limited_technician, requester, provider, ...). Those don't exist server
// side yet, so they're mapped to the closest real role below. If you need
// those as first-class roles, they have to be added to the backend's
// `tenant_memberships_role_check` constraint and permission logic first —
// this file is the only place the mapping needs to change afterwards.
import { apiCentral, apiTenant, getToken, setToken, getActiveTenantDomain, setActiveTenantDomain } from "./api";

export const BACKEND_TO_FRONTEND_ROLE = {
  COMPANY_ADMIN: "company_admin",
  MANAGER: "manager",
  SUPERVISOR: "supervisor",
  TECHNICIAN: "technician",
  OPERATOR: "operator",
  VIEWER: "view_only",
};

function mapMembership(m) {
  return {
    membershipId: m.id,
    tenantId: m.tenant_id,
    tenantName: m.tenant_name,
    tenantStatus: m.tenant_status,
    domain: m.domain,
    roleKey: m.role_key,
    status: m.status,
    frontendRole: BACKEND_TO_FRONTEND_ROLE[m.role_key] || "view_only",
  };
}

/**
 * Resolve the tenant-local user ID for the signed-in central user.
 *
 * `auth/me` returns the central `users.id`, while work-order assignments use
 * `tenant_users.id`.  Those IDs intentionally differ, so UI permission checks
 * must never compare an assignment to `apiUser.id`.
 */
async function resolveTenantUserId(apiUser, membership) {
  if (!membership?.domain) return null;

  try {
    const response = await apiTenant(membership.domain, "/users", {
      params: { per_page: 100 },
    });
    const tenantUser = (response?.data || []).find(
      (candidate) =>
        candidate.central_user_id === apiUser.id ||
        candidate.email?.toLowerCase() === apiUser.email?.toLowerCase()
    );
    return tenantUser?.id || null;
  } catch {
    // A user can sign in even when the users feature is unavailable. Pages
    // should simply hide actions that require a tenant-local identity.
    return null;
  }
}

/** Build the `user` object shape the existing pages expect from useApp(). */
async function buildSessionUser(apiUser, membership) {
  const isSuperAdmin = apiUser.platform_role === "SUPER_ADMIN";
  const tenantUserId = isSuperAdmin ? null : await resolveTenantUserId(apiUser, membership);
  return {
    id: apiUser.id,
    tenantUserId,
    name: apiUser.full_name,
    email: apiUser.email,
    role: isSuperAdmin ? "super_admin" : membership?.frontendRole || "view_only",
    company: membership?.tenantName || "",
    status: apiUser.status,
    mustChangePassword: !!apiUser.must_change_password,
    // Raw backend data, kept around for pages that get wired up next —
    // nothing in the original demo UI reads this, so it's safe to ignore.
    _backend: {
      apiUser,
      membership,
      tenantUserId,
    },
  };
}

/**
 * Sign in against the real API.
 * Returns { ok, user, memberships, needsTenantSelection } or { ok: false, error }.
 */
export async function apiLogin(email, password) {
  try {
    const res = await apiCentral("/auth/login", {
      method: "POST",
      body: { email, password, device_name: "aitoma-web" },
    });
    const { token, user } = res.data;
    setToken(token);

    const me = await apiCentral("/auth/me");
    const memberships = (me.data.memberships || []).map(mapMembership);
    const activeMemberships = memberships.filter((m) => m.status === "ACTIVE" && m.domain);

    const isSuperAdmin = user.platform_role === "SUPER_ADMIN";
    if (isSuperAdmin) {
      return { ok: true, user: await buildSessionUser(user, null), memberships };
    }

    if (activeMemberships.length === 0) {
      setToken(null);
      return { ok: false, error: "Akun ini belum terhubung ke perusahaan manapun." };
    }
    if (activeMemberships.length === 1) {
      setActiveTenantDomain(activeMemberships[0].domain);
      return { ok: true, user: await buildSessionUser(user, activeMemberships[0]), memberships };
    }
    // Multiple active tenants — caller (Login page) should prompt the user
    // to pick one, then call selectTenant().
    return { ok: true, needsTenantSelection: true, user, memberships };
  } catch (err) {
    setToken(null);
    return { ok: false, error: err.message || "Gagal masuk. Coba lagi." };
  }
}

/** Finish login after the user picked a tenant from `needsTenantSelection`. */
export async function selectTenant(apiUser, membership) {
  setActiveTenantDomain(membership.domain);
  return buildSessionUser(apiUser, membership);
}

/** Re-hydrate a session from a stored token (page reload). */
export async function apiFetchSession() {
  const token = getToken();
  if (!token) return null;
  try {
    const me = await apiCentral("/auth/me");
    const user = me.data.user;
    const memberships = (me.data.memberships || []).map(mapMembership);
    const isSuperAdmin = user.platform_role === "SUPER_ADMIN";
    if (isSuperAdmin) return { user: await buildSessionUser(user, null), memberships };

    const activeDomain = getActiveTenantDomain();
    const membership =
      memberships.find((m) => m.domain === activeDomain && m.status === "ACTIVE") ||
      memberships.find((m) => m.status === "ACTIVE");
    if (!membership) return null;
    setActiveTenantDomain(membership.domain);
    return { user: await buildSessionUser(user, membership), memberships };
  } catch {
    setToken(null);
    setActiveTenantDomain(null);
    return null;
  }
}

export async function apiLogout() {
  try {
    await apiCentral("/auth/logout", { method: "POST" });
  } catch {
    // ignore network/API errors on logout — clear local session regardless
  } finally {
    setToken(null);
    setActiveTenantDomain(null);
  }
}

export function requestPasswordReset(email) {
  return apiCentral("/auth/forgot-password", { method: "POST", body: { email } });
}

export function resetPasswordWithToken({ email, token, password, passwordConfirmation }) {
  return apiCentral("/auth/reset-password", {
    method: "POST",
    body: { email, token, password, password_confirmation: passwordConfirmation },
  });
}

export { apiTenant };
