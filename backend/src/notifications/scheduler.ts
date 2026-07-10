import { prisma, type Prisma } from "../lib/prisma";
import type { ReminderChannel } from "../types";

function parseHoursBefore(csv: string): number[] {
  return csv
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function enabledChannels(settings: {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
}): ReminderChannel[] {
  const channels: ReminderChannel[] = [];
  if (settings.emailEnabled) channels.push("EMAIL");
  if (settings.whatsappEnabled) channels.push("WHATSAPP");
  if (settings.smsEnabled) channels.push("SMS");
  return channels;
}

/**
 * (Re)schedules every reminder for an appointment: the client reminders at
 * each configured hours-before offset, plus a barber pre-warning if the
 * client isn't RELIABLE. Safe to call again on reschedule — pending
 * reminders from a previous schedule are cancelled first.
 */
export async function scheduleRemindersForAppointment(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { client: true, barber: { include: { notificationSettings: true } } },
  });

  await prisma.reminder.updateMany({
    where: { appointmentId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  if (appointment.status !== "CONFIRMED" && appointment.status !== "PENDING") return;

  const settings = appointment.barber.notificationSettings;
  if (!settings) return;

  const now = new Date();
  const hoursBefore = parseHoursBefore(settings.reminderHoursBefore);
  const channels = enabledChannels(settings);

  const clientReminders: Prisma.ReminderCreateManyInput[] = hoursBefore.flatMap((hours) => {
    const scheduledFor = new Date(appointment.startTime.getTime() - hours * 60 * 60 * 1000);
    if (scheduledFor <= now) return [];
    return channels.map((channel) => ({
      appointmentId,
      kind: "CLIENT_REMINDER",
      channel,
      scheduledFor,
      status: "PENDING",
    }));
  });

  const prewarnings: Prisma.ReminderCreateManyInput[] =
    settings.barberPrewarningEnabled && appointment.client.reliabilityStatus !== "RELIABLE"
      ? parseHoursBefore(settings.barberPrewarningHoursBefore).flatMap((hours) => {
          const scheduledFor = new Date(appointment.startTime.getTime() - hours * 60 * 60 * 1000);
          if (scheduledFor <= now) return [];
          return channels.map((channel) => ({
            appointmentId,
            kind: "BARBER_PREWARNING",
            channel,
            scheduledFor,
            status: "PENDING",
          }));
        })
      : [];

  const toCreate = [...clientReminders, ...prewarnings];
  if (toCreate.length > 0) {
    await prisma.reminder.createMany({ data: toCreate });
  }
}
