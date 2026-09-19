import type { Env } from "../env";

export interface SyncPush {
  op: "upsert" | "delete";
  table: string;
  row: Record<string, unknown>;
}

/**
 * Fan out a change to every connected device of the user via their
 * per-user Realtime Hub Durable Object.
 */
export async function publishChange(env: Env, userId: string, table: string, op: SyncPush["op"], row: Record<string, unknown>) {
  const id = env.HUBS.idFromName(userId);
  const stub = env.HUBS.get(id);
  await stub.fetch("https://hub/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, table, row } satisfies SyncPush),
  });
}