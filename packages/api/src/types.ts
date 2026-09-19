export type TaskType =
  | "one_time"
  | "deadline"
  | "time_blocked"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "recurring"
  | "habit"
  | "milestone"
  | "waiting"
  | "shopping"
  | "reference"
  | "template";

export type TaskStatus = "planned" | "active" | "waiting" | "done" | "cancelled" | "archived";
export type Priority = "p0" | "p1" | "p2" | "p3" | "p4";

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  timezone: string;
}

export interface ProjectDTO {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  icon: string;
  archivedAt: string | null;
}

export interface RepeatRuleDTO {
  id: string;
  kind: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  rrule: string | null;
  interval: number;
  byDay: string[];
  byMonthDay: number | null;
  endOn: string | null;
  generateAheadDays: number;
  timeOfDay: string | null;
}

export interface TaskDTO {
  id: string;
  projectId: string | null;
  parentId: string | null;
  repeatRuleId: string | null;
  templateId: string | null;
  type: TaskType;
  title: string;
  descriptionMd: string;
  status: TaskStatus;
  priority: Priority;
  progressPct: number;
  estimatedHours: number | null;
  actualHours: number;
  budget: number | null;
  startOn: string | null;
  dueOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  durationMin: number | null;
  snoozeUntil: string | null;
  locationAddress: string | null;
  tags: string[];
  links: string[];
  habitGoalPerPeriod: number | null;
  habitStreak: number;
  mood: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deleted: boolean;
}

export interface StepDTO {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  sortOrder: number;
}

export interface DependencyDTO {
  id: string;
  taskId: string;
  dependsOnId: string;
  kind: "blocks" | "relates" | "duplicates";
}

export interface AttachmentDTO {
  id: string;
  taskId: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
}

export interface CommentDTO {
  id: string;
  taskId: string;
  authorId: string | null;
  contentMd: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityDTO {
  id: string;
  taskId: string | null;
  action: string;
  field: string | null;
  oldVal: unknown;
  newVal: unknown;
  at: string;
}

/** Generic API envelope */
export interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/** Push item on a sync WebSocket */
export interface SyncPush {
  op: "upsert" | "delete";
  table: string;
  row: Record<string, unknown>;
  version: number;
}

/** Pull response (delta sync) */
export interface SyncPull {
  cursor: string;
  items: SyncPush[];
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthResponse extends Envelope<AuthTokens | UserDTO> {}

export interface InboxCreate {
  title: string;
  raw?: string; // natural-language input
}

export interface ApiError {
  code: string;
  message: string;
}