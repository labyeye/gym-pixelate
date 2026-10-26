import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/env';
import { announceRefund, isRefundMessage } from '../utils/refundNotice';

const storage = createAsyncStorage('nestgym');
const TOKEN_KEY = 'nestgym_token'; // old AsyncStorage location, migrated into the keychain on first read

// Access + refresh token live in the OS keychain (Keystore / Keychain), not in plain app storage.
type Creds = { t?: string; r?: string };
let mem: Creds | null = null;
const persist = () =>
  mem?.t
    ? Keychain.setGenericPassword('nestgym', JSON.stringify(mem), {
        service: 'nestgym.auth',
        accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      })
    : Keychain.resetGenericPassword({ service: 'nestgym.auth' });
const load = async (): Promise<Creds> => {
  if (mem) return mem;
  try {
    const c = await Keychain.getGenericPassword({ service: 'nestgym.auth' });
    mem = c ? JSON.parse(c.password) : {};
  } catch {
    mem = {};
  }
  const old = !mem!.t && (await storage.getItem(TOKEN_KEY));
  if (old) {
    mem = { t: old };
    await persist();
  }
  await storage.removeItem(TOKEN_KEY);
  return mem!;
};

export const getToken = async (): Promise<string | null> => (await load()).t || null;
export const setToken = async (t: string) => {
  mem = { ...(await load()), t };
  await persist();
};
const setRefresh = async (r: string) => {
  mem = { ...(await load()), r };
  await persist();
};
export const removeToken = async () => {
  mem = {};
  await persist();
};

// Access tokens last 15 minutes; the stored refresh token swaps for a new one (rotated each time). One at a time.
let refreshing: Promise<boolean> | null = null;
const refreshSession = (): Promise<boolean> => {
  refreshing ??= (async () => {
    try {
      const rt = (await load()).r;
      if (!rt) return false;
      const r = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-platform': Platform.OS },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const j = r.ok ? await r.json() : null;
      if (!j?.data?.token) return false;
      await setToken(j.data.token);
      if (j.data.refreshToken) await setRefresh(j.data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
};

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
  retried = false,
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
        'x-device-platform': Platform.OS,
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
      if (res.status === 401 && token && !retried && !endpoint.startsWith('/auth/login') && (await refreshSession())) {
        return request<T>(endpoint, options, true);
      }
      if (res.status === 401 && token) {
        await removeToken();
        onUnauthorized?.();
      }
      if (isRefundMessage(data.message)) announceRefund(data.message);
      const err: any = new Error(data.message || statusMsg(res.status));
      err.status = res.status;
      throw err;
    }
    if (data?.data?.refreshToken) await setRefresh(data.data.refreshToken);
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
  // ── forgot / reset password ──
  forgotPasswordMethods: (email: string) =>
    request('/auth/forgot-password/methods?email=' + encodeURIComponent(email)),
  forgotPassword: (email: string) =>
    request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  forgotPasswordWhatsapp: (email: string) =>
    request('/auth/forgot-password/whatsapp', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPasswordWithOtp: (email: string, otp: string, password: string) =>
    request('/auth/reset-password/otp', { method: 'POST', body: JSON.stringify({ email, otp, password }) }),
  resetPasswordWithTotp: (email: string, token: string, password: string) =>
    request('/auth/reset-password/otp/totp', { method: 'POST', body: JSON.stringify({ email, token, password }) }),
  resetWithBackupCode: (email: string, code: string, password: string) =>
    request('/auth/reset/backup', { method: 'POST', body: JSON.stringify({ email, code, password }) }),
  // ── two-factor, recovery codes, other sign-in methods ──
  verify2FA: (pendingToken: string, token: string) =>
    request('/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ pendingToken, token }) }),
  emailOtpSend: (email: string) =>
    request('/auth/login/email-otp/send', { method: 'POST', body: JSON.stringify({ email }) }),
  emailOtpVerify: (email: string, otp: string) =>
    request('/auth/login/email-otp/verify', { method: 'POST', body: JSON.stringify({ email, otp }) }),
  setup2FA: () => request('/auth/2fa/setup', { method: 'POST' }),
  confirm2FA: (token: string) =>
    request('/auth/2fa/confirm', { method: 'POST', body: JSON.stringify({ token }) }),
  disable2FA: (password: string, token: string) =>
    request('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password, token }) }),
  backupCodesStatus: () => request('/auth/backup-codes'),
  generateBackupCodes: (password: string) =>
    request('/auth/backup-codes', { method: 'POST', body: JSON.stringify({ password }) }),
  // ── passkeys ──
  passkeyLoginOptions: () => request('/auth/passkey/login-options'),
  passkeyLogin: (payload: any) =>
    request('/auth/passkey/login', { method: 'POST', body: JSON.stringify(payload) }),
  passkeyRegisterOptions: () => request('/auth/passkey/register-options', { method: 'POST' }),
  passkeyRegister: (payload: any) =>
    request('/auth/passkey/register', { method: 'POST', body: JSON.stringify(payload) }),
  passkeyList: () => request('/auth/passkey'),
  passkeyDelete: (id: string) => request('/auth/passkey/' + id, { method: 'DELETE' }),
  resetPasskeyOptions: () => request('/auth/reset/passkey-options'),
  resetWithPasskey: (payload: any) =>
    request('/auth/reset/passkey', { method: 'POST', body: JSON.stringify(payload) }),
  // ── verify email / phone ──
  sendEmailVerifyOtp: (email: string) =>
    request('/auth/contact/email/send-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyEmailOtp: (otp: string) =>
    request('/auth/contact/email/verify-otp', { method: 'POST', body: JSON.stringify({ otp }) }),
  sendPhoneVerifyOtp: () => request('/auth/phone/send-otp', { method: 'POST' }),
  verifyPhoneOtp: (otp: string) =>
    request('/auth/phone/verify-otp', { method: 'POST', body: JSON.stringify({ otp }) }),
  // ── signed-in devices ──
  sessions: () => request('/auth/sessions'),
  removeSession: (id: string) => request('/auth/sessions/' + id, { method: 'DELETE' }),
  removeOtherSessions: () => request('/auth/sessions/others', { method: 'DELETE' }),
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

export const creditsAPI = {
  balance: () => request('/credits/balance'),
  ledger: (page = 1, type = '') =>
    request(`/credits/ledger?page=${page}${type ? `&type=${type}` : ''}`),
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
