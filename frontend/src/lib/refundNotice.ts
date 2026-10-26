// Shown when a payment was taken but the plan could not be activated (backend: utils/paymentSaga.js).
export const REFUND_EVENT = "payment-refund";
export const isRefundMessage = (m?: string) => !!m && m.startsWith("We received your payment");
export const announceRefund = (message: string) =>
  typeof window !== "undefined" && window.dispatchEvent(new CustomEvent(REFUND_EVENT, { detail: message }));
