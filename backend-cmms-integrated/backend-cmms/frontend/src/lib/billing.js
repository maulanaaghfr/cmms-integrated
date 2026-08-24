import { apiActiveTenant } from "./api";

export const getSubscription = () => apiActiveTenant("/billing/subscription");
export const listInvoices = () => apiActiveTenant("/billing/invoices", { params: { per_page: 100 } });
export const getInvoice = (id) => apiActiveTenant(`/billing/invoices/${id}`);
export const listPaymentChannels = () => apiActiveTenant("/billing/payment-channels");
export const createInvoicePayment = (invoiceId, body) => apiActiveTenant(`/billing/invoices/${invoiceId}/payments`, { method: "POST", body });
export const checkPaymentStatus = (paymentId) => apiActiveTenant(`/billing/payments/${paymentId}/check-status`, { method: "POST" });
