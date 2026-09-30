// Thin fetch wrapper for the AITOMA CMMS Laravel API.
//
// Two kinds of hosts exist:
//  - "central" domain (e.g. localhost) — auth/login, onboarding, platform admin
//  - "tenant" domain (e.g. nusantara.localhost) — everything scoped to one company
// The SPA is a single origin (localhost:3000) and talks to the API cross-origin
// using a Bearer token (CORS is open for this origin, no cookies involved), so
// switching "tenant" is just switching which host we send requests to.

const IS_PRODUCTION = import.meta.env.PROD;
const SCHEME = import.meta.env.VITE_API_SCHEME || (IS_PRODUCTION ? "https" : "http");
const PORT = import.meta.env.VITE_API_PORT || (IS_PRODUCTION ? "" : "8000");
const CENTRAL_HOST =
  import.meta.env.VITE_API_CENTRAL_HOST ||
  (IS_PRODUCTION ? "api.cmms2.webclient.my.id" : "localhost");

const TOKEN_KEY = "aitoma_token";
const TENANT_DOMAIN_KEY = "aitoma_active_tenant_domain";
const COOKIE_DOMAIN = import.meta.env.VITE_COOKIE_DOMAIN || "";

function addPort(host) {
  if (!PORT || PORT === "80" || PORT === "443" || host.includes(":")) return host;
  return `${host}:${PORT}`;
}

export function centralBaseUrl() {
  return `${SCHEME}://${addPort(CENTRAL_HOST)}`;
}

export function tenantBaseUrl(domain) {
  if (!domain) return centralBaseUrl();
  return `${SCHEME}://${addPort(domain)}`;
}

function setCookie(name, value) {
  const domainPart = COOKIE_DOMAIN ? `; Domain=${COOKIE_DOMAIN}` : "";
  const securePart = window.location.protocol === "https:" ? "; Secure" : "";
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${expires}; Path=/${domainPart}; SameSite=Lax${securePart}`;
}

function getCookie(name) {
  const prefix = `${name}=`;
  const item = document.cookie.split("; ").find((row) => row.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : null;
}

function removeCookie(name) {
  const domainPart = COOKIE_DOMAIN ? `; Domain=${COOKIE_DOMAIN}` : "";
  document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/${domainPart}`;
}

export function getToken() {
  return getCookie(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) {
    setCookie(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    removeCookie(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getActiveTenantDomain() {
  return getCookie(TENANT_DOMAIN_KEY) || localStorage.getItem(TENANT_DOMAIN_KEY) || null;
}

export function setActiveTenantDomain(domain) {
  if (domain) {
    setCookie(TENANT_DOMAIN_KEY, domain);
    localStorage.setItem(TENANT_DOMAIN_KEY, domain);
  } else {
    removeCookie(TENANT_DOMAIN_KEY);
    localStorage.removeItem(TENANT_DOMAIN_KEY);
  }
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

export async function apiActiveTenantBlob(path) {
  const token = getToken();
  const response = await fetch(
    `${tenantBaseUrl(getActiveTenantDomain())}/api/v1${path}`,
    {
      headers: {
        Accept: "*/*",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );

  if (!response.ok) {
    throw new ApiError(
      "ATTACHMENT_DOWNLOAD_FAILED",
      `Gagal memuat foto (${response.status}).`,
      response.status,
    );
  }

  return response.blob();
}

