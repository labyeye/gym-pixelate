/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

// lucide ships ESM-only (.mjs); icons are irrelevant to a smoke test.
jest.mock('react-native-razorpay', () => ({ __esModule: true, default: { open: async () => ({}) } }));
jest.mock('react-native-image-picker', () => ({ launchCamera: jest.fn(), launchImageLibrary: jest.fn() }));
jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: (_t, k) => (k === '__esModule' ? true : () => null) }),
);

test('renders correctly (signed out → login)', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });
});
