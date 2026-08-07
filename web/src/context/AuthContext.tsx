import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, loadCurrentBarber, type Barber } from "../api";

interface AuthContextValue {
  barber: Barber | null;
  loading: boolean;
  // Fallo de red al comprobar la sesión al arrancar (distinto de "no hay
  // sesión"): sin esto, un error de conexión se veía igual que estar
  // desconectado, sin ninguna pista de qué pasó.
  initError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [barber, setBarber] = useState<Barber | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    loadCurrentBarber()
      .then((b) => setBarber(b))
      .catch(() => setInitError("No se pudo comprobar tu sesión. Revisa tu conexión e inténtalo de nuevo."))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { barber: b } = await api.login(email, password);
    setBarber(b);
  }

  async function logout() {
    await api.logout();
    setBarber(null);
  }

  async function refresh() {
    const b = await loadCurrentBarber();
    setBarber(b);
  }

  return <AuthContext.Provider value={{ barber, loading, initError, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
