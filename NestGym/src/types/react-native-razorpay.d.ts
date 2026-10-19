declare module 'react-native-razorpay' {
  interface RazorpayOptions {
    key: string;
    order_id: string;
    amount: number;
    currency?: string;
    name?: string;
    description?: string;
    theme?: { color?: string };
    [key: string]: any;
  }

  interface RazorpaySuccessResult {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }

  const RazorpayCheckout: {
    open: (options: RazorpayOptions) => Promise<RazorpaySuccessResult>;
  };

  export default RazorpayCheckout;
}
