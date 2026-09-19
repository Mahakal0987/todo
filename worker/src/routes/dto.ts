import type { Task, Project } from "@todo/db/schema";
import type { TaskDTO, ProjectDTO } from "@todo/api/types";

export function toTaskDTO(t: Task): TaskDTO {
  return {
    id: t.id,
    projectId: t.projectId,
    parentId: t.parentId,
    repeatRuleId: t.repeatRuleId,
    templateId: t.templateId,
    type: t.type,
    title: t.title,
    descriptionMd: t.descriptionMd,
    status: t.status,
    priority: t.priority,
    progressPct: t.progressPct,
    estimatedHours: t.estimatedHours,
    actualHours: t.actualHours,
    budget: t.budget,
    startOn: t.startOn?.toISOString() ?? null,
    dueOn: t.dueOn?.toISOString() ?? null,
    startsAt: t.startsAt?.toISOString() ?? null,
    endsAt: t.endsAt?.toISOString() ?? null,
    durationMin: t.durationMin,
    snoozeUntil: t.snoozeUntil?.toISOString() ?? null,
    locationAddress: t.locationAddress,
    tags: (t.tagsJson as string[] | undefined) ?? [],
    links: (t.linksJson as string[] | undefined) ?? [],
    habitGoalPerPeriod: t.habitGoalPerPeriod,
    habitStreak: t.habitStreak,
    mood: t.mood,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    completedAt: t.completedAt?.toISOString() ?? null,
    deleted: Boolean(t.deletedAt),
  };
}

export function toProjectDTO(p: Project): ProjectDTO {
  return {
    id: p.id,
    parentId: p.parentId,
    name: p.name,
    color: p.color,
    icon: p.icon,
    archivedAt: p.archivedAt?.toISOString() ?? null,
  };
}