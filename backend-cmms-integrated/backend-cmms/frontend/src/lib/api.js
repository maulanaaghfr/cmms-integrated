// Thin fetch wrapper for the AITOMA CMMS Laravel API.
//
// Two kinds of hosts exist:
//  - "central" domain (e.g. localhost) — auth/login, onboarding, platform admin
//  - "tenant" domain (e.g. nusantara.localhost) — everything scoped to one company
// The SPA is a single origin (localhost:3000) and talks to the API cross-origin
// using a Bearer token (CORS is open for this origin, no cookies involved), so
// switching "tenant" is just switching which host we send requests to.

const SCHEME = import.meta.env.VITE_API_SCHEME || "http";
const PORT = import.meta.env.VITE_API_PORT || "8000";
const CENTRAL_HOST = import.meta.env.VITE_API_CENTRAL_HOST || "localhost";

const TOKEN_KEY = "aitoma_token";
const TENANT_DOMAIN_KEY = "aitoma_active_tenant_domain";

export function centralBaseUrl() {
  return `${SCHEME}://${CENTRAL_HOST}:${PORT}`;
}

export function tenantBaseUrl(domain) {
  if (!domain) return centralBaseUrl();
  const host = domain.includes(":") ? domain : `${domain}:${PORT}`;
  return `${SCHEME}://${host}`;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getActiveTenantDomain() {
  return localStorage.getItem(TENANT_DOMAIN_KEY) || null;
}
export function setActiveTenantDomain(domain) {
  if (domain) localStorage.setItem(TENANT_DOMAIN_KEY, domain);
  else localStorage.removeItem(TENANT_DOMAIN_KEY);
}

export class ApiError extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request(baseUrl, path, { method = "GET", body, params, headers = {} } = {}) {
  let url = `${baseUrl}/api/v1${path}`;
  if (params) {
    const entries = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ""
    );
    const qs = new URLSearchParams(entries).toString();
    if (qs) url += `?${qs}`;
  }

  const token = getToken();
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (res.status === 204) return null;

  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : null;

  if (!res.ok) {
    const err = payload?.error || {};
    throw new ApiError(
      err.code || "UNKNOWN_ERROR",
      err.message || `Request failed (${res.status})`,
      res.status,
      err.details
    );
  }

  return payload;
}

/** Call an endpoint on the central domain (auth, onboarding, platform admin). */
export function apiCentral(path, opts) {
  return request(centralBaseUrl(), path, opts);
}

/** Call an endpoint on a specific tenant domain. */
export function apiTenant(domain, path, opts) {
  return request(tenantBaseUrl(domain), path, opts);
}

/** Call an endpoint on the currently active tenant (from localStorage). */
export function apiActiveTenant(path, opts) {
  return apiTenant(getActiveTenantDomain(), path, opts);
}
