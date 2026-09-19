import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const taskTypeEnum = [
  "one_time",
  "deadline",
  "time_blocked",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "recurring",
  "habit",
  "milestone",
  "waiting",
  "shopping",
  "reference",
  "template",
] as const;

export const taskStatusEnum = [
  "planned",
  "active",
  "waiting",
  "done",
  "cancelled",
  "archived",
] as const;

export const priorityEnum = ["p0", "p1", "p2", "p3", "p4"] as const;

/* ------------------------------------------------------------------ */
/* users                                                               */
/* ------------------------------------------------------------------ */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passHash: text("pass_hash").notNull(),
    name: text("name").notNull().default(""),
    avatarUrl: text("avatar_url"),
    timezone: text("timezone").notNull().default("UTC"),
    settingsJson: text("settings_json", { mode: "json" }).$type<Record<string, unknown>>().default({}),
    verifiedAt: integer("verified_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_users_email").on(t.email)],
);

/** Per-user session/auth tokens (verifier rounds stored in KV too) */
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refreshHash: text("refresh_hash").notNull(),
  deviceId: text("device_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* projects                                                            */
/* ------------------------------------------------------------------ */
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): any => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6366f1"),
    icon: text("icon").notNull().default("📁"),
    isInbox: integer("is_inbox", { mode: "boolean" }).notNull().default(false),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_projects_user").on(t.userId, t.parentId)],
);

/* ------------------------------------------------------------------ */
/* repeat rules                                                        */
/* ------------------------------------------------------------------ */
export const repeatRules = sqliteTable("repeat_rules", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // daily | weekly | monthly | yearly | custom
  rrule: text("rrule"), // full RRULE string when custom
  interval: integer("interval").notNull().default(1),
  byDay: text("by_day", { mode: "json" }).$type<string[]>().default([]),
  byMonthDay: integer("by_month_day"),
  exceptionsJson: text("exceptions_json", { mode: "json" }).$type<string[]>().default([]),
  endOn: integer("end_on", { mode: "timestamp" }),
  generateAheadDays: integer("generate_ahead_days").notNull().default(90),
  timeOfDay: text("time_of_day").default("09:00"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* tasks                                                               */
/* ------------------------------------------------------------------ */
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    parentId: text("parent_id"), // hierarchical tasks (unlimited nesting)
    repeatRuleId: text("repeat_rule_id").references(() => repeatRules.id, { onDelete: "set null" }),
    templateId: text("template_id"), // tasks spawned from a template

    type: text("type", { enum: taskTypeEnum }).notNull().default("one_time"),
    title: text("title").notNull(),
    descriptionMd: text("description_md").notNull().default(""),
    status: text("status", { enum: taskStatusEnum }).notNull().default("planned"),
    priority: text("priority", { enum: priorityEnum }).notNull().default("p3"),

    progressPct: integer("progress_pct").notNull().default(0),
    estimatedHours: integer("estimated_hours"),
    actualHours: integer("actual_hours").notNull().default(0),
    budget: integer("budget"), // money field (cents) for shopping/errands

    startOn: integer("start_on", { mode: "timestamp" }),
    dueOn: integer("due_on", { mode: "timestamp" }),
    startsAt: integer("starts_at", { mode: "timestamp" }),
    endsAt: integer("ends_at", { mode: "timestamp" }),
    durationMin: integer("duration_min"),
    snoozeUntil: integer("snooze_until", { mode: "timestamp" }),

    locationAddress: text("location_address"),
    locationLat: text("location_lat"),
    locationLng: text("location_lng"),
    contactJson: text("contact_json", { mode: "json" }).$type<any>(),
    tagsJson: text("tags_json", { mode: "json" }).$type<string[]>().default([]),
    linksJson: text("links_json", { mode: "json" }).$type<string[]>().default([]),

    habitGoalPerPeriod: integer("habit_goal_per_period"),
    habitStreak: integer("habit_streak").notNull().default(0),
    mood: text("mood"),

    createdById: text("created_by_id").references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    deletedAt: integer("deleted_at", { mode: "timestamp" }), // soft delete / tombstone
  },
  (t) => [
    index("idx_tasks_user_status").on(t.userId, t.status, t.deletedAt),
    index("idx_tasks_project").on(t.projectId),
    index("idx_tasks_due").on(t.dueOn),
    index("idx_tasks_parent").on(t.parentId),
  ],
);

/* ------------------------------------------------------------------ */
/* checklist steps                                                     */
/* ------------------------------------------------------------------ */
export const taskSteps = sqliteTable(
  "task_steps",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    repeatedFrom: text("repeated_from"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_steps_task").on(t.taskId, t.sortOrder)],
);

/* ------------------------------------------------------------------ */
/* dependencies                                                        */
/* ------------------------------------------------------------------ */
export const dependencies = sqliteTable(
  "dependencies",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: text("depends_on_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("blocks"), // blocks | relates | duplicates
  },
  (t) => [index("idx_deps_task").on(t.taskId, t.dependsOnId)],
);

/* ------------------------------------------------------------------ */
/* reminders                                                           */
/* ------------------------------------------------------------------ */
export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    triggerAt: integer("trigger_at", { mode: "timestamp" }).notNull(),
    kind: text("kind").notNull().default("due"), // due | custom | chain
    channel: text("channel").notNull().default("push"), // app | push | email
    firedAt: integer("fired_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_reminders_trigger").on(t.triggerAt, t.firedAt)],
);

/* ------------------------------------------------------------------ */
/* comments & activity                                                 */
/* ------------------------------------------------------------------ */
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id),
    contentMd: text("content_md").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_comments_task").on(t.taskId)],
);

export const activityLog = sqliteTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id),
    action: text("action").notNull(),
    field: text("field"),
    oldVal: text("old_val", { mode: "json" }).$type<unknown>(),
    newVal: text("new_val", { mode: "json" }).$type<unknown>(),
    at: integer("at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_activity_task").on(t.taskId, t.at)],
);

/* ------------------------------------------------------------------ */
/* attachments (R2 keys)                                               */
/* ------------------------------------------------------------------ */
export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    r2Key: text("r2_key").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull().default("application/octet-stream"),
    size: integer("size").notNull().default(0),
    thumbKey: text("thumb_key"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_attachments_task").on(t.taskId)],
);

/* ------------------------------------------------------------------ */
/* sync: devices, outbox, scheduled jobs                               */
/* ------------------------------------------------------------------ */
export const deviceRegistry = sqliteTable("device_registry", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull().default("Unknown device"),
  platform: text("platform").notNull().default("web"), // web | android | windows
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/** Per-device offline mutation queue */
export const outbox = sqliteTable("outbox", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  userId: text("user_id").notNull(),
  seq: integer("seq").notNull(),
  table: text("table").notNull(),
  op: text("op").notNull().default("upsert"), // upsert | delete
  payloadJson: text("payload_json", { mode: "json" }).$type<unknown>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  appliedAt: integer("applied_at", { mode: "timestamp" }),
});

/** Per-entity version for conflict resolution */
export const syncState = sqliteTable("sync_state", {
  id: text("id").primaryKey(), // `${table}:${rowId}`
  table: text("table").notNull(),
  rowId: text("row_id").notNull(),
  userId: text("user_id").notNull(),
  version: integer("version").notNull().default(0),
  lastSyncedDeviceId: text("last_synced_device_id"),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/** Recurrence / reminder materialization jobs */
export const scheduledJobs = sqliteTable(
  "scheduled_jobs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // materialize_recurrence | fire_reminder | rollover_daily
    runAt: integer("run_at", { mode: "timestamp" }).notNull(),
    status: text("status").notNull().default("pending"), // pending | done | failed
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_jobs_run").on(t.runAt, t.status)],
);

export const schemaColumns = {
  users,
  sessions,
  projects,
  repeatRules,
  tasks,
  taskSteps,
  dependencies,
  reminders,
  comments,
  activityLog,
  attachments,
  deviceRegistry,
  outbox,
  syncState,
  scheduledJobs,
} as const;

export type TaskType = (typeof taskTypeEnum)[number];
export type TaskStatus = (typeof taskStatusEnum)[number];
export type Priority = (typeof priorityEnum)[number];

export type User = typeof users.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type RepeatRule = typeof repeatRules.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export const now = sql`(unixepoch())`;