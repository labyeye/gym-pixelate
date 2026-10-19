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

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
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

  if (MUTATING_METHODS.has(method)) {
    headers["X-CSRF-Token"] = getCsrfToken();
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  let data: any = {};
  try {
    const text = await response.text();
    if (text) data = JSON.parse(text);
  } catch {}

  if (!response.ok) {
    if (response.status === 401) {
      removeToken();
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
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

  updateProfile: (updates: { name?: string; phone?: string }) =>
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

export const settingsAPI = {
  get: () => request<{ success: boolean; data: any }>("/settings"),
  update: (settings: any) =>
    request<{ success: boolean; data: any }>("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
};

export { getToken, setToken, removeToken, ApiError, API_BASE };
