import { ApiClient, resolveApiUrl } from "@todo/api/client";

export const api = new ApiClient({ baseUrl: resolveApiUrl(import.meta.env as unknown as Record<string, string>) });

let accessToken: string | null = localStorage.getItem("todo_access");

export function setAccessToken(token: string) {
  accessToken = token;
  localStorage.setItem("todo_access", token);
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
  localStorage.removeItem("todo_access");
}

export function authed<T>(p: Promise<T>): Promise<T> {
  return p;
}