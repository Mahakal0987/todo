import { drizzle as drizzleD1, type DrizzleD1Database } from "drizzle-orm/d1";
import type { Env } from "./env";
import * as schema from "@todo/db/schema";

export type DB = DrizzleD1Database<typeof schema>;

export function createDb(env: Env): DB {
  return drizzleD1(env.DB, { schema });
}

export { schema };