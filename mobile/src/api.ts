import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, BUSINESS_SLUG } from "./lib/supabase";

export interface Barber {
  id: string;
  businessName: string;
  slug: string;
  ownerName: string;
  email: string;
  phone: string | null;
}

export interface ClientAccount {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export interface PublicBusiness {
  barber: { businessName: string; slug: string; phone: string | null };
  services: Service[];
  staff: { id: string; name: string; color: string }[];
}

export interface PublicSlot {
  startMinute: number;
  staffIds: string[];
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

export function buildPrewarning(c: Pick<Client, "name" | "noShowCount" | "lateCancelCount" | "reliabilityStatus">): Prewarning | null {
  if (c.reliabilityStatus === "RELIABLE") return null;
  const strikes = c.noShowCount + c.lateCancelCount;
  const parts: string[] = [];
  if (c.noShowCount > 0) parts.push(`${c.noShowCount} vez${c.noShowCount === 1 ? "" : "es"} no se ha presentado`);
  if (c.lateCancelCount > 0) parts.push(`${c.lateCancelCount} cancelación${c.lateCancelCount === 1 ? "" : "es"} de última hora`);
  const detail = parts.join(" y ");
  const message =
    c.reliabilityStatus === "RISKY"
      ? `Atención: ${c.name} tiene historial de riesgo (${strikes} incidencias: ${detail}). Considera pedir confirmación extra o reconfirmar el mismo día.`
      : `Aviso: ${c.name} ${detail} anteriormente. Convendría reconfirmar la cita.`;
  return { status: c.reliabilityStatus, message };
}

function translateBookingError(msg: string): string {
  if (msg.includes("SLOT_TAKEN")) return "Ese hueco ya está ocupado. Elige otra hora.";
  if (msg.includes("OUTSIDE_HOURS")) return "Esa hora está fuera del horario de trabajo.";
  if (msg.includes("PHONE_TAKEN")) return "Ya existe una cuenta con este teléfono. Inicia sesión.";
  if (msg.includes("BAD_CREDENTIALS")) return "Teléfono o contraseña incorrectos.";
  if (msg.includes("WEAK_PASSWORD")) return "La contraseña debe tener al menos 8 caracteres.";
  if (msg.includes("NOT_CANCELLABLE")) return "Esta cita ya no se puede cancelar.";
  return msg;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrap(res: { data: any; error: { message: string } | null }): any {
  if (res.error) throw new ApiError(400, res.error.message);
  return res.data;
}

// ---- Session state ----------------------------------------------------------
let barberId: string | null = null;
let clientToken: string | null = null;
const CLIENT_TOKEN_KEY = "clientToken";

async function loadBarber(): Promise<Barber> {
  const { data, error } = await supabase.from("Barber").select("id,businessName,slug,ownerName,email,phone").single();
  if (error || !data) throw new ApiError(404, "No hay un negocio vinculado a esta cuenta");
  barberId = data.id;
  return data as Barber;
}

export async function loadCurrentBarber(): Promise<Barber | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  try {
    return await loadBarber();
  } catch {
    return null;
  }
}

export async function loadStoredClient(): Promise<ClientAccount | null> {
  const [tok, raw] = await Promise.all([
    AsyncStorage.getItem(CLIENT_TOKEN_KEY),
    AsyncStorage.getItem("clientAccount"),
  ]);
  if (!tok || !raw) return null;
  clientToken = tok;
  return JSON.parse(raw) as ClientAccount;
}

async function setClientSession(token: string, client: ClientAccount) {
  clientToken = token;
  await AsyncStorage.multiSet([
    [CLIENT_TOKEN_KEY, token],
    ["clientAccount", JSON.stringify(client)],
  ]);
}

function requireClientToken(): string {
  if (!clientToken) throw new ApiError(401, "Sesión de cliente no iniciada");
  return clientToken;
}

export const api = {
  // ---- Owner auth ----
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new ApiError(401, "Email o contraseña incorrectos");
    await supabase.rpc("claim_business", { p_slug: BUSINESS_SLUG });
    const barber = await loadBarber();
    return { token: data.session.access_token, barber };
  },
  async register(d: { businessName: string; ownerName: string; email: string; password: string; phone?: string }) {
    const { data, error } = await supabase.auth.signUp({ email: d.email, password: d.password });
    if (error) throw new ApiError(400, error.message);
    if (!data.session) {
      const { error: e2 } = await supabase.auth.signInWithPassword({ email: d.email, password: d.password });
      if (e2) throw new ApiError(400, "Cuenta creada. Confirma tu email y vuelve a iniciar sesión.");
    }
    await supabase.rpc("claim_business", { p_slug: BUSINESS_SLUG });
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("Barber").update({ businessName: d.businessName, ownerName: d.ownerName, phone: d.phone ?? null }).eq("authUserId", u.user.id);
    }
    const barber = await loadBarber();
    const { data: s } = await supabase.auth.getSession();
    return { token: s.session?.access_token ?? "", barber };
  },
  async deleteAccount(_password?: string) {
    if (barberId) await supabase.from("Barber").delete().eq("id", barberId);
    await supabase.auth.signOut();
    barberId = null;
  },
  async logout() {
    barberId = null;
    clientToken = null;
    await AsyncStorage.multiRemove([CLIENT_TOKEN_KEY, "clientAccount"]);
    await supabase.auth.signOut();
  },

  // ---- Owner data ----
  async getServices() {
    return { services: wrap(await supabase.from("Service").select("*").order("createdAt")) as Service[] };
  },
  async createService(d: { name: string; durationMinutes: number; priceCents: number }) {
    return { service: wrap(await supabase.from("Service").insert({ ...d, barberId, active: true }).select().single()) as Service };
  },
  async getStaff() {
    const data = wrap(
      await supabase
        .from("Staff")
        .select("id,name,phone,email,color,active,workingHours:StaffWorkingHours(id,dayOfWeek,startMinute,endMinute)")
        .order("createdAt")
    ) as Staff[];
    return { staff: data.map((s) => ({ ...s, workingHours: s.workingHours ?? [] })) };
  },
  async createStaff(d: { name: string; phone?: string; email?: string; color?: string }) {
    return { staff: { ...(wrap(await supabase.from("Staff").insert({ ...d, barberId }).select().single()) as Staff), workingHours: [] } };
  },
  async updateStaff(id: string, d: Partial<{ name: string; phone: string; email: string; color: string; active: boolean }>) {
    return { staff: { ...(wrap(await supabase.from("Staff").update(d).eq("id", id).select().single()) as Staff), workingHours: [] } };
  },
  async setWorkingHours(id: string, schedule: WorkingHourRow[]) {
    const del = await supabase.from("StaffWorkingHours").delete().eq("staffId", id);
    if (del.error) throw new ApiError(400, del.error.message);
    if (schedule.length > 0) {
      const rows = schedule.map((r) => ({ staffId: id, dayOfWeek: r.dayOfWeek, startMinute: r.startMinute, endMinute: r.endMinute }));
      const ins = await supabase.from("StaffWorkingHours").insert(rows);
      if (ins.error) throw new ApiError(400, ins.error.message);
    }
    return { workingHours: schedule };
  },
  async getClients() {
    const data = wrap(await supabase.from("Client").select("*").order("name")) as Client[];
    return { clients: data.map((c) => ({ ...c, prewarning: buildPrewarning(c) })) };
  },
  async getClient(id: string) {
    const data = wrap(
      await supabase.from("Client").select("*, appointments:Appointment(*, service:Service(*), staff:Staff(*))").eq("id", id).single()
    ) as Client & { appointments: Appointment[] };
    return { client: { ...data, prewarning: buildPrewarning(data) } };
  },
  async createClient(d: { name: string; phone: string; email?: string }) {
    return { client: wrap(await supabase.from("Client").insert({ ...d, barberId }).select().single()) as Client };
  },
  async getAppointments(params?: { from?: string; to?: string; staffId?: string }) {
    let q = supabase.from("Appointment").select("*, client:Client(*), service:Service(*), staff:Staff(*)").order("startTime");
    if (params?.from) q = q.gte("startTime", params.from);
    if (params?.to) q = q.lte("startTime", params.to);
    if (params?.staffId) q = q.eq("staffId", params.staffId);
    const data = wrap(await q) as Appointment[];
    return { appointments: data.map((a) => ({ ...a, prewarning: a.client ? buildPrewarning(a.client) : null })) };
  },
  async createAppointment(d: { staffId: string; clientId: string; serviceId: string; startTime: string; notes?: string }) {
    const { data, error } = await supabase.rpc("owner_book", {
      p_staff_id: d.staffId, p_client_id: d.clientId, p_service_id: d.serviceId, p_start: d.startTime, p_notes: d.notes ?? null,
    });
    if (error) throw new ApiError(422, translateBookingError(error.message));
    return { appointment: data as Appointment, prewarning: null };
  },
  async setAppointmentStatus(id: string, status: AppointmentStatus) {
    return { appointment: wrap(await supabase.from("Appointment").update({ status }).eq("id", id).select().single()) as Appointment };
  },
  async getSettings() {
    return { settings: wrap(await supabase.from("NotificationSettings").select("*").single()) as NotificationSettings };
  },
  async updateSettings(d: Partial<NotificationSettings>) {
    return { settings: wrap(await supabase.from("NotificationSettings").update(d).eq("barberId", barberId).select().single()) as NotificationSettings };
  },

  // ---- Public (anon) ----
  async getPublicBusiness(): Promise<PublicBusiness> {
    const { data, error } = await supabase.rpc("public_business", { p_slug: BUSINESS_SLUG });
    if (error) throw new ApiError(404, "No se encontró el negocio");
    return data as PublicBusiness;
  },
  async getPublicDaySlots(serviceId: string, date: string, staffId?: string) {
    const { data, error } = await supabase.rpc("public_day_slots", {
      p_slug: BUSINESS_SLUG, p_service_id: serviceId, p_date: date, p_staff_id: staffId ?? null,
    });
    if (error) throw new ApiError(400, error.message);
    return { slots: (data as PublicSlot[]) ?? [] };
  },

  // ---- Client auth + self-service ----
  async clientRegister(d: { name: string; phone: string; password: string; email?: string }) {
    const { data, error } = await supabase.rpc("client_register", {
      p_slug: BUSINESS_SLUG, p_name: d.name, p_phone: d.phone, p_password: d.password, p_email: d.email ?? null,
    });
    if (error) throw new ApiError(400, translateBookingError(error.message));
    await setClientSession(data.token, data.client);
    return data as { token: string; client: ClientAccount };
  },
  async clientLogin(phone: string, password: string) {
    const { data, error } = await supabase.rpc("client_login", { p_slug: BUSINESS_SLUG, p_phone: phone, p_password: password });
    if (error) throw new ApiError(401, translateBookingError(error.message));
    await setClientSession(data.token, data.client);
    return data as { token: string; client: ClientAccount };
  },
  async getMyAppointments() {
    const { data, error } = await supabase.rpc("client_my_appointments", { p_token: requireClientToken() });
    if (error) throw new ApiError(401, translateBookingError(error.message));
    return { appointments: (data as Appointment[]) ?? [] };
  },
  async bookAsClient(d: { staffId: string; serviceId: string; startTime: string; notes?: string }) {
    const { data, error } = await supabase.rpc("client_book", {
      p_token: requireClientToken(), p_staff_id: d.staffId, p_service_id: d.serviceId, p_start: d.startTime, p_notes: d.notes ?? null,
    });
    if (error) throw new ApiError(422, translateBookingError(error.message));
    return { appointment: data as Appointment };
  },
  async cancelMyAppointment(id: string) {
    const { data, error } = await supabase.rpc("client_cancel", { p_token: requireClientToken(), p_appointment_id: id });
    if (error) throw new ApiError(400, translateBookingError(error.message));
    return { appointment: data as Appointment };
  },
  async registerPushToken(token: string | null) {
    const { error } = await supabase.rpc("client_set_push_token", { p_token: requireClientToken(), p_push_token: token });
    if (error) throw new ApiError(400, error.message);
  },
  async deleteClientAccount(password: string) {
    const { error } = await supabase.rpc("client_delete_account", { p_token: requireClientToken(), p_password: password });
    if (error) throw new ApiError(401, translateBookingError(error.message));
    await AsyncStorage.multiRemove([CLIENT_TOKEN_KEY, "clientAccount"]);
    clientToken = null;
  },
};
