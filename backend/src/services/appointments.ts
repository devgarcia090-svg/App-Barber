import { prisma } from "../lib/prisma";
import { cancelNoticeHours, computeReliabilityStatus, isLateCancellation } from "./reliability";
import { isWithinWorkingHours } from "./workingHours";
import { scheduleRemindersForAppointment } from "../notifications/scheduler";
import type { AppointmentStatus } from "../types";

async function getOrCreateSettings(barberId: string) {
  return prisma.notificationSettings.upsert({
    where: { barberId },
    update: {},
    create: { barberId },
  });
}

async function recomputeClientReliability(clientId: string): Promise<void> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const settings = await getOrCreateSettings(client.barberId);
  const reliabilityStatus = computeReliabilityStatus(client.noShowCount, client.lateCancelCount, settings);
  if (reliabilityStatus !== client.reliabilityStatus) {
    await prisma.client.update({ where: { id: clientId }, data: { reliabilityStatus } });
  }
}

export class SlotUnavailableError extends Error {
  constructor() {
    super("That time slot overlaps with another appointment");
  }
}

async function assertSlotAvailable(staffId: string, startTime: Date, endTime: Date, excludeAppointmentId?: string) {
  const overlapping = await prisma.appointment.findFirst({
    where: {
      staffId,
      id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });
  if (overlapping) throw new SlotUnavailableError();
}

export class OutsideWorkingHoursError extends Error {
  constructor() {
    super("That time falls outside the staff member's working hours");
  }
}

async function assertWithinWorkingHours(staffId: string, startTime: Date, endTime: Date) {
  const schedule = await prisma.staffWorkingHours.findMany({ where: { staffId } });
  if (!isWithinWorkingHours(schedule, startTime, endTime)) {
    throw new OutsideWorkingHoursError();
  }
}

/** Creates an appointment and schedules its reminders. */
export async function createAppointment(input: {
  barberId: string;
  staffId: string;
  clientId: string;
  serviceId: string;
  startTime: Date;
  endTime: Date;
  notes?: string;
}) {
  await assertWithinWorkingHours(input.staffId, input.startTime, input.endTime);
  await assertSlotAvailable(input.staffId, input.startTime, input.endTime);

  const appointment = await prisma.$transaction(async (tx) => {
    const created = await tx.appointment.create({ data: { ...input, status: "PENDING" } });
    await tx.client.update({
      where: { id: input.clientId },
      data: { totalAppointments: { increment: 1 } },
    });
    return created;
  });

  await getOrCreateSettings(input.barberId);
  await scheduleRemindersForAppointment(appointment.id);
  return appointment;
}

/** Transitions an appointment's status, applying reliability side-effects
 * (late-cancel / no-show counters) and rescheduling reminders as needed. */
export async function setAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
  at: Date = new Date()
) {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { client: true, barber: { include: { notificationSettings: true } } },
  });

  const settings = appointment.barber.notificationSettings ?? (await getOrCreateSettings(appointment.barberId));

  const updateData: Record<string, unknown> = { status };

  if (status === "CANCELLED") {
    const noticeHours = cancelNoticeHours(at, appointment.startTime);
    updateData.cancelledAt = at;
    updateData.cancelNoticeHours = noticeHours;

    if (isLateCancellation(noticeHours, settings)) {
      await prisma.client.update({
        where: { id: appointment.clientId },
        data: { lateCancelCount: { increment: 1 } },
      });
    }
  }

  if (status === "NO_SHOW") {
    await prisma.client.update({
      where: { id: appointment.clientId },
      data: { noShowCount: { increment: 1 } },
    });
  }

  if (status === "COMPLETED") {
    await prisma.client.update({
      where: { id: appointment.clientId },
      data: { completedCount: { increment: 1 } },
    });
  }

  const updated = await prisma.appointment.update({ where: { id: appointmentId }, data: updateData });

  if (status === "CANCELLED" || status === "NO_SHOW") {
    await recomputeClientReliability(appointment.clientId);
  }

  await scheduleRemindersForAppointment(appointmentId);

  return updated;
}

export async function rescheduleAppointment(appointmentId: string, startTime: Date) {
  const existing = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { service: true },
  });
  const endTime = new Date(startTime.getTime() + existing.service.durationMinutes * 60 * 1000);
  await assertWithinWorkingHours(existing.staffId, startTime, endTime);
  await assertSlotAvailable(existing.staffId, startTime, endTime, appointmentId);

  const appointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { startTime, endTime },
  });
  await scheduleRemindersForAppointment(appointmentId);
  return appointment;
}
