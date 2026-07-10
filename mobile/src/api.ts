import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "./config";

export interface Barber {
  id: string;
  businessName: string;
  slug: string;
  ownerName: string;
  email: string;
  phone: string | null;
}

export type ReliabilityStatus = "RELIABLE" | "WATCH" | "RISKY";
export type AppointmentStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "COMPLETED";

export interface Prewarning {
  status: ReliabilityStatus;
  message: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  totalAppointments: number;
  completedCount: number;
  noShowCount: number;
  lateCancelCount: number;
  reliabilityStatus: ReliabilityStatus;
  prewarning?: Prewarning | null;
}

export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
}

export interface WorkingHourRow {
  id?: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface Staff {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  color: string;
  active: boolean;
  workingHours: WorkingHourRow[];
}

export interface Appointment {
  id: string;
  staffId: string;
  clientId: string;
  serviceId: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  notes: string | null;
  client: Client;
  service: Service;
  staff?: Staff;
  prewarning?: Prewarning | null;
}

export interface NotificationSettings {
  reminderHoursBefore: string;
  lateCancelThresholdHours: number;
  riskyThreshold: number;
  watchThreshold: number;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  barberPrewarningEnabled: boolean;
  barberPrewarningHoursBefore: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let authToken: string | null = null;

export async function loadAuthToken(): Promise<string | null> {
  authToken = await AsyncStorage.getItem("token");
  return authToken;
}

export async function setAuthToken(token: string | null): Promise<void> {
  authToken = token;
  if (token) await AsyncStorage.setItem("token", token);
  else await AsyncStorage.removeItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const body = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.error ? (typeof body.error === "string" ? body.error : JSON.stringify(body.error)) : res.statusText;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; barber: Barber }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  register: (data: { businessName: string; ownerName: string; email: string; password: string; phone?: string }) =>
    request<{ token: string; barber: Barber }>("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),

  getServices: () => request<{ services: Service[] }>("/api/services"),
  createService: (data: { name: string; durationMinutes: number; priceCents: number }) =>
    request<{ service: Service }>("/api/services", { method: "POST", body: JSON.stringify(data) }),

  getStaff: () => request<{ staff: Staff[] }>("/api/staff"),
  createStaff: (data: { name: string; phone?: string; email?: string; color?: string }) =>
    request<{ staff: Staff }>("/api/staff", { method: "POST", body: JSON.stringify(data) }),
  updateStaff: (id: string, data: Partial<{ name: string; phone: string; email: string; color: string; active: boolean }>) =>
    request<{ staff: Staff }>(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  setWorkingHours: (id: string, schedule: WorkingHourRow[]) =>
    request<{ workingHours: WorkingHourRow[] }>(`/api/staff/${id}/working-hours`, {
      method: "PUT",
      body: JSON.stringify({ schedule }),
    }),

  getClients: () => request<{ clients: Client[] }>("/api/clients"),
  getClient: (id: string) => request<{ client: Client & { appointments: Appointment[] } }>(`/api/clients/${id}`),
  createClient: (data: { name: string; phone: string; email?: string }) =>
    request<{ client: Client }>("/api/clients", { method: "POST", body: JSON.stringify(data) }),

  getAppointments: (params?: { from?: string; to?: string; staffId?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ appointments: Appointment[] }>(`/api/appointments${qs ? `?${qs}` : ""}`);
  },
  createAppointment: (data: { staffId: string; clientId: string; serviceId: string; startTime: string; notes?: string }) =>
    request<{ appointment: Appointment; prewarning: Prewarning | null }>("/api/appointments", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  setAppointmentStatus: (id: string, status: AppointmentStatus) =>
    request<{ appointment: Appointment }>(`/api/appointments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  getSettings: () => request<{ settings: NotificationSettings }>("/api/settings"),
  updateSettings: (data: Partial<NotificationSettings>) =>
    request<{ settings: NotificationSettings }>("/api/settings", { method: "PATCH", body: JSON.stringify(data) }),
};
