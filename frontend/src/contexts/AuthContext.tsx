import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { User } from "@/types/gym";
import {
  authAPI,
  settingsAPI,
  setToken,
  removeToken,
  getToken,
} from "@/services/api";

interface Tenant {
  _id: string;
  name: string;
  plan: string;
  status: string;
  onboarded: boolean;
}

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  permissions: Record<string, Record<string, Record<string, boolean>>> | null;
  /** Optional modules the owner switched on/off in Settings (missing key = on). */
  modules: Record<string, boolean> | null;
  setModules: (m: Record<string, boolean>) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    requires2FA?: boolean;
    pendingToken?: string;
  }>;
  /** Finish a sign-in that returned { token, tenant, ...user } (2FA, backup code, email code). */
  completeLogin: (data: any) => void;
  loginWithOtp: (
    phone: string,
    otp: string,
  ) => Promise<{ success: boolean; error?: string }>;
  register: (data: {
    companyName?: string;
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
  refreshTenant: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapUser(data: any): User {
  return {
    id: data._id || data.id,
    name: data.name,
    email: data.email,
    role: data.role,
    avatar: data.avatar,
    phone: data.phone,
    department: data.department,
    employeeId: data.employeeId,
    status: data.status,
    lastLogin: data.lastLogin,
  };
}

function mapTenant(data: any): Tenant | null {
  if (!data) return null;
  return {
    _id: data._id,
    name: data.name,
    plan: data.plan,
    status: data.status,
    onboarded: data.onboarded !== false,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [permissions, setPermissions] = useState<Record<
    string,
    Record<string, Record<string, boolean>>
  > | null>(null);
  const [modules, setModules] = useState<Record<string, boolean> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      // Clear any legacy user/tenant data left in localStorage from older versions
      localStorage.removeItem("user");
      localStorage.removeItem("tenant");

      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await authAPI.getMe();
        setUser(mapUser(response.data));
        setTenant(mapTenant(response.data.tenant));
        settingsAPI
          .get()
          .then((res) => {
            if (res.data?.permissions) setPermissions(res.data.permissions);
          })
          .catch(() => {});
      } catch (error: any) {
        if (error.status === 401) {
          removeToken();
          setUser(null);
          setTenant(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await authAPI.login(email, password);
      if (response.data?.requires2FA) {
        return { success: false, requires2FA: true, pendingToken: response.data.pendingToken };
      }
      const { token, tenant: tenantData, ...userData } = response.data;
      setToken(token);
      setUser(mapUser(userData));
      setTenant(mapTenant(tenantData));
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Login failed. Please try again.",
      };
    }
  }, []);

  const completeLogin = useCallback((data: any) => {
    const { token, tenant: tenantData, ...userData } = data;
    setToken(token);
    setUser(mapUser(userData));
    setTenant(mapTenant(tenantData));
  }, []);

  const loginWithOtp = useCallback(async (phone: string, otp: string) => {
    try {
      const response = await authAPI.otpVerify(phone, otp);
      const { token, tenant: tenantData, ...userData } = response.data;
      setToken(token);
      setUser(mapUser(userData));
      setTenant(mapTenant(tenantData));
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Invalid or expired OTP",
      };
    }
  }, []);

  const register = useCallback(
    async (data: {
      companyName?: string;
      name: string;
      email: string;
      password: string;
      phone?: string;
    }) => {
      try {
        const response = await authAPI.register({
          name: data.name,
          email: data.email,
          password: data.password,
          companyName: data.companyName,
          phone: data.phone?.trim() || undefined,
        } as any);
        const { token, tenant: tenantData, ...userData } = response.data;
        setToken(token);
        setUser(mapUser(userData));
        setTenant(mapTenant(tenantData));
        return { success: true };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Registration failed. Please try again.",
        };
      }
    },
    [],
  );

  const logout = useCallback(() => {
    removeToken();
    setUser(null);
    setTenant(null);
    setPermissions(null);
  }, []);

  const updateUser = useCallback((userData: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...userData } : null));
  }, []);

  const refreshTenant = useCallback(async () => {
    try {
      const response = await authAPI.getMe();
      setTenant(mapTenant(response.data.tenant));
    } catch {}
  }, []);

  const refreshPermissions = useCallback(async () => {
    try {
      const res = await settingsAPI.get();
      setPermissions(res.data?.permissions || null);
      setModules(res.data?.modules || null);
    } catch {}
  }, []);

  // the module switches decide which menu entries and pages exist, so load them as soon as someone is signed in
  useEffect(() => {
    if (user) refreshPermissions();
    else setModules(null);
  }, [user?.id, refreshPermissions]);

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        permissions,
        modules,
        setModules,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginWithOtp,
        completeLogin,
        register,
        logout,
        updateUser,
        refreshPermissions,
        refreshTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be within AuthProvider");
  return ctx;
}
