import { apiActiveTenant } from "./api";

export const listWorkOrders = (params) => apiActiveTenant("/work-orders", { params: { per_page: 100, ...params } });
export const getWorkOrder = (id) => apiActiveTenant(`/work-orders/${id}`);
export const createWorkOrder = (body) => apiActiveTenant("/work-orders", { method: "POST", body });
export const updateWorkOrder = (id, body) => apiActiveTenant(`/work-orders/${id}`, { method: "PATCH", body });
export const workOrderAction = (id, action, body = {}) => apiActiveTenant(`/work-orders/${id}/${action}`, { method: "POST", body });
export const startTimer = (id, notes) => apiActiveTenant(`/work-orders/${id}/timer/start`, { method: "POST", body: { notes } });
export const stopTimer = (id, notes) => apiActiveTenant(`/work-orders/${id}/timer/stop`, { method: "POST", body: { notes } });
export const recordWorkOrderPart = (id, body) => apiActiveTenant(`/work-orders/${id}/parts`, { method: "POST", body });
export const updateWorkOrderChecklist = (workOrderId, itemId, body) => apiActiveTenant(`/work-orders/${workOrderId}/checklist/${itemId}`, { method: "PATCH", body });
export const signWorkOrder = (workOrderId, body) => apiActiveTenant(`/work-orders/${workOrderId}/signature`, { method: "POST", body });
export const recommendTechnicians = (workOrderId) => apiActiveTenant(`/work-orders/${workOrderId}/recommendations`);
