import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createDb } from "./db";
import type { Env } from "./env";
import type { AppEnv } from "./middleware";
import auth from "./routes/auth";
import tasksApi from "./routes/tasks";
import projectsApi from "./routes/projects";
import sync from "./routes/sync";
import { runScheduledMaintenance } from "./cron";

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: (origin) => origin,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.use("*", logger());

app.get("/", (c) => c.json({ ok: true, app: "PlanDeck", version: "0.1.0" }));
app.get("/health", (c) => c.json({ ok: true }));

app.route("/api/auth", auth);
app.route("/api/tasks", tasksApi);
app.route("/api/projects", projectsApi);
app.route("/api/sync", sync);

export default {
  fetch: app.fetch,
  scheduled: async (controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    const db = createDb(env);
    ctx.waitUntil(
      runScheduledMaintenance(db).then((res) =>
        console.log(`[cron] materialized=${res.materialized} reminders=${res.reminders}`),
      ),
    );
  },
} satisfies ExportedHandler<Env>;

export { RealtimeHub } from "./durable-objects/realtime-hub";