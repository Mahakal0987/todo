import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useAuth } from "@/lib/auth";
import { api, getAccessToken } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";

interface Task {
  id: string;
  title: string;
  status: string;
  type: string;
  dueOn: string | null;
  priority: string;
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const applyPush = useCallback((rows: Task[], push: { table: string; op: string; row: Record<string, unknown> }) => {
    if (push.table !== "tasks") return rows;
    if (push.op === "delete") return rows.filter((t) => t.id !== (push.row.id as string));
    const incoming = push.row as unknown as Task;
    const idx = rows.findIndex((t) => t.id === incoming.id);
    if (idx === -1) return [incoming, ...rows];
    const next = [...rows];
    next[idx] = incoming;
    return next;
  }, []);

  const load = useCallback(async () => {
    const res = await api.get<{ ok: boolean; data: Task[] }>("/api/tasks", { token: getAccessToken() });
    if (res.ok) setTasks(res.data);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useRealtime({
    deviceId: `android-${user?.id?.slice(0, 8) ?? "anon"}`,
    onSync: (push) => setTasks((rows) => applyPush(rows, push)),
  });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await api.post<{ ok: boolean; data: Task; error?: { message: string } }>(
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

  const toggle = async (task: Task) => {
    const nextStatus = task.status === "done" ? "active" : "done";
    const res = await api.patch<{ ok: boolean; data: Task }>(
      `/api/tasks/${task.id}`,
      { status: nextStatus },
      { token: getAccessToken() },
    );
    if (res.ok) setTasks((rows) => applyPush(rows, { table: "tasks", op: "upsert", row: res.data as unknown as Record<string, unknown> }));
  };

  const renderTask = ({ item }: { item: Task }) => (
    <TouchableOpacity
      style={[
        styles.taskCard,
        item.status === "done" && styles.taskDone,
        Platform.OS === "android" && styles.androidElevation,
      ]}
      onPress={() => toggle(item)}
    >
      <View style={styles.taskLeft}>
        <View style={[styles.checkbox, item.status === "done" && styles.checkboxDone]} />
        <Text style={[
          styles.taskTitle,
          item.status === "done" && styles.taskTitleDone,
        ]}>
          {item.title}
        </Text>
      </View>
      <View style={styles.taskRight}>
        <Text style={[styles.badge, { backgroundColor: priorityColor(item.priority) }]}>
          {item.priority.toUpperCase()}
        </Text>
        {item.dueOn && <Text style={styles.dueDate}>Due: {new Date(item.dueOn).toLocaleDateString()}</Text>}
      </View>
    </TouchableOpacity>
  );

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>PlanDeck</Text>
          <Text style={styles.headerSubtitle}>
            {open.length} open · {done.length} done
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={() => void logout()}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Add a super-detailed plan…"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.input}
          placeholder="Due date (YYYY-MM-DD)"
          value={dueOn}
          onChangeText={setDueOn}
        />
        <TouchableOpacity style={styles.addBtn} onPress={create} disabled={!title.trim()}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Open plans</Text>
      </View>

      <FlatList
        data={open}
        keyExtractor={(item) => item.id}
        renderItem={renderTask}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Nothing here — add your first plan above.</Text>}
        contentContainerStyle={styles.listContent}
      />

      {done.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Completed</Text>
          </View>
          <FlatList
            data={done}
            keyExtractor={(item) => item.id}
            renderItem={renderTask}
            contentContainerStyle={styles.listContent}
          />
        </>
      )}
    </View>
  );
}

function priorityColor(p: string): string {
  if (p === "p0") return "#ef4444";
  if (p === "p1" || p === "p2") return "#f59e0b";
  if (p === "p4") return "#22c55e";
  return "#71717a";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20 },
  headerTitle: { fontSize: 24, fontWeight: "700", color: "#4f46e5" },
  headerSubtitle: { fontSize: 12, color: "#71717a", marginTop: 2 },
  logoutBtn: { padding: 8 },
  logoutText: { fontSize: 14, color: "#4f46e5", fontWeight: "600" },
  form: { paddingHorizontal: 16, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#d4d4d8", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 8, backgroundColor: "#fff" },
  addBtn: { backgroundColor: "#4f46e5", borderRadius: 8, padding: 14, alignItems: "center" },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  sectionHeader: { paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, color: "#71717a" },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  taskCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 8, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  taskDone: { opacity: 0.6 },
  androidElevation: { elevation: 2 },
  taskLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: "#d4d4d8", borderRadius: 6 },
  checkboxDone: { backgroundColor: "#4f46e5", borderColor: "#4f46e5" },
  taskTitle: { fontSize: 16, color: "#18181b", flex: 1 },
  taskTitleDone: { textDecorationLine: "line-through", color: "#71717a" },
  taskRight: { alignItems: "flex-end", gap: 4 },
  badge: { fontSize: 10, fontWeight: "700", color: "#fff", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dueDate: { fontSize: 11, color: "#71717a" },
  empty: { textAlign: "center", color: "#71717a", marginTop: 24, fontSize: 14 },
});