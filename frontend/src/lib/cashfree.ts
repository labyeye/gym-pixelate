// Cashfree web checkout (loaded on demand from Cashfree's own CDN).
declare global {
  interface Window {
    Cashfree?: any;
  }
}

const loadSdk = (): Promise<boolean> =>
  new Promise((resolve) => {
    if (window.Cashfree) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

/**
 * Opens the Cashfree payment modal for an order created by the backend ({ paymentSessionId, mode }).
 * Resolves "done" when the customer finished a payment (the caller must still verify it with the backend),
 * "cancelled" when the modal was closed, and throws on a payment error.
 */
export async function payWithCashfree(order: {
  paymentSessionId: string;
  mode?: string;
}): Promise<"done" | "cancelled"> {
  if (!(await loadSdk()))
    throw new Error("Failed to load payment checkout. Check your connection.");
  const cashfree = window.Cashfree({
    mode: order.mode === "sandbox" ? "sandbox" : "production",
  });
  const result = await cashfree.checkout({
    paymentSessionId: order.paymentSessionId,
    redirectTarget: "_modal",
  });
  if (result?.paymentDetails) return "done";
  if (result?.error) {
    const msg = String(result.error.message || "");
    if (/cancel|closed|dismiss/i.test(msg)) return "cancelled";
    throw new Error(msg || "Payment failed");
  }
  return "cancelled";
}
