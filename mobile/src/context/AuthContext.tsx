import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, loadCurrentBarber, loadStoredClient, type Barber, type ClientAccount } from "../api";

interface AuthContextValue {
  barber: Barber | null;
  client: ClientAccount | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { businessName: string; ownerName: string; email: string; password: string; phone?: string }) => Promise<void>;
  clientLogin: (phone: string, password: string) => Promise<void>;
  clientRegister: (data: { name: string; phone: string; password: string; email?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [barber, setBarber] = useState<Barber | null>(null);
  const [client, setClient] = useState<ClientAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const b = await loadCurrentBarber();
      if (b) {
        setBarber(b);
      } else {
        const c = await loadStoredClient();
        if (c) setClient(c);
      }
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const { barber: b } = await api.login(email, password);
    setBarber(b);
    setClient(null);
  }

  async function register(data: { businessName: string; ownerName: string; email: string; password: string; phone?: string }) {
    const { barber: b } = await api.register(data);
    setBarber(b);
    setClient(null);
  }

  async function clientLogin(phone: string, password: string) {
    const { client: c } = await api.clientLogin(phone, password);
    setClient(c);
    setBarber(null);
  }

  async function clientRegister(data: { name: string; phone: string; password: string; email?: string }) {
    const { client: c } = await api.clientRegister(data);
    setClient(c);
    setBarber(null);
  }

  async function logout() {
    await api.logout();
    setBarber(null);
    setClient(null);
  }

  return (
    <AuthContext.Provider value={{ barber, client, loading, login, register, clientLogin, clientRegister, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
