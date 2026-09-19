import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { verifyAccessToken, type AuthSecrets } from "@todo/auth";
import { eq } from "drizzle-orm";
import { users } from "@todo/db/schema";
import { createDb, type DB } from "./db";
import type { Env } from "./env";

export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: DB;
    secrets: AuthSecrets;
    user: { id: string; email: string };
  };
}

export const ACCESS_COOKIE = "todo_access";
export const REFRESH_COOKIE = "todo_refresh";

/** Verify access token from Authorization header or cookie; load user. */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : getCookie(c, ACCESS_COOKIE);

  if (!token) {
    return unAuthorized(c, "Missing token");
  }

  const payload = await verifyAccessToken(token, {
    jwtSecret: c.env.JWT_SECRET,
    refreshSecret: c.env.REFRESH_SECRET,
  });

  if (!payload) {
    return unAuthorized(c, "Invalid or expired token");
  }

  const db = createDb(c.env);
  const user = await db.select().from(users).where(eq(users.id, payload.sub)).get();
  if (!user) {
    return unAuthorized(c, "User not found");
  }

  c.set("db", db);
  c.set("secrets", { jwtSecret: c.env.JWT_SECRET, refreshSecret: c.env.REFRESH_SECRET });
  c.set("user", { id: user.id, email: user.email });
  await next();
}

export function unAuthorized(c: Context<AppEnv>, message: string) {
  c.status(401);
  return c.json({ ok: false as const, error: { code: "unauthorized", message } });
}

export function setAuthCookies(c: Context<AppEnv>, access: string, refresh: string) {
  setCookie(c, ACCESS_COOKIE, access, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60,
  });
  setCookie(c, REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}