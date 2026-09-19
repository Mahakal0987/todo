import { useState, type FormEvent } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useAuth } from "@/lib/auth";
import { useRouter } from "expo-router";

type Mode = "login" | "register";

export default function IndexScreen() {
  const { login, register } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name);
      router.replace("/(app)");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>PlanDeck</Text>
        <Text style={styles.subtitle}>Super-detailed plans, everywhere</Text>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, mode === "login" && styles.tabActive]}
            onPress={() => setMode("login")}
          >
            <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === "register" && styles.tabActive]}
            onPress={() => setMode("register")}
          >
            <Text style={[styles.tabText, mode === "register" && styles.tabTextActive]}>Sign up</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCompleteType="email"
        />
        {mode === "register" && (
          <TextInput
            style={styles.input}
            placeholder="Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCompleteType="password"
        />

        {busy ? <ActivityIndicator /> : (
          <TouchableOpacity style={styles.button} onPress={submit} disabled={busy}>
            <Text style={styles.buttonText}>{mode === "login" ? "Sign in" : "Create account"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fafafa" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 24, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, elevation: 2 },
  title: { fontSize: 28, fontWeight: "700", color: "#4f46e5", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#71717a", textAlign: "center", marginBottom: 24 },
  tabBar: { flexDirection: "row", backgroundColor: "#f4f4f5", borderRadius: 8, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 6 },
  tabActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 1 },
  tabText: { textAlign: "center", fontWeight: "600", color: "#71717a" },
  tabTextActive: { color: "#4f46e5" },
  input: { borderWidth: 1, borderColor: "#d4d4d8", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12, backgroundColor: "#fff" },
  button: { backgroundColor: "#4f46e5", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});