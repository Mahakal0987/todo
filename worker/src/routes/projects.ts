import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { projects } from "@todo/db/schema";
import type { AppEnv } from "../middleware";
import { requireAuth } from "../middleware";
import { ok, fail, parseJsonBody } from "../http";
import { randomId } from "@todo/auth";
import { toProjectDTO } from "./dto";

const projectsApi = new Hono<AppEnv>();
projectsApi.use("*", requireAuth);

projectsApi.get("/", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const rows = await db.select().from(projects).where(and(eq(projects.userId, user.id), isNull(projects.archivedAt))).all();
  return ok(c, rows.map(toProjectDTO));
});

projectsApi.post("/", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const b = await parseJsonBody<{ name?: string; color?: string; icon?: string; parentId?: string | null }>(c);
  if (!b?.name?.trim()) return fail(c, "invalid_input", "Project name required");

  const nowTs = new Date();
  const id = `p_${randomId()}`;
  await db
    .insert(projects)
    .values({
      id,
      userId: user.id,
      parentId: b.parentId ?? null,
      name: b.name.trim(),
      color: b.color ?? "#6366f1",
      icon: b.icon ?? "📁",
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .run();
  return ok(c, toProjectDTO({ id, userId: user.id, parentId: b.parentId ?? null, name: b.name.trim(), color: b.color ?? "#6366f1", icon: b.icon ?? "📁", isInbox: false, archivedAt: null, createdAt: nowTs, updatedAt: nowTs }), 201);
});

projectsApi.patch("/:id", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const id = c.req.param("id");
  const b = await parseJsonBody<{ name?: string; color?: string; icon?: string }>(c);
  const existing = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, user.id))).get();
  if (!existing) return fail(c, "not_found", "Project not found", 404);

  const patch = {
    ...(b?.name ? { name: b.name.trim() } : {}),
    ...(b?.color ? { color: b.color } : {}),
    ...(b?.icon ? { icon: b.icon } : {}),
    updatedAt: new Date(),
  };
  await db.update(projects).set(patch).where(eq(projects.id, id)).run();
  return ok(c, toProjectDTO({ ...existing, ...patch }));
});

projectsApi.delete("/:id", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const id = c.req.param("id");
  const existing = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, user.id))).get();
  if (!existing) return fail(c, "not_found", "Project not found", 404);

  await db.update(projects).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(projects.id, id)).run();
  return ok(c, { id, archived: true });
});

export default projectsApi;