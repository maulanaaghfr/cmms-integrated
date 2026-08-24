// Real API calls for Assets + the reference data (Sites, Locations, Asset
// Categories) its form needs. All calls go to the ACTIVE tenant (the
// company the logged-in user belongs to) — see lib/api.js apiActiveTenant().
import { apiActiveTenant } from "./api";

/* --------------------------------- assets -------------------------------- */
export function listAssets(params = {}) {
  return apiActiveTenant("/assets", { params: { per_page: 100, ...params } });
}
export function getAsset(id) {
  return apiActiveTenant(`/assets/${id}`);
}
export function createAsset(payload) {
  return apiActiveTenant("/assets", { method: "POST", body: payload });
}
export function updateAsset(id, payload) {
  return apiActiveTenant(`/assets/${id}`, { method: "PATCH", body: payload });
}
export function archiveAsset(id) {
  return apiActiveTenant(`/assets/${id}`, { method: "DELETE" });
}

/* ---------------------------- asset categories ---------------------------- */
export function listAssetCategories(params = {}) {
  return apiActiveTenant("/asset-categories", { params: { per_page: 100, ...params } });
}

/* --------------------------------- sites ---------------------------------- */
export function listSites(params = {}) {
  return apiActiveTenant("/sites", { params: { per_page: 100, ...params } });
}

/* ------------------------------- locations -------------------------------- */
export function listLocations(params = {}) {
  return apiActiveTenant("/locations", { params: { per_page: 100, ...params } });
}