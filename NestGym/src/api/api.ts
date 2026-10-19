import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/env';

const storage = createAsyncStorage('nestgym');
const TOKEN_KEY = 'nestgym_token';

export const getToken = async (): Promise<string | null> =>
  storage.getItem(TOKEN_KEY);
export const setToken = (t: string) => storage.setItem(TOKEN_KEY, t);
export const removeToken = () => storage.removeItem(TOKEN_KEY);

// Set by AuthContext so a 401 anywhere signs the user out.
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

const NETWORK_MSG =
  'Cannot reach the server. Please check your internet connection and try again.';
const statusMsg = (s: number) =>
  s === 429
    ? 'Too many attempts. Please wait a minute and try again.'
    : s === 403
    ? 'You do not have permission to do this.'
    : s === 404
    ? 'We could not find what you were looking for.'
    : s >= 500
    ? 'Something went wrong on our side. Please try again in a moment.'
    : 'Something went wrong. Please try again.';

const TIMEOUT_MS = 20_000;

export async function request<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const method = (options.method || 'GET').toUpperCase();
  const url =
    method === 'GET'
      ? `${API_BASE_URL}${endpoint}${
          endpoint.includes('?') ? '&' : '?'
        }_t=${Date.now()}`
      : `${API_BASE_URL}${endpoint}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        // multipart bodies (photo upload) need the boundary RN sets itself
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        'X-Requested-With': 'XMLHttpRequest',
        'Cache-Control': 'no-cache, no-store',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((options.headers as any) || {}),
      },
    });
    clearTimeout(timer);
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {} // gateway HTML page — fall through to statusMsg
    if (!res.ok) {
      if (res.status === 401 && token) {
        await removeToken();
        onUnauthorized?.();
      }
      const err: any = new Error(data.message || statusMsg(res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError' || err.message === 'Network request failed') {
      throw new Error(NETWORK_MSG);
    }
    throw err;
  }
}

/** Uploads a photo to our server; resolves to the stored URL. */
export async function uploadPhoto(uri: string, fileName?: string | null, type?: string | null): Promise<string> {
  const fd = new FormData();
  fd.append('file', { uri, name: fileName || `photo-${Date.now()}.jpg`, type: type || 'image/jpeg' } as any);
  const r = await request<{ url: string }>('/upload', { method: 'POST', body: fd });
  return r.url;
}

export const authAPI = {
  login: (email: string, password: string) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  otpSend: (phone: string) =>
    request('/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  otpVerify: (phone: string, otp: string) =>
    request('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    }),
  register: (b: { name: string; email: string; password: string; phone?: string; companyName?: string }) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(b) }),
  /** onboarding wizard: saves the gym's details; { complete: true } unlocks the app */
  onboarding: (b: Record<string, unknown>) =>
    request('/auth/onboarding', { method: 'POST', body: JSON.stringify(b) }),
  getMe: () => request('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  updateProfile: (updates: { name?: string; phone?: string }) =>
    request('/auth/me', { method: 'PUT', body: JSON.stringify(updates) }),
};

export const settingsAPI = {
  get: () => request('/settings'),
  update: (s: any) =>
    request('/settings', { method: 'PUT', body: JSON.stringify(s) }),
};

export const usersAPI = {
  create: (b: any) =>
    request('/users', { method: 'POST', body: JSON.stringify(b) }),
  update: (id: string, b: any) =>
    request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
};
