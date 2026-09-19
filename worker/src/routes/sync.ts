import { Hono } from "hono";
import { and, isNull, gte, eq } from "drizzle-orm";
import { tasks, taskSteps, projects } from "@todo/db/schema";
import type { AppEnv } from "../middleware";
import { requireAuth } from "../middleware";
import { ok } from "../http";
import { toTaskDTO, toProjectDTO } from "./dto";

const sync = new Hono<AppEnv>();
sync.use("*", requireAuth);

/** WebSocket realtime channel: upgrade to the per-user Realtime Hub DO. */
sync.get("/connect", async (c) => {
  const user = c.get("user");
  const id = c.env.HUBS.idFromName(user.id);
  const stub = c.env.HUBS.get(id);

  const token = c.req.header("authorization")?.replace(/^Bearer /, "") ?? "";
  const wsUrl = new URL("https://hub.internal/ws");
  wsUrl.searchParams.set("token", token);
  wsUrl.searchParams.set("deviceId", c.req.query("deviceId") ?? "");

  const upstream = await stub.fetch(wsUrl.toString(), { headers: c.req.raw.headers });
  const webSocket: WebSocket | undefined = (upstream as unknown as { webSocket?: WebSocket }).webSocket;
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
    ...(webSocket ? { webSocket } : {}),
  });
});

/** Pull deltas since a cursor (unix ms). Single-logic delta for the MVP. */
sync.get("/pull", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const since = Number(c.req.query("since") ?? "0");
  const sinceDate = new Date(Math.max(since, 0));
  const now = new Date();

  const changedTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, user.id), gte(tasks.updatedAt, sinceDate)))
    .all();
  const changedProjects = await db
    .select()
    .from(projects)
    .where(gte(projects.updatedAt, sinceDate))
    .all();
  const changedSteps = await db
    .select()
    .from(taskSteps)
    .where(gte(taskSteps.createdAt, sinceDate))
    .all();

  type Item = { op: "upsert" | "delete"; table: string; row: Record<string, unknown> };
  const items: Item[] = [];

  for (const t of changedTasks) {
    items.push(t.deletedAt
      ? { op: "delete", table: "tasks", row: { id: t.id, deletedAt: now.toISOString() } }
      : { op: "upsert", table: "tasks", row: toTaskDTO(t) as unknown as Record<string, unknown> });
  }
  for (const p of changedProjects) {
    if (!p.archivedAt) items.push({ op: "upsert", table: "projects", row: toProjectDTO(p) as unknown as Record<string, unknown> });
  }
  for (const s of changedSteps) {
    items.push({ op: "upsert", table: "steps", row: { ...s } });
  }

  return ok(c, { cursor: String(Date.now()), items });
});

export default sync;