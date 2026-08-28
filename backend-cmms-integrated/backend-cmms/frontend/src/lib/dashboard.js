import { apiActiveTenant, apiCentral } from "./api";

export const getDashboardSummary = () => apiActiveTenant("/dashboard/summary");
export const getInsights = (windowDays = 90) => apiActiveTenant("/insights", { params: { window_days: windowDays } });
export const listNotifications = () => apiActiveTenant("/notifications", { params: { per_page: 100 } });
export const markNotificationRead = (id) => apiActiveTenant(`/notifications/${id}/read`, { method: "POST" });
export const markAllNotificationsRead = () => apiActiveTenant("/notifications/read-all", { method: "POST" });

// Platform summary deliberately uses only the data currently exposed by the
// central API. Revenue and platform-user aggregates do not exist yet.
export const listPlatformTenants = () => apiCentral("/platform/tenants", { params: { per_page: 20 } });
export const listPlatformUsers = () => apiCentral("/platform/users", { params: { per_page: 100 } });
export const getPlatformRevenue = () => apiCentral("/platform/revenue");

export const getReliabilityAnalytics = (windowDays = 180) => apiActiveTenant("/analytics/reliability", { params: { window_days: windowDays } });
