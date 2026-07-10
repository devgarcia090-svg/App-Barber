import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Barber, getAuthToken, setAuthToken } from "../api";

interface AuthContextValue {
  barber: Barber | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { businessName: string; ownerName: string; email: string; password: string; phone?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "barber";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [barber, setBarber] = useState<Barber | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && getAuthToken()) {
      setBarber(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  function persist(token: string, barberData: Barber) {
    setAuthToken(token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(barberData));
    setBarber(barberData);
  }

  async function login(email: string, password: string) {
    const { token, barber: barberData } = await api.login(email, password);
    persist(token, barberData);
  }

  async function register(data: { businessName: string; ownerName: string; email: string; password: string; phone?: string }) {
    const { token, barber: barberData } = await api.register(data);
    persist(token, barberData);
  }

  function logout() {
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
    setBarber(null);
  }

  return <AuthContext.Provider value={{ barber, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
