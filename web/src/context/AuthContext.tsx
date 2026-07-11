import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, loadCurrentBarber, type Barber } from "../api";

interface AuthContextValue {
  barber: Barber | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { businessName: string; ownerName: string; email: string; password: string; phone?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [barber, setBarber] = useState<Barber | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrentBarber()
      .then((b) => setBarber(b))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { barber: b } = await api.login(email, password);
    setBarber(b);
  }

  async function register(data: { businessName: string; ownerName: string; email: string; password: string; phone?: string }) {
    const { barber: b } = await api.register(data);
    setBarber(b);
  }

  async function logout() {
    await api.logout();
    setBarber(null);
  }

  return <AuthContext.Provider value={{ barber, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
