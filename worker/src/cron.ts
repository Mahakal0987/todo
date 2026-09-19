import { and, eq, isNull } from "drizzle-orm";
import { tasks, repeatRules, reminders } from "@todo/db/schema";
import type { DB } from "./db";

/**
 * Materialize future instances of recurring tasks and pre-fire scheduled
 * reminders. Ran by the worker's `scheduled` handler (cron).
 *
 * Recurrence model: a *template* task carries a `repeat_rule_id`. Instances are
 * cloned rows with type inherited + computed due dates. Completing the template
 * keeps the chain alive; instances are standalone snapshots.
 */
export async function runScheduledMaintenance(db: DB): Promise<{ materialized: number; reminders: number }> {
  const now = new Date();
  const materialized = await materializeRecurrences(db, now);
  const remindersFired = 0; // push infra arrives with the platform apps (Phase 4)
  return { materialized, reminders: remindersFired };
}

async function materializeRecurrences(db: DB, now: Date): Promise<number> {
  const ruleRows = await db.select().from(repeatRules).all();
  let count = 0;
  for (const rule of ruleRows) {
    if (rule.endOn && rule.endOn < now) continue;
    const template = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.repeatRuleId, rule.id), isNull(tasks.deletedAt)))
      .get();
    if (!template) continue;

    const horizon = new Date(now.getTime() + rule.generateAheadDays * 24 * 60 * 60 * 1000);
    const materialized = await materializeRule(db, template, rule, now, horizon);
    count += materialized;
  }
  return count;
}

async function materializeRule(
  db: DB,
  template: typeof tasks.$inferSelect,
  rule: typeof repeatRules.$inferSelect,
  now: Date,
  horizon: Date,
): Promise<number> {
  const occurrences = computeOccurrences(rule, now, horizon);
  let count = 0;
  for (const occ of occurrences) {
    const existing = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.repeatRuleId, rule.id), eq(tasks.dueOn, occ), eq(tasks.templateId, template.id)))
      .get();
    if (existing) continue;

    const id = `t_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    await db
      .insert(tasks)
      .values({
        id,
        userId: template.userId,
        projectId: template.projectId,
        templateId: template.id,
        repeatRuleId: rule.id,
        type: template.type,
        title: template.title,
        descriptionMd: template.descriptionMd,
        status: "planned",
        priority: template.priority,
        progressPct: 0,
        actualHours: 0,
        estimatedHours: template.estimatedHours,
        budget: template.budget,
        dueOn: occ,
        startOn: template.startOn,
        tagsJson: template.tagsJson,
        linksJson: template.linksJson,
        habitGoalPerPeriod: template.habitGoalPerPeriod,
        mood: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    count++;
  }
  return count;
}

/** Compute occurrence dates between `now` and `horizon` for a rule. */
export function computeOccurrences(
  rule: typeof repeatRules.$inferSelect,
  now: Date,
  horizon: Date,
): Date[] {
  const out: Date[] = [];
  const [hh, mm] = (rule.timeOfDay ?? "09:00").split(":").map(Number);

  switch (rule.kind) {
    case "daily": {
      for (let d = new Date(now); d <= horizon; d.setDate(d.getDate() + rule.interval)) {
        out.push(atTime(d, hh, mm));
      }
      break;
    }
    case "weekly": {
      const byDay = rule.byDay?.length ? rule.byDay.map(dayToIndex).sort((a, b) => a - b) : [now.getDay()];
      let cursor = new Date(now);
      cursor.setHours(0, 0, 0, 0);
      const firstDate = shiftToNextCallingDay(cursor, byDay);
      for (let d = firstDate; d <= horizon; d.setDate(d.getDate() + rule.interval * 7)) {
        for (const dayIdx of byDay) {
          const candidate = new Date(d);
          candidate.setDate(d.getDate() + ((dayIdx - d.getDay() + 7) % 7));
          const at = atTime(candidate, hh, mm);
          if (at >= now && at <= horizon) out.push(at);
        }
      }
      break;
    }
    case "monthly": {
      const day = rule.byMonthDay ?? now.getDate();
      const mark = new Date(now.getFullYear(), now.getMonth(), 1);
      for (let d = new Date(mark); d <= horizon; d.setMonth(d.getMonth() + rule.interval)) {
        const target = new Date(d.getFullYear(), d.getMonth(), Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
        const at = atTime(target, hh, mm);
        if (at >= now && at <= horizon) out.push(at);
      }
      break;
    }
    case "yearly": {
      const mark = new Date(now.getFullYear(), now.getMonth(), 1);
      for (let d = new Date(mark); d <= horizon; d.setFullYear(d.getFullYear() + rule.interval)) {
        const at = atTime(d, hh, mm);
        if (at >= now && at <= horizon) out.push(at);
      }
      break;
    }
    case "custom": {
      // Fallback: honor only interval in days for now; full RRULE parsing is
      // a Phase 3 upgrade (rrule lib → materialize instances on the fly).
      for (let d = new Date(now); d <= horizon; d.setDate(d.getDate() + Math.max(rule.interval, 1))) {
        out.push(atTime(d, hh, mm));
      }
      break;
    }
  }
  return out;
}

function atTime(d: Date, hh: number, mm: number): Date {
  const out = new Date(d);
  out.setHours(hh, mm, 0, 0);
  return out;
}

function shiftToNextCallingDay(start: Date, byDay: number[]): Date {
  const d = new Date(start);
  const dist = Math.min(...byDay.map((b) => (b - d.getDay() + 7) % 7));
  d.setDate(d.getDate() + dist);
  return d;
}

function dayToIndex(day: string): number {
  return ["su", "mo", "tu", "we", "th", "fr", "sa"].indexOf(day.slice(0, 2).toLowerCase());
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}