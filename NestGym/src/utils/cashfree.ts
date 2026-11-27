import { CFPaymentGatewayService } from 'react-native-cashfree-pg-sdk';
import {
  CFDropCheckoutPayment,
  CFEnvironment,
  CFSession,
} from 'cashfree-pg-api-contract';

// Opens Cashfree's native checkout for an order made by /billing/cashfree/create-order.
// Resolves 'done' when Cashfree says the flow finished (the server still verifies), 'cancelled' if closed.
export function payWithCashfree(o: {
  orderId: string;
  paymentSessionId: string;
  mode?: string;
}): Promise<'done' | 'cancelled'> {
  return new Promise((resolve, reject) => {
    CFPaymentGatewayService.setCallback({
      onVerify: () => resolve('done'),
      onError: (e: any) =>
        /cancel|dismiss/i.test(String(e?.getMessage?.() || e?.message || ''))
          ? resolve('cancelled')
          : reject(new Error(e?.getMessage?.() || e?.message || 'Payment failed')),
    });
    try {
      const env =
        o.mode === 'sandbox' ? CFEnvironment.SANDBOX : CFEnvironment.PRODUCTION;
      const session = new CFSession(o.paymentSessionId, o.orderId, env);
      CFPaymentGatewayService.doPayment(new CFDropCheckoutPayment(session, null, null));
    } catch (e) {
      reject(e);
    }
  });
}
