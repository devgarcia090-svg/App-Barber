import { supabase, BUSINESS_SLUG } from "./lib/supabase";

export interface Barber {
  id: string;
  businessName: string;
  slug: string;
  ownerName: string;
  email: string;
  phone: string | null;
  bio?: string | null;
  address?: string | null;
  instagram?: string | null;
  photoUrl?: string | null;
  loyaltyEnabled?: boolean;
  loyaltyThreshold?: number;
  loyaltyReward?: string | null;
}

export interface OwnerStats {
  from: string;
  to: string;
  totals: {
    revenueCents: number;
    completed: number;
    noShow: number;
    cancelled: number;
    upcoming: number;
    total: number;
  };
  byDay: { date: string; revenueCents: number; completed: number }[];
  byStaff: { staffId: string; name: string; color: string; revenueCents: number; completed: number }[];
  topServices: { serviceId: string; name: string; revenueCents: number; completed: number }[];
}

export interface Invoice {
  id: string;
  date: string;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  staffName: string;
  priceCents: number;
}

export interface LoyaltyClient {
  id: string;
  name: string;
  phone: string;
  completedCount: number;
  rewardsEarned: number;
  progress: number;
  toNext: number;
}

export interface LoyaltyOverview {
  threshold: number;
  clients: LoyaltyClient[];
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

// ---- Reliability pre-warning (ported from the old backend) ------------------
export function buildPrewarning(c: Pick<Client, "name" | "noShowCount" | "lateCancelCount" | "reliabilityStatus">): Prewarning | null {
  if (c.reliabilityStatus === "RELIABLE") return null;
  const strikes = c.noShowCount + c.lateCancelCount;
  const parts: string[] = [];
  if (c.noShowCount > 0) parts.push(`${c.noShowCount} vez${c.noShowCount === 1 ? "" : "es"} no se ha presentado`);
  if (c.lateCancelCount > 0) parts.push(`${c.lateCancelCount} cancelación${c.lateCancelCount === 1 ? "" : "es"} de última hora`);
  const detail = parts.join(" y ");
  const message =
    c.reliabilityStatus === "RISKY"
      ? `Atención: ${c.name} tiene historial de riesgo (${strikes} incidencias: ${detail}). Considera pedir confirmación extra, señal/depósito, o reconfirmar por WhatsApp el mismo día.`
      : `Aviso: ${c.name} ${detail} anteriormente. Convendría reconfirmar la cita.`;
  return { status: c.reliabilityStatus, message };
}

// ---- Session / current business --------------------------------------------
let barberId: string | null = null;

async function role(): Promise<{ role: "admin" | "client" | null; profile?: Barber }> {
  const { data, error } = await supabase.rpc("me");
  if (error || !data) return { role: null };
  if (data.role === "admin") barberId = data.profile.id;
  return { role: data.role, profile: data.role === "admin" ? (data.profile as Barber) : undefined };
}

export async function loadCurrentBarber(): Promise<Barber | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const r = await role();
  return r.role === "admin" ? r.profile ?? null : null;
}

// supabase-js is untyped here (no generated Database types), so results come
// back loosely typed; wrap centralises error handling and hands back the row.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrap(res: { data: any; error: { message: string } | null }): any {
  if (res.error) throw new ApiError(400, res.error.message);
  return res.data;
}

export const api = {
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new ApiError(401, "Email o contraseña incorrectos");
    let r = await role();
    if (r.role === "client") {
      await supabase.auth.signOut();
      throw new ApiError(403, "Esta cuenta es de cliente. Reserva desde la app o la página de reservas.");
    }
    // First-ever owner login: link this Supabase user to the (unclaimed) business.
    if (r.role === null) {
      await supabase.rpc("claim_business", { p_slug: BUSINESS_SLUG });
      r = await role();
    }
    if (r.role !== "admin" || !r.profile) {
      await supabase.auth.signOut();
      throw new ApiError(403, "Esta cuenta no está vinculada a ningún negocio.");
    }
    return { token: data.session.access_token, barber: r.profile };
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
      await supabase
        .from("Barber")
        .update({ businessName: d.businessName, ownerName: d.ownerName, phone: d.phone ?? null })
        .eq("authUserId", u.user.id);
    }
    const r = await role();
    if (r.role !== "admin" || !r.profile) throw new ApiError(400, "No se pudo vincular el negocio");
    const { data: s } = await supabase.auth.getSession();
    return { token: s.session?.access_token ?? "", barber: r.profile };
  },

  async logout() {
    barberId = null;
    await supabase.auth.signOut();
  },

  async deleteAccount(_password?: string) {
    if (barberId) await supabase.from("Barber").delete().eq("id", barberId);
    await supabase.auth.signOut();
    barberId = null;
  },

  // ---- Services ----
  async getServices() {
    const data = wrap(await supabase.from("Service").select("*").order("createdAt"));
    return { services: data as Service[] };
  },
  async createService(d: { name: string; durationMinutes: number; priceCents: number }) {
    const data = wrap(await supabase.from("Service").insert({ ...d, barberId, active: true }).select().single());
    return { service: data as Service };
  },
  async updateService(id: string, d: Partial<{ name: string; durationMinutes: number; priceCents: number; active: boolean }>) {
    const data = wrap(await supabase.from("Service").update(d).eq("id", id).select().single());
    return { service: data as Service };
  },
  async deleteService(id: string) {
    wrap(await supabase.from("Service").delete().eq("id", id).select().maybeSingle());
  },

  // ---- Staff ----
  async getStaff() {
    const data = wrap(
      await supabase
        .from("Staff")
        .select("id,name,phone,email,color,active,workingHours:StaffWorkingHours(id,dayOfWeek,startMinute,endMinute)")
        .order("createdAt")
    );
    return { staff: (data as Staff[]).map((s) => ({ ...s, workingHours: s.workingHours ?? [] })) };
  },
  async createStaff(d: { name: string; phone?: string; email?: string; color?: string }) {
    const data = wrap(await supabase.from("Staff").insert({ ...d, barberId }).select().single());
    return { staff: { ...(data as Staff), workingHours: [] } };
  },
  async updateStaff(id: string, d: Partial<{ name: string; phone: string; email: string; color: string; active: boolean }>) {
    const data = wrap(await supabase.from("Staff").update(d).eq("id", id).select().single());
    return { staff: { ...(data as Staff), workingHours: [] } };
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

  // ---- Clients ----
  async getClients() {
    const data = wrap(await supabase.from("Client").select("*").order("name")) as Client[];
    return { clients: data.map((c) => ({ ...c, prewarning: buildPrewarning(c) })) };
  },
  async getClient(id: string) {
    const data = wrap(
      await supabase
        .from("Client")
        .select("*, appointments:Appointment(*, service:Service(*), staff:Staff(*))")
        .eq("id", id)
        .single()
    ) as Client & { appointments: Appointment[] };
    return { client: { ...data, prewarning: buildPrewarning(data) } };
  },
  async createClient(d: { name: string; phone: string; email?: string }) {
    const data = wrap(await supabase.from("Client").insert({ ...d, barberId }).select().single());
    return { client: data as Client };
  },

  // ---- Appointments ----
  async getAppointments(params?: { from?: string; to?: string; staffId?: string }) {
    let q = supabase
      .from("Appointment")
      .select("*, client:Client(*), service:Service(*), staff:Staff(*)")
      .order("startTime");
    if (params?.from) q = q.gte("startTime", params.from);
    if (params?.to) q = q.lte("startTime", params.to);
    if (params?.staffId) q = q.eq("staffId", params.staffId);
    const data = wrap(await q) as Appointment[];
    return { appointments: data.map((a) => ({ ...a, prewarning: a.client ? buildPrewarning(a.client) : null })) };
  },
  async createAppointment(d: { staffId: string; clientId: string; serviceId: string; startTime: string; notes?: string }) {
    const { data, error } = await supabase.rpc("owner_book", {
      p_staff_id: d.staffId,
      p_client_id: d.clientId,
      p_service_id: d.serviceId,
      p_start: d.startTime,
      p_notes: d.notes ?? null,
    });
    if (error) throw new ApiError(422, translateBookingError(error.message));
    return { appointment: data as Appointment, prewarning: null };
  },
  async setAppointmentStatus(id: string, status: AppointmentStatus) {
    const data = wrap(await supabase.from("Appointment").update({ status }).eq("id", id).select().single());
    return { appointment: data as Appointment };
  },

  // ---- Settings ----
  async getSettings() {
    const data = wrap(await supabase.from("NotificationSettings").select("*").single());
    return { settings: data as NotificationSettings };
  },
  async updateSettings(d: Partial<NotificationSettings>) {
    const data = wrap(await supabase.from("NotificationSettings").update(d).eq("barberId", barberId).select().single());
    return { settings: data as NotificationSettings };
  },

  // ---- Public booking (anon) ----
  async publicGetBusiness(slug: string) {
    const { data, error } = await supabase.rpc("public_business", { p_slug: slug });
    if (error) throw new ApiError(404, "No se encontró el negocio");
    return data as {
      barber: {
        businessName: string;
        slug: string;
        phone: string | null;
        address: string | null;
        bio: string | null;
        instagram: string | null;
        loyaltyEnabled: boolean;
        loyaltyThreshold: number;
        loyaltyReward: string | null;
      };
      services: Service[];
      staff: { id: string; name: string; color: string }[];
    };
  },
  async publicGetAvailability(slug: string, p: { serviceId: string; from: string; to: string; staffId?: string }) {
    const { data, error } = await supabase.rpc("public_availability", {
      p_slug: slug, p_service_id: p.serviceId, p_from: p.from, p_to: p.to, p_staff_id: p.staffId ?? null,
    });
    if (error) throw new ApiError(400, error.message);
    return { days: (data as { date: string; freeCount: number; totalCount: number }[]) ?? [] };
  },
  async publicGetDaySlots(slug: string, p: { serviceId: string; date: string; staffId?: string }) {
    const { data, error } = await supabase.rpc("public_day_slots", {
      p_slug: slug, p_service_id: p.serviceId, p_date: p.date, p_staff_id: p.staffId ?? null,
    });
    if (error) throw new ApiError(400, error.message);
    return { slots: (data as { startMinute: number; staffIds: string[] }[]) ?? [] };
  },
  async publicBook(slug: string, d: { staffId: string; serviceId: string; startTime: string; clientName: string; clientPhone: string; clientEmail?: string; notes?: string }) {
    const { data, error } = await supabase.rpc("public_book", {
      p_slug: slug, p_staff_id: d.staffId, p_service_id: d.serviceId, p_start: d.startTime,
      p_client_name: d.clientName, p_client_phone: d.clientPhone, p_client_email: d.clientEmail ?? null, p_notes: d.notes ?? null,
    });
    if (error) throw new ApiError(422, translateBookingError(error.message));
    return { appointment: data as Appointment };
  },

  // ---- Facturación + estadísticas (owner) ----
  async getStats(from: string, to: string) {
    const { data, error } = await supabase.rpc("owner_stats", { p_from: from, p_to: to });
    if (error) throw new ApiError(400, error.message);
    return data as OwnerStats;
  },
  async getInvoices(from: string, to: string) {
    const { data, error } = await supabase.rpc("owner_invoices", { p_from: from, p_to: to });
    if (error) throw new ApiError(400, error.message);
    return (data as Invoice[]) ?? [];
  },

  // ---- Fidelización + perfil (owner) ----
  async getLoyalty() {
    const { data, error } = await supabase.rpc("owner_loyalty");
    if (error) throw new ApiError(400, error.message);
    return data as LoyaltyOverview;
  },
  async updateProfile(d: Partial<Pick<Barber, "businessName" | "phone" | "bio" | "address" | "instagram" | "photoUrl" | "loyaltyEnabled" | "loyaltyThreshold" | "loyaltyReward">>) {
    const data = wrap(await supabase.from("Barber").update(d).eq("id", barberId).select().single());
    return data as Barber;
  },
};

function translateBookingError(msg: string): string {
  if (msg.includes("SLOT_TAKEN")) return "Ese hueco ya está ocupado. Elige otra hora.";
  if (msg.includes("OUTSIDE_HOURS")) return "Esa hora está fuera del horario de trabajo.";
  if (msg.includes("SERVICE_NOT_FOUND")) return "Servicio no encontrado.";
  if (msg.includes("STAFF_NOT_FOUND")) return "Barbero no encontrado.";
  return msg;
}
