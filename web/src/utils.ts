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

export function dayBounds(dateStr: string): { from: string; to: string } {
  return {
    from: new Date(`${dateStr}T00:00:00`).toISOString(),
    to: new Date(`${dateStr}T23:59:59`).toISOString(),
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
    const slotStart = new Date(`${dateStr}T00:00:00`);
    slotStart.setMinutes(start);
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
