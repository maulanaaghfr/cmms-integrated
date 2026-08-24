// API client for Preventive Maintenance (PM) — schedules, templates, occurrences.
// Mirrors the pattern used in lib/assets.js / lib/workorders.js: thin wrappers
// around apiActiveTenant() that call the tenant-scoped Laravel endpoints
// registered in routes/tenant.php under the `pm/*` prefix.

import { apiActiveTenant } from "./api";

/* ------------------------------- schedules -------------------------------- */

export function listPmSchedules(params = {}) {
  return apiActiveTenant("/pm/schedules", { params: { per_page: 100, ...params } });
}

export function getPmSchedule(id) {
  return apiActiveTenant(`/pm/schedules/${id}`);
}

export function createPmSchedule(payload) {
  return apiActiveTenant("/pm/schedules", { method: "POST", body: payload });
}

export function updatePmSchedule(id, payload) {
  return apiActiveTenant(`/pm/schedules/${id}`, { method: "PATCH", body: payload });
}

export function archivePmSchedule(id) {
  return apiActiveTenant(`/pm/schedules/${id}`, { method: "DELETE" });
}

export function pausePmSchedule(id, payload) {
  return apiActiveTenant(`/pm/schedules/${id}/pause`, { method: "POST", body: payload });
}

export function resumePmSchedule(id) {
  return apiActiveTenant(`/pm/schedules/${id}/resume`, { method: "POST" });
}

/* ------------------------------- templates --------------------------------- */

export function listPmTemplates(params = {}) {
  return apiActiveTenant("/pm/templates", { params: { per_page: 100, ...params } });
}

export function getPmTemplate(id) {
  return apiActiveTenant(`/pm/templates/${id}`);
}

export function createPmTemplate(payload) {
  return apiActiveTenant("/pm/templates", { method: "POST", body: payload });
}

export function updatePmTemplate(id, payload) {
  return apiActiveTenant(`/pm/templates/${id}`, { method: "PATCH", body: payload });
}

export function archivePmTemplate(id) {
  return apiActiveTenant(`/pm/templates/${id}`, { method: "DELETE" });
}

/* ------------------------------- occurrences -------------------------------- */

export function listPmOccurrences(params = {}) {
  return apiActiveTenant("/pm/occurrences", { params: { per_page: 100, ...params } });
}
