import { announceRefund, isRefundMessage } from "@/lib/refundNotice";
const API_BASE = import.meta.env.VITE_API_URL;

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// Token is kept in sessionStorage (cleared when the browser tab closes).
// This prevents XSS scripts from reading the token via localStorage,
// which persists indefinitely across sessions.
let _memToken: string | null = sessionStorage.getItem("_aft") ?? null;

function getToken(): string | null {
  return _memToken;
}

function setToken(token: string): void {
  _memToken = token;
  sessionStorage.setItem("_aft", token);
}

function removeToken(): void {
  _memToken = null;
  sessionStorage.removeItem("_aft");
  localStorage.removeItem("token");
}

// One CSRF token per session — generated once, sent on every mutating request.
function getCsrfToken(): string {
  let t = sessionStorage.getItem("_cst");
  if (!t) {
    t = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    sessionStorage.setItem("_cst", t);
  }
  return t;
}

// Access tokens last 15 minutes; the httpOnly refresh cookie swaps for a new one. One refresh at a time.
let refreshing: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    body: "{}",
  })
    .then(async (r) => {
      const j = r.ok ? await r.json() : null;
      if (j?.data?.token) setToken(j.data.token);
      return !!j?.data?.token;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Turnstile token (set by components/Turnstile), sent once on the endpoints the backend protects.
let captchaToken: string | null = null;
export const setCaptchaToken = (t: string | null) => {
  captchaToken = t;
};
const CAPTCHA_PATHS = /^\/auth\/(register|otp\/send|forgot-password(\/whatsapp)?|login\/email-otp\/send)$/;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = getToken();
  const method = (options.method ?? "GET").toUpperCase();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    "X-Requested-With": "XMLHttpRequest",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (captchaToken && CAPTCHA_PATHS.test(endpoint)) {
    headers["X-Captcha-Token"] = captchaToken;
    captchaToken = null; // single use
    (window as any).turnstile?.reset();
  }

  if (MUTATING_METHODS.has(method)) {
    headers["X-CSRF-Token"] = getCsrfToken();
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include",
    headers,
  });

  let data: any = {};
  try {
    const text = await response.text();
    if (text) data = JSON.parse(text);
  } catch {}

  if (!response.ok) {
    if (response.status === 401 && token && !retried && !endpoint.startsWith("/auth/login") && !isFormData && (await refreshSession())) {
      return request<T>(endpoint, options, true);
    }
    if (response.status === 403 && data.code === "2FA_REQUIRED" && !window.location.pathname.startsWith("/settings")) {
      window.location.href = "/settings?tab=security";
    }
    if (response.status === 401) {
      removeToken();
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    if (isRefundMessage(data.message)) announceRefund(data.message);
    throw new ApiError(data.message || "Something went wrong", response.status);
  }

  return data;
}

export const authAPI = {
  onboarding: (body: Record<string, unknown>) =>
    request<{ success: boolean; data: any }>("/auth/onboarding", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  otpSend: (phone: string) =>
    request<{ success: boolean; message: string }>("/auth/otp/send", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),

  otpVerify: (phone: string, otp: string) =>
    request<{ success: boolean; data: any }>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, otp }),
    }),

  // ── forgot / reset password ──
  forgotPasswordMethods: (email: string) =>
    request<{ success: boolean; data: { methods: string[] } }>(
      `/auth/forgot-password/methods?email=${encodeURIComponent(email)}`,
    ),
  forgotPassword: (email: string) =>
    request<any>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<any>(`/auth/reset-password/${encodeURIComponent(token)}`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  forgotPasswordWhatsapp: (email: string) =>
    request<any>("/auth/forgot-password/whatsapp", { method: "POST", body: JSON.stringify({ email }) }),
  resetPasswordWithOtp: (email: string, otp: string, password: string) =>
    request<any>("/auth/reset-password/otp", { method: "POST", body: JSON.stringify({ email, otp, password }) }),
  resetPasswordWithTotp: (email: string, token: string, password: string) =>
    request<any>("/auth/reset-password/otp/totp", { method: "POST", body: JSON.stringify({ email, token, password }) }),
  resetWithBackupCode: (email: string, code: string, password: string) =>
    request<any>("/auth/reset/backup", { method: "POST", body: JSON.stringify({ email, code, password }) }),

  // ── passkeys (WebAuthn) ──
  passkeyLoginOptions: () => request<{ success: boolean; data: any }>("/auth/passkey/login-options"),
  passkeyLogin: (credential: any) =>
    request<{ success: boolean; data: any }>("/auth/passkey/login", { method: "POST", body: JSON.stringify(credential) }),
  passkeyRegisterOptions: () =>
    request<{ success: boolean; data: any }>("/auth/passkey/register-options", { method: "POST" }),
  passkeyRegister: (credential: any) =>
    request<any>("/auth/passkey/register", { method: "POST", body: JSON.stringify(credential) }),
  passkeyList: () =>
    request<{ success: boolean; data: { _id: string; name: string; createdAt: string; lastUsedAt: string | null }[] }>("/auth/passkey"),
  passkeyDelete: (id: string) => request<any>(`/auth/passkey/${id}`, { method: "DELETE" }),
  resetPasskeyOptions: () => request<{ success: boolean; data: any }>("/auth/reset/passkey-options"),
  resetPasswordWithPasskey: (payload: object) =>
    request<any>("/auth/reset/passkey", { method: "POST", body: JSON.stringify(payload) }),

  // ── two-factor, recovery codes, other sign-in methods ──
  verify2FA: (pendingToken: string, token: string) =>
    request<{ success: boolean; data: any }>("/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ pendingToken, token }),
    }),
  loginWithBackupCode: (email: string, code: string) =>
    request<{ success: boolean; data: any }>("/auth/login/backup", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),
  emailOtpSend: (email: string) =>
    request<any>("/auth/login/email-otp/send", { method: "POST", body: JSON.stringify({ email }) }),
  emailOtpVerify: (email: string, otp: string) =>
    request<{ success: boolean; data: any }>("/auth/login/email-otp/verify", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    }),
  setup2FA: () => request<{ success: boolean; data: { secret: string; qr: string } }>("/auth/2fa/setup", { method: "POST" }),
  confirm2FA: (token: string) =>
    request<{ success: boolean; data: { backupCodes: string[] } }>("/auth/2fa/confirm", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  disable2FA: (password: string, token: string) =>
    request<any>("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password, token }) }),
  backupCodesStatus: () =>
    request<{ success: boolean; data: { remaining: number; generatedAt: string | null } }>("/auth/backup-codes"),
  generateBackupCodes: (password: string) =>
    request<{ success: boolean; data: { codes: string[] } }>("/auth/backup-codes", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  // ── verify email / phone ──
  sendEmailVerifyOtp: (email: string) =>
    request<any>("/auth/contact/email/send-otp", { method: "POST", body: JSON.stringify({ email }) }),
  verifyEmailOtp: (otp: string) =>
    request<any>("/auth/contact/email/verify-otp", { method: "POST", body: JSON.stringify({ otp }) }),
  sendPhoneVerifyOtp: () => request<any>("/auth/phone/send-otp", { method: "POST" }),
  verifyPhoneOtp: (otp: string) =>
    request<any>("/auth/phone/verify-otp", { method: "POST", body: JSON.stringify({ otp }) }),

  // ── signed-in devices ──
  sessions: () =>
    request<{ success: boolean; data: { _id: string; deviceName: string; platform: string; ip: string; lastActiveAt: string; current: boolean }[] }>(
      "/auth/sessions",
    ),
  removeSession: (id: string) => request<any>(`/auth/sessions/${id}`, { method: "DELETE" }),
  removeOtherSessions: () => request<any>("/auth/sessions/others", { method: "DELETE" }),

  login: (email: string, password: string) =>
    request<{ success: boolean; data: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (userData: {
    name: string;
    email: string;
    password: string;
    companyName?: string;
    role?: string;
    phone?: string;
  }) =>
    request<{ success: boolean; data: any }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(userData),
    }),

  getMe: () => request<{ success: boolean; data: any }>("/auth/me"),

  updateProfile: (updates: { name?: string; phone?: string; avatar?: string }) =>
    request<{ success: boolean; data: any }>("/auth/me", {
      method: "PUT",
      body: JSON.stringify(updates),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean; data: any }>("/auth/change-password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

export const usersAPI = {
  getAll: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{ success: boolean; count: number; data: any[] }>(
      `/users${query}`,
    );
  },
  getById: (id: string) =>
    request<{ success: boolean; data: any }>(`/users/${id}`),
  create: (userData: any) =>
    request<{ success: boolean; data: any }>("/users", {
      method: "POST",
      body: JSON.stringify(userData),
    }),
  update: (id: string, updates: any) =>
    request<{ success: boolean; data: any }>(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  delete: (id: string) =>
    request<{ success: boolean; message: string }>(`/users/${id}`, {
      method: "DELETE",
    }),
};

export const creditsAPI = {
  balance: () => request<{ success: boolean; data: any }>("/credits/balance"),
  packs: () => request<{ success: boolean; data: any }>("/credits/packs"),
  estimate: () => request<{ success: boolean; data: any }>("/credits/estimate"),
  topups: () => request<{ success: boolean; data: any[] }>("/credits/topups"),
  ledger: (page = 1, type = "") =>
    request<{ success: boolean; data: any[]; total: number; page: number }>(
      `/credits/ledger?page=${page}${type ? `&type=${type}` : ""}`,
    ),
  createTopup: (packId: string) =>
    request<{ success: boolean; data: any }>("/credits/topup", {
      method: "POST",
      body: JSON.stringify({ packId }),
    }),
  verifyTopup: (body: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) =>
    request<{ success: boolean; data: any }>("/credits/topup/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const settingsAPI = {
  get: () => request<{ success: boolean; data: any }>("/settings"),
  update: (settings: any) =>
    request<{ success: boolean; data: any }>("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
};

export { getToken, setToken, removeToken, ApiError, API_BASE };

// Terms & Privacy acceptance (backend /api/legal). Used by components/TermsGate.
export const legalAPI = {
  status: async () => {
    const r: any = await request("/legal/status");
    return r.data ?? r;
  },
  accept: async () => {
    const r: any = await request("/legal/accept", { method: "POST", body: JSON.stringify({}) });
    return r.data ?? r;
  },
};
