import { Hono } from "hono";
import { and, asc, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import {
  tasks,
  taskSteps,
  dependencies,
  reminders,
  activityLog,
  repeatRules,
  projects,
  type NewTask,
}
 from "@todo/db/schema";
import { TaskStatus } from "@todo/db/schema";
import type { AppEnv } from "../middleware";
import { requireAuth } from "../middleware";
import { ok, fail, parseJsonBody } from "../http";
import { randomId } from "@todo/auth";
import { publishChange } from "../sync/publish";
import { toTaskDTO } from "./dto";

const tasksApi = new Hono<AppEnv>();
tasksApi.use("*", requireAuth);

function baseConds(userId: string) {
  return [eq(tasks.userId, userId), isNull(tasks.deletedAt)];
}

/* ------------------------------------------------------------------ */
/* List                                                               */
/* ------------------------------------------------------------------ */
tasksApi.get("/", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const q = c.req.query();
  const conds = baseConds(user.id);
  if (q.status) conds.push(eq(tasks.status, q.status as (typeof taskStatusEnum)[number]));
  if (q.type) conds.push(eq(tasks.type, q.type as string));
  if (q.projectId) conds.push(eq(tasks.projectId, q.projectId));
  if (q.tag) {
    conds.push(sql`EXISTS (SELECT 1 FROM json_each(${tasks.tagsJson}) WHERE json_each.value = ${q.tag})`);
  }
  if (q.q) conds.push(or(like(tasks.title, `%${q.q}%`), like(tasks.descriptionMd, `%${q.q}%`)));

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conds))
    .orderBy(asc(tasks.dueOn), desc(tasks.updatedAt))
    .all();
  return ok(c, rows.map((r) => toTaskDTO(r)));
});

/* ------------------------------------------------------------------ */
/* Read                                                               */
/* ------------------------------------------------------------------ */
tasksApi.get("/:id", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const id = c.req.param("id");
  const row = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, user.id))).get();
  if (!row || row.deletedAt) return fail(c, "not_found", "Task not found", 404);
  const steps = await db.select().from(taskSteps).where(eq(taskSteps.taskId, id)).orderBy(asc(taskSteps.sortOrder)).all();
  const deps = await db.select().from(dependencies).where(eq(dependencies.taskId, id)).all();
  return ok(c, { task: toTaskDTO(row), steps, deps });
});

/* ------------------------------------------------------------------ */
/* Create                                                             */
/* ------------------------------------------------------------------ */
tasksApi.post("/", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const b = await parseJsonBody<CreateTaskBody>(c);
  if (!b?.title?.trim()) return fail(c, "invalid_input", "Task title is required");

  const nowTs = new Date();
  const id = `t_${randomId()}`;

  let repeatRuleId: string | null = null;
  if (b.repeat?.kind) {
    const rid = `r_${randomId()}`;
    await db
      .insert(repeatRules)
      .values({
        id: rid,
        kind: b.repeat.kind,
        rrule: b.repeat.rrule ?? null,
        timeOfDay: b.repeat.timeOfDay ?? "09:00",
        generateAheadDays: b.repeat.generateAheadDays ?? 90,
        createdAt: nowTs,
      })
      .run();
    repeatRuleId = rid;
  }

  const val: NewTask = {
    id,
    userId: user.id,
    projectId: b.projectId ?? null,
    parentId: b.parentId ?? null,
    repeatRuleId,
    type: (b.type as string) ?? "one_time",
    title: b.title.trim(),
    descriptionMd: b.descriptionMd ?? "",
    priority: (b.priority as never) ?? "p3",
    status: (b.status as string) ?? "planned",
    progressPct: 0,
    actualHours: 0,
    estimatedHours: b.estimatedHours ?? null,
    budget: b.budget ?? null,
    dueOn: b.dueOn ? new Date(b.dueOn) : null,
    startOn: b.startOn ? new Date(b.startOn) : null,
    startsAt: b.startsAt ? new Date(b.startsAt) : null,
    endsAt: b.endsAt ? new Date(b.endsAt) : null,
    durationMin: b.durationMin ?? null,
    locationAddress: b.locationAddress ?? null,
    tagsJson: b.tags ?? [],
    linksJson: b.links ?? [],
    habitStreak: 0,
    mood: null,
    createdAt: nowTs,
    updatedAt: nowTs,
  };
  await db.insert(tasks).values(val).run();

  if (b.steps?.length) {
    for (let i = 0; i < b.steps.length; i++) {
      await db
        .insert(taskSteps)
        .values({ id: `s_${randomId()}`, taskId: id, title: b.steps[i].title, sortOrder: i, createdAt: nowTs })
        .run();
    }
  }

  await logActivity(db, id, user.id, "created", null, null, toTaskDTO(val));
  const dto = toTaskDTO(val);
  c.executionCtx.waitUntil(publishChange(c.env, user.id, "tasks", "upsert", dto));
  return ok(c, dto, 201);
});

/* ------------------------------------------------------------------ */
/* Update (PATCH)                                                      */
/* ------------------------------------------------------------------ */
tasksApi.patch("/:id", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const id = c.req.param("id");
  const b = await parseJsonBody<Record<string, unknown>>(c);
  if (!b) return fail(c, "invalid_input", "Malformed body");

  const existing = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, user.id))).get();
  if (!existing) return fail(c, "not_found", "Task not found", 404);

  const nowTs = new Date();
  const patch = mutableFields(b, nowTs);
  const updated = { ...existing, ...patch };
  if (b.status === "done" && existing.status !== "done") updated.completedAt = nowTs;
  if (b.status !== undefined && b.status !== "done") updated.completedAt = null;

  await db.update(tasks).set(updated).where(eq(tasks.id, id)).run();
  await logActivity(db, id, user.id, "updated", null, null, null);
  const dto = toTaskDTO(updated);
  c.executionCtx.waitUntil(publishChange(c.env, user.id, "tasks", "upsert", dto));
  return ok(c, dto);
});

/* ------------------------------------------------------------------ */
/* Delete (soft, with tombstone)                                      */
/* ------------------------------------------------------------------ */
tasksApi.delete("/:id", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const id = c.req.param("id");
  const existing = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, user.id))).get();
  if (!existing) return fail(c, "not_found", "Task not found", 404);

  await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .run();
  await logActivity(db, id, user.id, "deleted", null, null, null);
  c.executionCtx.waitUntil(publishChange(c.env, user.id, "tasks", "delete", { id }));
  return ok(c, { id, deleted: true });
});

/* ------------------------------------------------------------------ */
/* Steps                                                              */
/* ------------------------------------------------------------------ */
tasksApi.post("/:id/steps", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const taskId = c.req.param("id");
  const { title } = await c.req.json<{ title: string }>().catch(() => ({ title: "" }));
  if (!title.trim()) return fail(c, "invalid_input", "Step title required");

  const stepId = `s_${randomId()}`;
  const maxOrder = db
    .select({ m: sql<number>`COALESCE(MAX(${taskSteps.sortOrder}),0) + 1` })
    .from(taskSteps)
    .where(eq(taskSteps.taskId, taskId));
  const [maxRow] = await maxOrder.all();
  await db
    .insert(taskSteps)
    .values({ id: stepId, taskId, title: title.trim(), sortOrder: maxRow.m, createdAt: new Date() })
    .run();
  c.executionCtx.waitUntil(publishChange(c.env, user.id, "steps", "upsert", { id: stepId, taskId, title, done: false }));
  return ok(c, { id: stepId, taskId, title: title.trim(), done: false, sortOrder: maxRow.m }, 201);
});

tasksApi.patch("/steps/:stepId", async (c) => {
  const db = c.get("db");
  const stepId = c.req.param("stepId");
  const b = await c.req.json<{ done?: boolean; title?: string }>().catch(() => ({}));
  const existing = await db.select().from(taskSteps).where(eq(taskSteps.id, stepId)).get();
  if (!existing) return fail(c, "not_found", "Step not found", 404);
  await db.update(taskSteps).set({ ...(b.done !== undefined ? { done: b.done } : {}), ...(b.title ? { title: b.title } : {}) }).where(eq(taskSteps.id, stepId)).run();
  return ok(c, { id: stepId, done: b.done ?? existing.done });
});

tasksApi.delete("/steps/:stepId", async (c) => {
  const db = c.get("db");
  const stepId = c.req.param("stepId");
  await db.delete(taskSteps).where(eq(taskSteps.id, stepId)).run();
  return ok(c, { id: stepId, deleted: true });
});

/* ------------------------------------------------------------------ */
/* Dependencies                                                        */
/* ------------------------------------------------------------------ */
tasksApi.post("/:id/deps", async (c) => {
  const db = c.get("db");
  const taskId = c.req.param("id");
  const b = await c.req.json<{ dependsOnId: string; kind?: string }>().catch(() => ({ dependsOnId: "" }));
  if (!b.dependsOnId) return fail(c, "invalid_input", "dependsOnId required");
  // guard against self-reference
  if (b.dependsOnId === taskId) return fail(c, "invalid_input", "A task cannot depend on itself");

  const depId = `d_${randomId()}`;
  await db
    .insert(dependencies)
    .values({ id: depId, taskId, dependsOnId: b.dependsOnId, kind: (b.kind as string) ?? "blocks" })
    .run();
  return ok(c, { id: depId, taskId, dependsOnId: b.dependsOnId, kind: b.kind ?? "blocks" }, 201);
});

tasksApi.delete("/deps/:depId", async (c) => {
  const db = c.get("db");
  await db.delete(dependencies).where(eq(dependencies.id, c.req.param("depId"))).run();
  return ok(c, { deleted: true });
});

/* ------------------------------------------------------------------ */
/* Reminders                                                          */
/* ------------------------------------------------------------------ */
tasksApi.post("/:id/reminders", async (c) => {
  const db = c.get("db");
  const taskId = c.req.param("id");
  const b = await c.req.json<{ triggerAt: string; kind?: string; channel?: string }>().catch(() => ({}));
  if (!b.triggerAt) return fail(c, "invalid_input", "triggerAt required");
  const rid = `r_${randomId()}`;
  await db
    .insert(reminders)
    .values({ id: rid, taskId, triggerAt: new Date(b.triggerAt), kind: b.kind ?? "custom", channel: b.channel ?? "push", createdAt: new Date() })
    .run();
  return ok(c, { id: rid, taskId, triggerAt: b.triggerAt }, 201);
});

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
type CreateTaskBody = {
  projectId?: string | null;
  parentId?: string | null;
  type?: string;
  title: string;
  descriptionMd?: string;
  priority?: string;
  status?: string;
  dueOn?: string | null;
  startOn?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  durationMin?: number | null;
  estimatedHours?: number | null;
  budget?: number | null;
  tags?: string[];
  links?: string[];
  locationAddress?: string | null;
  repeat?: {
    kind: string;
    timeOfDay?: string;
    rrule?: string;
    generateAheadDays?: number;
  } | null;
  steps?: { title: string }[];
};

const MUTABLE = [
  "projectId",
  "parentId",
  "type",
  "title",
  "descriptionMd",
  "status",
  "priority",
  "progressPct",
  "estimatedHours",
  "actualHours",
  "budget",
  "startOn",
  "dueOn",
  "startsAt",
  "endsAt",
  "durationMin",
  "snoozeUntil",
  "locationAddress",
  "tagsJson",
  "linksJson",
  "habitGoalPerPeriod",
  "habitStreak",
  "mood",
] as const;

function mutableFields(b: Record<string, unknown>, nowTs: Date): Partial<NewTask> {
  const out: Record<string, unknown> = { updatedAt: nowTs };
  for (const key of MUTABLE) {
    if (key === "tagsJson" && Array.isArray(b.tags)) out[key] = b.tags;
    else if (key === "linksJson" && Array.isArray(b.links)) out[key] = b.links;
    else if (key in b && b[key] !== undefined) {
      const v = b[key];
      if (typeof v === "string" && (key.endsWith("On") || key.endsWith("At") || key === "snoozeUntil")) {
        out[key] = new Date(v);
      } else {
        out[key] = v;
      }
    }
  }
  return out as Partial<NewTask>;
}

async function logActivity(
  db: AppEnv["Variables"]["db"],
  taskId: string,
  actorId: string,
  action: string,
  oldVal: unknown,
  newVal: unknown,
  row?: unknown,
) {
  await db
    .insert(activityLog)
    .values({
      id: `a_${randomId()}`,
      taskId,
      actorId,
      action,
      oldVal,
      newVal,
      at: new Date(),
    })
    .run();
}

export default tasksApi;
