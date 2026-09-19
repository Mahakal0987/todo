import { ApiClient, resolveApiUrl } from "@todo/api/client";

export const api = new ApiClient({
  baseUrl: resolveApiUrl({ EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL }),
});

let accessToken: string | null = null;

export function setAccessToken(token: string) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}