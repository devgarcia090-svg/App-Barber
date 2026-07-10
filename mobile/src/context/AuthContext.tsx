import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, loadAuthToken, setAuthToken, type Barber } from "../api";

interface AuthContextValue {
  barber: Barber | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { businessName: string; ownerName: string; email: string; password: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "barber";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [barber, setBarber] = useState<Barber | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await loadAuthToken();
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (token && stored) setBarber(JSON.parse(stored));
      setLoading(false);
    })();
  }, []);

  async function persist(token: string, barberData: Barber) {
    await setAuthToken(token);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(barberData));
    setBarber(barberData);
  }

  async function login(email: string, password: string) {
    const { token, barber: barberData } = await api.login(email, password);
    await persist(token, barberData);
  }

  async function register(data: { businessName: string; ownerName: string; email: string; password: string; phone?: string }) {
    const { token, barber: barberData } = await api.register(data);
    await persist(token, barberData);
  }

  async function logout() {
    await setAuthToken(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    setBarber(null);
  }

  return <AuthContext.Provider value={{ barber, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
