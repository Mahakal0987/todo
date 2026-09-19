import { useAuth } from "./lib/auth";
import { Login } from "./pages/Login";
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

  if (!user) return <Login />;
  return <Dashboard />;
}