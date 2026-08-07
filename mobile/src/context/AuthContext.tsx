import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, loadSession, type Barber, type ClientAccount, type Session } from "../api";

interface AuthContextValue {
  barber: Barber | null; // set when the logged-in user is an admin
  client: ClientAccount | null; // set when the logged-in user is a client
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerClient: (data: { name: string; phone: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSession()
      .then(setSession)
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    setSession(await api.login(email, password));
  }

  async function registerClient(data: { name: string; phone: string; email: string; password: string }) {
    setSession(await api.registerClient(data));
  }

  async function logout() {
    await api.logout();
    setSession(null);
  }

  const barber = session?.role === "admin" ? session.barber ?? null : null;
  const client = session?.role === "client" ? session.client ?? null : null;

  return (
    <AuthContext.Provider value={{ barber, client, loading, login, registerClient, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
