import { apiActiveTenant } from "./api";

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

export const listTeams = (params) => apiActiveTenant("/teams", { params: { per_page: 100, ...params } });
export const createTeam = (body) => apiActiveTenant("/teams", { method: "POST", body });
export const updateTeam = (id, body) => apiActiveTenant(`/teams/${id}`, { method: "PATCH", body });
export const archiveTeam = (id) => apiActiveTenant(`/teams/${id}`, { method: "DELETE" });
