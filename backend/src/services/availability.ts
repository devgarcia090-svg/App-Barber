import { prisma } from "../lib/prisma";

const SLOT_GRANULARITY_MINUTES = 15;

export interface PublicSlot {
  startMinute: number;
  /** Staff members free at this time — lets a "any barber" booking pick one. */
  staffIds: string[];
}

export interface DayAvailability {
  slots: PublicSlot[];
  /** How many distinct start times the day offers ignoring existing bookings.
   * freeCount/totalCount gives the "how full is this day" ratio for the calendar. */
  totalCount: number;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Computes bookable slots for every day in [fromStr, toStr] (inclusive,
 * YYYY-MM-DD, server-local time). One staff+appointment fetch for the whole
 * range, then in-memory slot math per day.
 */
export async function getAvailability(opts: {
  barberId: string;
  durationMinutes: number;
  fromStr: string;
  toStr: string;
  staffId?: string;
}): Promise<Map<string, DayAvailability>> {
  const { barberId, durationMinutes, fromStr, toStr, staffId } = opts;

  const staff = await prisma.staff.findMany({
    where: { barberId, active: true, ...(staffId ? { id: staffId } : {}) },
    include: { workingHours: true },
  });

  const rangeStart = new Date(`${fromStr}T00:00:00`);
  const rangeEnd = new Date(`${toStr}T23:59:59`);

  const appointments = staff.length
    ? await prisma.appointment.findMany({
        where: {
          staffId: { in: staff.map((s) => s.id) },
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
          startTime: { lte: rangeEnd },
          endTime: { gte: rangeStart },
        },
        select: { staffId: true, startTime: true, endTime: true },
      })
    : [];

  const busyByStaff = new Map<string, { start: number; end: number }[]>();
  for (const appt of appointments) {
    const list = busyByStaff.get(appt.staffId) ?? [];
    list.push({ start: appt.startTime.getTime(), end: appt.endTime.getTime() });
    busyByStaff.set(appt.staffId, list);
  }

  const now = Date.now();
  const result = new Map<string, DayAvailability>();

  for (let day = new Date(rangeStart); day <= rangeEnd; day.setDate(day.getDate() + 1)) {
    const dateStr = toDateStr(day);
    const dayOfWeek = day.getDay();
    const slotMap = new Map<number, string[]>();
    const capacity = new Set<number>();

    for (const member of staff) {
      const shifts = member.workingHours.filter((w) => w.dayOfWeek === dayOfWeek);
      if (shifts.length === 0) continue;
      const busy = busyByStaff.get(member.id) ?? [];

      for (const shift of shifts) {
        for (let minute = shift.startMinute; minute + durationMinutes <= shift.endMinute; minute += SLOT_GRANULARITY_MINUTES) {
          const slotStart = new Date(day);
          slotStart.setHours(0, minute, 0, 0);
          const startMs = slotStart.getTime();
          const endMs = startMs + durationMinutes * 60 * 1000;

          if (startMs < now) continue;
          capacity.add(minute);
          if (busy.some((b) => startMs < b.end && endMs > b.start)) continue;

          const free = slotMap.get(minute) ?? [];
          free.push(member.id);
          slotMap.set(minute, free);
        }
      }
    }

    result.set(dateStr, {
      slots: [...slotMap.entries()].sort((a, b) => a[0] - b[0]).map(([startMinute, staffIds]) => ({ startMinute, staffIds })),
      totalCount: capacity.size,
    });
  }

  return result;
}
