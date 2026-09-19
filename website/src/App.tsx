import { useAuth } from "./auth/AuthContext";
import { AuthScreen } from "./pages/AuthScreen";
import { Dashboard } from "./pages/Dashboard";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="animate-pulse text-indigo-600">PlanDeck…</div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;
  return <Dashboard />;
}