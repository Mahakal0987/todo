import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setAccessToken, clearAccessToken, getAccessToken } from "./api";
import type { UserDTO } from "@todo/api/types";

interface AuthCtx {
  user: UserDTO | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<{ ok: boolean; data: UserDTO }>("/api/auth/me", { token })
      .then((res) => {
        if (res.ok) setUser(res.data);
        else clearAccessToken();
      })
      .catch(() => clearAccessToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ ok: boolean; data: UserDTO & { access: string } }>("/api/auth/login", { email, password });
    if (!res.ok) throw new Error(res.error?.message ?? "Login failed");
    setAccessToken(res.data.access);
    setUser({ id: res.data.id, email: res.data.email, name: res.data.name, timezone: res.data.timezone ?? "UTC" });
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await api.post<{ ok: boolean; data: UserDTO & { access: string } }>("/api/auth/register", { email, password, name });
    if (!res.ok) throw new Error(res.error?.message ?? "Registration failed");
    setAccessToken(res.data.access);
    setUser({ id: res.data.id, email: res.data.email, name: res.data.name, timezone: res.data.timezone ?? "UTC" });
  }, []);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    clearAccessToken();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}