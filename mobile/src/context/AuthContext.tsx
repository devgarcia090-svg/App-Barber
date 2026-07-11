import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, loadAuthToken, setAuthToken, type Barber, type ClientAccount } from "../api";

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
const BARBER_KEY = "barber";
const CLIENT_KEY = "client";
const SESSION_KIND_KEY = "sessionKind";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [barber, setBarber] = useState<Barber | null>(null);
  const [client, setClient] = useState<ClientAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await loadAuthToken();
      const kind = await AsyncStorage.getItem(SESSION_KIND_KEY);
      if (token && kind === "client") {
        const stored = await AsyncStorage.getItem(CLIENT_KEY);
        if (stored) setClient(JSON.parse(stored));
      } else if (token && kind === "barber") {
        const stored = await AsyncStorage.getItem(BARBER_KEY);
        if (stored) setBarber(JSON.parse(stored));
      }
      setLoading(false);
    })();
  }, []);

  async function persistBarber(token: string, barberData: Barber) {
    await setAuthToken(token);
    await AsyncStorage.multiSet([
      [SESSION_KIND_KEY, "barber"],
      [BARBER_KEY, JSON.stringify(barberData)],
    ]);
    await AsyncStorage.removeItem(CLIENT_KEY);
    setBarber(barberData);
    setClient(null);
  }

  async function persistClient(token: string, clientData: ClientAccount) {
    await setAuthToken(token);
    await AsyncStorage.multiSet([
      [SESSION_KIND_KEY, "client"],
      [CLIENT_KEY, JSON.stringify(clientData)],
    ]);
    await AsyncStorage.removeItem(BARBER_KEY);
    setClient(clientData);
    setBarber(null);
  }

  async function login(email: string, password: string) {
    const { token, barber: barberData } = await api.login(email, password);
    await persistBarber(token, barberData);
  }

  async function register(data: { businessName: string; ownerName: string; email: string; password: string; phone?: string }) {
    const { token, barber: barberData } = await api.register(data);
    await persistBarber(token, barberData);
  }

  async function clientLogin(phone: string, password: string) {
    const { token, client: clientData } = await api.clientLogin(phone, password);
    await persistClient(token, clientData);
  }

  async function clientRegister(data: { name: string; phone: string; password: string; email?: string }) {
    const { token, client: clientData } = await api.clientRegister(data);
    await persistClient(token, clientData);
  }

  async function logout() {
    await setAuthToken(null);
    await AsyncStorage.multiRemove([SESSION_KIND_KEY, BARBER_KEY, CLIENT_KEY]);
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
