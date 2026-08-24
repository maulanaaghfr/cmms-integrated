import { apiActiveTenant } from "./api";

/* -------------------------------- warehouses ------------------------------ */
export const listWarehouses = (params = {}) =>
  apiActiveTenant("/warehouses", { params: { per_page: 100, ...params } });

export const createWarehouse = (body) =>
  apiActiveTenant("/warehouses", { method: "POST", body });

export const updateWarehouse = (id, body) =>
  apiActiveTenant(`/warehouses/${id}`, { method: "PATCH", body });

export const archiveWarehouse = (id) =>
  apiActiveTenant(`/warehouses/${id}`, { method: "DELETE" });

/* ----------------------------- spare-part categories ---------------------- */
export const listSparePartCategories = (params = {}) =>
  apiActiveTenant("/spare-part-categories", { params: { per_page: 100, ...params } });

export const createSparePartCategory = (body) =>
  apiActiveTenant("/spare-part-categories", { method: "POST", body });

/* -------------------------------- spare parts ----------------------------- */
export const listSpareParts = (params = {}) =>
  apiActiveTenant("/spare-parts", { params: { per_page: 100, ...params } });

export const getSparePart = (id) =>
  apiActiveTenant(`/spare-parts/${id}`);

export const createSparePart = (body) =>
  apiActiveTenant("/spare-parts", { method: "POST", body });

export const updateSparePart = (id, body) =>
  apiActiveTenant(`/spare-parts/${id}`, { method: "PATCH", body });

export const archiveSparePart = (id) =>
  apiActiveTenant(`/spare-parts/${id}`, { method: "DELETE" });

export const adjustStock = (id, body) =>
  apiActiveTenant(`/spare-parts/${id}/stock`, { method: "POST", body });

export const listStockMovements = (id, params = {}) =>
  apiActiveTenant(`/spare-parts/${id}/movements`, { params: { per_page: 50, ...params } });
