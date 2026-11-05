import { Alert } from 'react-native';

// Shown when a payment was taken but the plan could not be activated (backend: utils/paymentSaga.js).
export const isRefundMessage = (m?: string) =>
  !!m && m.startsWith('We received your payment');
export const announceRefund = (message: string) =>
  Alert.alert('Payment received, refund on the way', message, [
    { text: 'OK, understood' },
  ]);
