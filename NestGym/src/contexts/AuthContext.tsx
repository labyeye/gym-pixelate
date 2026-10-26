import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  authAPI,
  getToken,
  removeToken,
  setToken,
  setUnauthorizedHandler,
  settingsAPI,
} from '../api/api';

export type UserRole =
  | 'gym_owner'
  | 'branch_manager'
  | 'receptionist'
  | 'trainer'
  | 'accountant'
  | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  avatar?: string;
}
interface Tenant {
  _id: string;
  name: string;
  plan: string;
  status: string;
  planExpiresAt?: string;
  /** false right after signup until the onboarding wizard is done */
  onboarded?: boolean;
}
type Result = { success: boolean; error?: string };

interface AuthCtx {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** optional modules the owner switched on/off in Settings (missing key = on) */
  modules: Record<string, boolean> | null;
  setModules: (m: Record<string, boolean>) => void;
  register: (b: { name: string; email: string; password: string; phone?: string }) => Promise<Result>;
  completeOnboarding: () => Promise<Result>;
  login: (email: string, password: string) => Promise<Result & { requires2FA?: boolean; pendingToken?: string }>;
  /** Finish a sign-in that returned { data: { token, tenant, ...user } } (2FA, email code). */
  completeLogin: (res: any) => Promise<Result>;
  otpSend: (phone: string) => Promise<Result>;
  loginWithOtp: (phone: string, otp: string) => Promise<Result>;
  logout: () => void;
  refreshTenant: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

const mapUser = (d: any): User => ({
  id: d._id || d.id,
  name: d.name,
  email: d.email,
  role: d.role,
  phone: d.phone,
  avatar: d.avatar,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modules, setModules] = useState<Record<string, boolean> | null>(null);

  const clear = useCallback(() => {
    setUser(null);
    setTenant(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    (async () => {
      try {
        if (!(await getToken())) return;
        const res: any = await authAPI.getMe();
        setUser(mapUser(res.data));
        setTenant(res.data.tenant || null);
      } catch (e: any) {
        if (e.status === 401) await removeToken();
      } finally {
        setIsLoading(false);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const finish = async (res: any): Promise<Result> => {
    const { token, tenant: t, ...u } = res.data;
    await setToken(token);
    setUser(mapUser(u));
    setTenant(t || null);
    return { success: true };
  };

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res: any = await authAPI.login(email.trim(), password);
      if (res.data?.requires2FA) return { success: false, requires2FA: true, pendingToken: res.data.pendingToken };
      return await finish(res);
    } catch (e: any) {
      return { success: false, error: e.message || 'Login failed.' };
    }
  }, []);

  const completeLogin = useCallback(async (res: any) => {
    try {
      return await finish(res);
    } catch (e: any) {
      return { success: false, error: e.message || 'Sign in failed.' };
    }
  }, []);

  const otpSend = useCallback(async (phone: string) => {
    try {
      await authAPI.otpSend(phone.trim());
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }, []);

  const loginWithOtp = useCallback(async (phone: string, otp: string) => {
    try {
      return await finish(await authAPI.otpVerify(phone.trim(), otp.trim()));
    } catch (e: any) {
      return { success: false, error: e.message || 'Invalid or expired OTP' };
    }
  }, []);

  const register = useCallback(async (b: { name: string; email: string; password: string; phone?: string }) => {
    try {
      return await finish(await authAPI.register({ ...b, email: b.email.trim().toLowerCase() }));
    } catch (e: any) {
      return { success: false, error: e.message || 'Registration failed.' };
    }
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      await authAPI.onboarding({ complete: true });
      const res: any = await authAPI.getMe();
      setTenant(res.data.tenant || null);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }, []);

  // the module switches decide which menu entries and screens exist, so load them once signed in
  const uid = user?.id;
  useEffect(() => {
    if (!uid) {
      setModules(null);
      return;
    }
    settingsAPI
      .get()
      .then((r: any) => setModules(r.data?.modules || null))
      .catch(() => {});
  }, [uid]);

  const logout = useCallback(async () => {
    await removeToken();
    clear();
  }, [clear]);

  const refreshTenant = useCallback(async () => {
    try {
      const res: any = await authAPI.getMe();
      setTenant(res.data.tenant || null);
    } catch {}
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        tenant,
        isAuthenticated: !!user,
        isLoading,
        modules,
        setModules,
        register,
        completeOnboarding,
        login,
        completeLogin,
        otpSend,
        loginWithOtp,
        logout,
        refreshTenant,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be within AuthProvider');
  return c;
}

export const MANAGERS: UserRole[] = ['gym_owner', 'branch_manager'];
export const isManager = (u?: User | null) => !!u && MANAGERS.includes(u.role);
