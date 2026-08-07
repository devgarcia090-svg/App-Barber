export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function formatDateHuman(dateStr: string): string {
  return new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${dateStr}T00:00:00`));
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysToDateStr(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// El negocio está en Murcia; toda hora de cita se interpreta en esta zona,
// sin importar en qué huso horario esté configurado el dispositivo de quien
// reserva o del dueño (auditoría: si no se corrige, alguien con el reloj en
// otro huso puede ver/reservar una hora distinta de la que pulsa en pantalla).
const BUSINESS_TIME_ZONE = "Europe/Madrid";

/** Desfase (en minutos) entre UTC y timeZone en el instante dado. */
function timeZoneOffsetMinutes(utcGuess: Date, timeZone: string): number {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utcGuess)) {
    parts[p.type] = p.value;
  }
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  return (asUtc - utcGuess.getTime()) / 60000;
}

/** Convierte una hora de pared del negocio (fecha + minutos desde
 * medianoche, en Europe/Madrid) al instante UTC real que representa —
 * independientemente del huso horario del navegador/dispositivo. */
export function zonedWallTimeToDate(dateStr: string, minutesOfDay: number, timeZone = BUSINESS_TIME_ZONE): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minutesOfDay / 60), minutesOfDay % 60, 0));
  const offset = timeZoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60000);
}

/** Inverso de zonedWallTimeToDate: dado un instante UTC, la fecha (YYYY-MM-DD)
 * y los minutos desde medianoche que representa en Europe/Madrid — para leer
 * de vuelta la hora "de pared" de una cita ya guardada, sin importar el huso
 * horario del dispositivo que la muestra. */
export function zonedDateParts(iso: string, timeZone = BUSINESS_TIME_ZONE): { dateStr: string; minutes: number } {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso))) {
    parts[p.type] = p.value;
  }
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return { dateStr: `${parts.year}-${parts.month}-${parts.day}`, minutes: hour * 60 + Number(parts.minute) };
}

export function dayBounds(dateStr: string): { from: string; to: string } {
  return {
    from: zonedWallTimeToDate(dateStr, 0).toISOString(),
    to: zonedWallTimeToDate(dateStr, 24 * 60 - 1).toISOString(),
  };
}

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No presentado",
  COMPLETED: "Completada",
};

export const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface Slot {
  startMinute: number;
  label: string;
  available: boolean;
  busyClientName?: string;
  past?: boolean;
}

const SLOT_GRANULARITY_MINUTES = 15;

/** Builds the day's bookable grid: every SLOT_GRANULARITY_MINUTES step within
 * the staff's working hours for that day of week, wide enough to fit the
 * chosen service, marked busy if it overlaps an existing appointment. */
export function generateDaySlots(
  dateStr: string,
  serviceDurationMinutes: number,
  workingHours: { dayOfWeek: number; startMinute: number; endMinute: number }[],
  busyAppointments: { startTime: string; endTime: string; clientName?: string }[]
): Slot[] {
  const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
  const shift = workingHours.find((w) => w.dayOfWeek === dayOfWeek);
  if (!shift) return [];

  const busyRanges = busyAppointments.map((b) => ({
    start: new Date(b.startTime).getTime(),
    end: new Date(b.endTime).getTime(),
    clientName: b.clientName,
  }));

  const now = Date.now();
  const slots: Slot[] = [];
  for (let start = shift.startMinute; start + serviceDurationMinutes <= shift.endMinute; start += SLOT_GRANULARITY_MINUTES) {
    const slotStart = zonedWallTimeToDate(dateStr, start);
    const slotEnd = new Date(slotStart.getTime() + serviceDurationMinutes * 60 * 1000);

    const past = slotStart.getTime() < now;
    const overlapping = busyRanges.find((b) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start);
    slots.push({
      startMinute: start,
      label: minutesToTimeLabel(start),
      available: !overlapping && !past,
      busyClientName: overlapping?.clientName,
      past,
    });
  }
  return slots;
}
