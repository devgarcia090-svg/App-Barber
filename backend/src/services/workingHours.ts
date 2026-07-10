export interface WorkingHoursRow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Whether [start, end) falls entirely within one of the staff's configured
 * shifts for that day of week. Shifts spanning midnight aren't supported. */
export function isWithinWorkingHours(schedule: WorkingHoursRow[], start: Date, end: Date): boolean {
  if (start.toDateString() !== end.toDateString()) return false;

  const dayOfWeek = start.getDay();
  const shift = schedule.find((row) => row.dayOfWeek === dayOfWeek);
  if (!shift) return false;

  const startMinute = minutesSinceMidnight(start);
  const endMinute = minutesSinceMidnight(end);
  return startMinute >= shift.startMinute && endMinute <= shift.endMinute;
}
