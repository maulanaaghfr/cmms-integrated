import { apiActiveTenant } from "./api";

export const listRequests = (params) => apiActiveTenant("/requests", { params: { per_page: 100, ...params } });
export const getRequest = (id) => apiActiveTenant(`/requests/${id}`);
export const createRequest = (body) => apiActiveTenant("/requests", { method: "POST", body });
export const updateRequest = (id, body) => apiActiveTenant(`/requests/${id}`, { method: "PATCH", body });
export const approveRequest = (id, body = {}) => apiActiveTenant(`/requests/${id}/approve`, { method: "POST", body });
export const rejectRequest = (id, reason) => apiActiveTenant(`/requests/${id}/reject`, { method: "POST", body: { reason } });
export const cancelRequest = (id, reason) => apiActiveTenant(`/requests/${id}/cancel`, { method: "POST", body: { reason } });
export const addComment = (entityType, entityId, body) => apiActiveTenant("/comments", { method: "POST", body: { entity_type: entityType, entity_id: entityId, body } });
export const uploadAttachment = (entityType, entityId, file, mediaRole = "OTHER") => {
  const body = new FormData();
  body.append("entity_type", entityType);
  body.append("entity_id", entityId);
  body.append("media_role", mediaRole);
  body.append("file", file);
  return apiActiveTenant("/attachments", { method: "POST", body });
};
