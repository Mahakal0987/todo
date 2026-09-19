/**
 * Isomorphic API client shared by web, android and windows apps.
 * Base URL is injected per-platform (env VITE_API_URL / EXPO_PUBLIC_API_URL / tauri config).
 */

export interface ApiClientOptions {
  baseUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchImpl?: typeof fetch;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  token?: string | null;
}

const SHARED_HEADERS = {
  "Content-Type": "application/json",
} as const;

export class ApiClient {
  constructor(private readonly opts: ApiClientOptions) {}

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { body, token, headers, ...rest } = opts;
    const init: RequestInit = {
      ...rest,
      headers: {
        ...SHARED_HEADERS,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    };
    const fetchImpl = this.opts.fetchImpl ?? globalThis.fetch;
    const res = await fetchImpl(`${this.opts.baseUrl}${path}`, body !== undefined ? { ...init, body: JSON.stringify(body) } : init);
    return (await res.json()) as T;
  }

  get<T>(path: string, opts?: RequestOptions) {
    return this.request<T>(path, opts);
  }

  post<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>(path, { ...opts, method: "POST", body });
  }

  put<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>(path, { ...opts, method: "PUT", body });
  }

  patch<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>(path, { ...opts, method: "PATCH", body });
  }

  delete<T>(path: string, opts?: RequestOptions) {
    return this.request<T>(path, { ...opts, method: "DELETE" });
  }
}

export function resolveApiUrl(env: { VITE_API_URL?: string; EXPO_PUBLIC_API_URL?: string }): string {
  return (
    env.VITE_API_URL ??
    env.EXPO_PUBLIC_API_URL ??
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:8787")
  );
}

declare const window: { location: { origin: string } } | undefined;