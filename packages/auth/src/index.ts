import { SignJWT, jwtVerify } from "jose";

const enc = new TextEncoder();

export function randomId(len = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function sessionId(): string {
  return `s_${randomId(24)}`;
}

/* ------------------------------------------------------------------ */
/* Password hashing: PBKDF2-SHA256 via Web Crypto (Workers-safe)       */
/* ------------------------------------------------------------------ */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100_000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Buffer.from(bits).toString("base64");
}

export async function createPasswordHash(password: string): Promise<string> {
  const salt = randomId(16);
  const hash = await hashPassword(password, salt);
  return `pbkdf2.${salt}.${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(".");
  if (scheme !== "pbkdf2" || !salt || !hash) return false;
  const candidate = await hashPassword(password, salt);
  return candidate === hash;
}

/** SHA-256 hex digest (for refresh-token commit values). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/* JWT (HS256)                                                         */
/* ------------------------------------------------------------------ */
export interface AuthSecrets {
  jwtSecret: string; // access token HMAC key
  refreshSecret: string; // refresh token HMAC key
}

export async function signAccessToken(userId: string, secrets: AuthSecrets): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(enc.encode(secrets.jwtSecret));
}

export async function signRefreshToken(
  userId: string,
  sessionIdKey: string,
  secrets: AuthSecrets,
): Promise<string> {
  return new SignJWT({ sub: userId, sid: sessionIdKey })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(enc.encode(secrets.refreshSecret));
}

export interface TokenPayload {
  sub: string;
  sid?: string;
  exp: number;
  iat: number;
}

export async function verifyAccessToken(token: string, secrets: AuthSecrets): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, enc.encode(secrets.jwtSecret));
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string, secrets: AuthSecrets): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, enc.encode(secrets.refreshSecret));
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}