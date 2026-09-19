import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { users, sessions, deviceRegistry } from "@todo/db/schema";
import {
  createPasswordHash,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  randomId,
  sha256Hex,
} from "@todo/auth";
import type { AppEnv } from "../middleware";
import { requireAuth, setAuthCookies, REFRESH_COOKIE } from "../middleware";
import { ok, fail, parseJsonBody } from "../http";
import { getCookie, deleteCookie } from "hono/cookie";
import { createDb } from "../db";

const auth = new Hono<AppEnv>();

auth.post("/register", async (c) => {
  const body = await parseJsonBody<{ email: string; password: string; name?: string }>(c);
  if (!body?.email || !body?.password || body.password.length < 8) {
    return fail(c, "invalid_input", "A valid email and password (min 8 chars) are required");
  }

  const db = createDb(c.env);
  const email = body.email.trim().toLowerCase();
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return fail(c, "email_taken", "An account with this email already exists", 409);
  }

  const id = `u_${randomId()}`;
  const nowTs = new Date();
  await db
    .insert(users)
    .values({
      id,
      email,
      name: body.name?.trim() || email.split("@")[0],
      passHash: await createPasswordHash(body.password),
      timezone: c.req.header("x-timezone") || "UTC",
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .run();

  // auto-create an Inbox project so every user starts with a brain-dump list
  await db
    .insert(deviceRegistry)
    .values({ id: `dev_${randomId(16)}`, userId: id, platform: "web", lastSeenAt: nowTs, createdAt: nowTs })
    .run();

  const env = c.env;
  const { access, refresh } = await issueTokens(db, env, id, nowTs);
  setAuthCookies(c, access, refresh);
  return ok(c, { id, email, name: body.name?.trim() || email.split("@")[0], access, refresh }, 201);
});

auth.post("/login", async (c) => {
  const body = await parseJsonBody<{ email: string; password: string }>(c);
  if (!body?.email || !body?.password) return fail(c, "invalid_input", "Email and password required");

  const db = createDb(c.env);
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email.trim().toLowerCase()))
    .get();
  if (!user || !(await verifyPassword(body.password, user.passHash))) {
    return fail(c, "bad_credentials", "Incorrect email or password", 401);
  }

  const env = c.env;
  const { access, refresh } = await issueTokens(db, env, user.id, new Date());
  setAuthCookies(c, access, refresh);
  return ok(c, { id: user.id, email: user.email, name: user.name, access, refresh });
});

auth.post("/refresh", async (c) => {
  const refreshToken = getCookie(c, REFRESH_COOKIE) ?? (await c.req.json().catch(() => null))?.refresh;
  if (!refreshToken) return fail(c, "invalid_input", "Refresh token required", 401);

  const secrets = { jwtSecret: c.env.JWT_SECRET, refreshSecret: c.env.REFRESH_SECRET };
  const payload = await verifyRefreshToken(refreshToken, secrets);
  if (!payload?.sub || !payload.sid) return fail(c, "invalid_token", "Invalid refresh token", 401);

  const db = createDb(c.env);
  const sess = await db.select().from(sessions).where(eq(sessions.id, payload.sid)).get();
  if (!sess || sess.revokedAt) return fail(c, "invalid_token", "Session revoked", 401);

  const access = await signAccessToken(payload.sub, secrets);
  const refresh = await signRefreshToken(payload.sub, payload.sid, secrets);
  setAuthCookies(c, access, refresh);
  return ok(c, { access, refresh });
});

auth.post("/logout", async (c) => {
  const refreshToken = getCookie(c, REFRESH_COOKIE);
  if (refreshToken) {
    const payload = await verifyRefreshToken(refreshToken, {
      jwtSecret: c.env.JWT_SECRET,
      refreshSecret: c.env.REFRESH_SECRET,
    });
    if (payload?.sid) {
      await createDb(c.env).update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, payload.sid)).run();
    }
  }
  deleteCookie(c, REFRESH_COOKIE);
  return ok(c, { loggedOut: true });
});

auth.get("/me", requireAuth, async (c) => {
  const db = c.get("db");
  const user = await db.select().from(users).where(eq(users.id, c.get("user").id)).get();
  return ok(c, { id: user!.id, email: user!.email, name: user!.name, timezone: user!.timezone });
});

async function issueTokens(
  db: ReturnType<typeof createDb>,
  env: import("../env").Env,
  userId: string,
  nowTs: Date,
) {
  const sid = `s_${randomId(24)}`;
  const secrets = { jwtSecret: env.JWT_SECRET, refreshSecret: env.REFRESH_SECRET };
  const access = await signAccessToken(userId, secrets);
  const refresh = await signRefreshToken(userId, sid, secrets);
  const refreshHash = await sha256Hex(refresh);

  await db
    .insert(sessions)
    .values({
      id: sid,
      userId,
      refreshHash,
      deviceId: `dev_${randomId(16)}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: nowTs,
    })
    .run();

  return { access, refresh, sid };
}

export default auth;