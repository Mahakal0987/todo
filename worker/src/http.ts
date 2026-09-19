import type { Context } from "hono";

/** Send a consistent { ok, data } envelope. */
export function ok<T>(c: Context, data: T, status: number = 200) {
  return c.json({ ok: true, data }, status as any);
}

/** Send a consistent { ok, error } envelope. */
export function fail(c: Context, code: string, message: string, status: number = 400) {
  c.status(status as any);
  return c.json({ ok: false, error: { code, message } });
}

export async function parseJsonBody<T>(c: Context): Promise<T | null> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return null;
  }
}