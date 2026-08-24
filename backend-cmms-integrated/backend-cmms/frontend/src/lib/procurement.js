import { apiActiveTenant } from "./api";

/* --------------------------------- vendors -------------------------------- */
export const listVendors = (params = {}) =>
  apiActiveTenant("/vendors", { params: { per_page: 100, ...params } });

export const createVendor = (body) =>
  apiActiveTenant("/vendors", { method: "POST", body });

export const updateVendor = (id, body) =>
  apiActiveTenant(`/vendors/${id}`, { method: "PATCH", body });

export const archiveVendor = (id) =>
  apiActiveTenant(`/vendors/${id}`, { method: "DELETE" });

/* ----------------------------- purchase orders ---------------------------- */
export const listPurchaseOrders = (params = {}) =>
  apiActiveTenant("/purchase-orders", { params: { per_page: 100, ...params } });

export const getPurchaseOrder = (id) =>
  apiActiveTenant(`/purchase-orders/${id}`);

export const createPurchaseOrder = (body) =>
  apiActiveTenant("/purchase-orders", { method: "POST", body });

export const updatePurchaseOrder = (id, body) =>
  apiActiveTenant(`/purchase-orders/${id}`, { method: "PATCH", body });

export const receivePurchaseOrder = (id, body) =>
  apiActiveTenant(`/purchase-orders/${id}/receive`, { method: "POST", body });

export const archivePurchaseOrder = (id) =>
  apiActiveTenant(`/purchase-orders/${id}`, { method: "DELETE" });
