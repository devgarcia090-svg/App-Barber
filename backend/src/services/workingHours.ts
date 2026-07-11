export interface WorkingHoursRow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Whether [start, end) falls entirely within one of the staff's configured
 * shifts for that day of week (a day may have several, e.g. a split
 * morning/afternoon schedule). Shifts spanning midnight aren't supported. */
export function isWithinWorkingHours(schedule: WorkingHoursRow[], start: Date, end: Date): boolean {
  if (start.toDateString() !== end.toDateString()) return false;

  const dayOfWeek = start.getDay();
  const startMinute = minutesSinceMidnight(start);
  const endMinute = minutesSinceMidnight(end);

  return schedule.some(
    (shift) => shift.dayOfWeek === dayOfWeek && startMinute >= shift.startMinute && endMinute <= shift.endMinute
  );
}
