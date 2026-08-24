import { apiActiveTenant } from "./api";

export const listManufacturers = (params = {}) =>
  apiActiveTenant("/manufacturers", { params: { per_page: 100, ...params } });

export const getManufacturer = (id) =>
  apiActiveTenant(`/manufacturers/${id}`);

export const createManufacturer = (body) =>
  apiActiveTenant("/manufacturers", { method: "POST", body });

export const updateManufacturer = (id, body) =>
  apiActiveTenant(`/manufacturers/${id}`, { method: "PATCH", body });

export const archiveManufacturer = (id) =>
  apiActiveTenant(`/manufacturers/${id}`, { method: "DELETE" });
