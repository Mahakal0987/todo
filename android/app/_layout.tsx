import { useEffect } from "react";
import { Slot } from "expo-router";
import { AuthProvider, useAuth } from "@/lib/auth";
import { api, getAccessToken, setAccessToken, clearAccessToken } from "@/lib/api";

export default function RootLayout() {
  const { user, loading, login, register, logout } = useAuth();

  useEffect(() => {
    if (!getAccessToken()) return;
    api.get<{ ok: boolean; data: { id: string; email: string; name: string; timezone: string } }>(
      "/api/auth/me",
      { token: getAccessToken() }
    )
      .then((res) => {
        if (res.ok) setAccessToken(res.data.id); // todo: fix auth context
      })
      .catch(() => clearAccessToken());
  }, []);

  return (
    <AuthProvider>
      <Slot />
    </AuthProvider>
  );
}