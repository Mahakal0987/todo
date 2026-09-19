import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, getAccessToken } from "../api";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../lib/realtime";
import { Button, Badge, Card } from "@todo/ui";
import type { TaskDTO, Priority } from "@todo/api/types";

export function Dashboard() {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [currentMonth, setCurrentMonth] = useState("");

  const applyPush = useCallback((rows: TaskDTO[], push: { table: string; op: string; row: Record<string, unknown> }) => {
    if (push.table !== "tasks") return rows;
    if (push.op === "delete") return rows.filter((t) => t.id !== (push.row.id as string));
    const incoming = push.row as unknown as TaskDTO;
    const idx = rows.findIndex((t) => t.id === incoming.id);
    if (idx === -1) return [incoming, ...rows];
    const next = [...rows];
    next[idx] = incoming;
    return next;
  }, []);

  const load = useCallback(async () => {
    const res = await api.get<{ ok: boolean; data: TaskDTO[] }>("/api/tasks", { token: getAccessToken() });
    if (res.ok) setTasks(res.data);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useRealtime({
    deviceId: "web-" + (user?.id ?? "anon").slice(0, 8),
    onSync: (push) => setTasks((rows) => applyPush(rows, push)),
  });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await api.post<{ ok: boolean; data: TaskDTO; error?: { message: string } }>(
      "/api/tasks",
      { title, dueOn: dueOn || null, type: dueOn ? "deadline" : "one_time" },
      { token: getAccessToken() },
    );
    if (res.ok) {
      setTasks((rows) => [res.data, ...rows]);
      setTitle("");
      setDueOn("");
    }
  };

  const toggle = async (task: TaskDTO) => {
    const nextStatus = task.status === "done" ? "active" : "done";
    const res = await api.patch<{ ok: boolean; data: TaskDTO }>(
      `/api/tasks/${task.id}`,
      { status: nextStatus },
      { token: getAccessToken() },
    );
    if (res.ok) setTasks((rows) => applyPush(rows, { table: "tasks", op: "upsert", row: res.data as unknown as Record<string, unknown> }));
  };

  useEffect(() => {
    if (user?.timezone) setCurrentMonth(new Date().toLocaleString("default", { month: "long" }));
  }, [user]);

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">PlanDeck</h1>
          <p className="text-sm text-zinc-500">
            {currentMonth} · {open.length} open · {done.length} done
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="indigo">{user?.email}</Badge>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </header>

      <form onSubmit={create} className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a super-detailed plan…"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
        />
        <input
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={!title.trim()}>
          Add
        </Button>
      </form>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Open plans</h2>
        <div className="flex flex-col gap-2">
          {open.map((t) => (
            <Card key={t.id} className="flex items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={false}
                onChange={() => void toggle(t)}
                className="h-4 w-4 accent-indigo-600"
                aria-label={`Mark ${t.title} as done`}
              />
              <div className="min-w-0 flex-1">
                <p className={t.status === "done" ? "line-through text-zinc-400" : "font-medium"}>{t.title}</p>
                <p className="text-xs text-zinc-400">
                  {t.type.replace("_", " ")}
                  {t.dueOn ? ` · due ${new Date(t.dueOn).toLocaleDateString()}` : ""}
                </p>
              </div>
              <Badge tone={priorityTone(t.priority)}>{t.priority.toUpperCase()}</Badge>
            </Card>
          ))}
          {open.length === 0 && <p className="py-6 text-center text-sm text-zinc-400">Nothing here — add your first plan above.</p>}
        </div>
      </section>

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Completed</h2>
          <div className="flex flex-col gap-2">
            {done.map((t) => (
              <Card key={t.id} className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked onChange={() => void toggle(t)} className="h-4 w-4 accent-indigo-600" />
                <p className="line-through text-zinc-400">{t.title}</p>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void (_ as unknown);
}

function priorityTone(p: Priority): "red" | "amber" | "zinc" | "green" {
  if (p === "p0") return "red";
  if (p === "p1" || p === "p2") return "amber";
  if (p === "p4") return "green";
  return "zinc";
}