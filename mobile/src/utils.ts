export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function todayStr(): string {
  const d = new Date();
  return toDateStr(d);
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysToDateStr(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
}

// El negocio está en Murcia; toda hora de cita se interpreta en esta zona,
// sin importar en qué huso horario esté configurado el dispositivo de quien
// reserva (auditoría: si no se corrige, alguien con el reloj en otro huso
// puede ver/reservar una hora distinta de la que pulsa en pantalla).
const BUSINESS_TIME_ZONE = "Europe/Madrid";

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
 * independientemente del huso horario del dispositivo. */
export function zonedWallTimeToDate(dateStr: string, minutesOfDay: number, timeZone = BUSINESS_TIME_ZONE): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minutesOfDay / 60), minutesOfDay % 60, 0));
  const offset = timeZoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60000);
}

/** Inverso de zonedWallTimeToDate: fecha y minutos desde medianoche que un
 * instante UTC representa en Europe/Madrid. */
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

export function formatDateHuman(dateStr: string): string {
  return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${dateStr}T00:00:00`));
}

export interface DateStripDay {
  dateStr: string;
  dayLabel: string;
  dayNumber: number;
  isToday: boolean;
}

export function buildDateStrip(daysAhead = 21): DateStripDay[] {
  const today = new Date();
  return Array.from({ length: daysAhead }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return {
      dateStr: toDateStr(d),
      dayLabel: new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(d).replace(".", ""),
      dayNumber: d.getDate(),
      isToday: i === 0,
    };
  });
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
}

const SLOT_GRANULARITY_MINUTES = 15;

export function generateDaySlots(
  dateStr: string,
  serviceDurationMinutes: number,
  workingHours: { dayOfWeek: number; startMinute: number; endMinute: number }[],
  busyAppointments: { startTime: string; endTime: string; clientName?: string }[]
): Slot[] {
  const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
  const shifts = workingHours.filter((w) => w.dayOfWeek === dayOfWeek);
  if (shifts.length === 0) return [];

  const busyRanges = busyAppointments.map((b) => ({
    start: new Date(b.startTime).getTime(),
    end: new Date(b.endTime).getTime(),
    clientName: b.clientName,
  }));

  const slots: Slot[] = [];
  for (const shift of shifts) {
    for (let start = shift.startMinute; start + serviceDurationMinutes <= shift.endMinute; start += SLOT_GRANULARITY_MINUTES) {
      const slotStart = zonedWallTimeToDate(dateStr, start);
      const slotEnd = new Date(slotStart.getTime() + serviceDurationMinutes * 60 * 1000);

      const overlapping = busyRanges.find((b) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start);
      slots.push({
        startMinute: start,
        label: minutesToTimeLabel(start),
        available: !overlapping,
        busyClientName: overlapping?.clientName,
      });
    }
  }
  return slots;
}
