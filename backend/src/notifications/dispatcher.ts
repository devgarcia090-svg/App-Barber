import { prisma } from "../lib/prisma";
import { createEmailProvider, createMessageProvider } from "./providers";
import {
  buildBarberPrewarningMessage,
  buildBarberPrewarningSubject,
  buildClientReminderMessage,
  buildClientReminderSubject,
} from "./templates";

const emailProvider = createEmailProvider();
const messageProvider = createMessageProvider();

export async function dispatchDueReminders(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
  const due = await prisma.reminder.findMany({
    where: { status: "PENDING", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
  });

  let sent = 0;
  let failed = 0;
  for (const reminder of due) {
    const ok = await dispatchReminder(reminder.id);
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}

export async function dispatchReminder(reminderId: string): Promise<boolean> {
  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!reminder || reminder.status !== "PENDING") return false;

  const appointment = await prisma.appointment.findUnique({
    where: { id: reminder.appointmentId },
    include: { client: true, service: true, barber: true },
  });

  if (!appointment) {
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { status: "FAILED", error: "Appointment no longer exists" },
    });
    return false;
  }

  if (appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") {
    await prisma.reminder.update({ where: { id: reminderId }, data: { status: "CANCELLED" } });
    return false;
  }

  const { client, service, barber } = appointment;

  try {
    if (reminder.kind === "CLIENT_REMINDER") {
      const message = buildClientReminderMessage(appointment, client, service, barber);
      await sendOnChannel(reminder.channel, client.email, client.phone, buildClientReminderSubject(barber), message);
    } else {
      const message = buildBarberPrewarningMessage(appointment, client, service);
      await sendOnChannel(reminder.channel, barber.email, barber.phone, buildBarberPrewarningSubject(), message);
    }

    await prisma.reminder.update({
      where: { id: reminderId },
      data: { status: "SENT", sentAt: new Date() },
    });
    return true;
  } catch (err) {
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) },
    });
    return false;
  }
}

async function sendOnChannel(
  channel: string,
  email: string | null,
  phone: string | null,
  subject: string,
  body: string
): Promise<void> {
  if (channel === "EMAIL") {
    if (!email) throw new Error("Recipient has no email on file");
    await emailProvider.send(email, subject, body);
    return;
  }
  if (!phone) throw new Error("Recipient has no phone on file");
  if (channel === "WHATSAPP") {
    await messageProvider.sendWhatsApp(phone, body);
    return;
  }
  if (channel === "SMS") {
    await messageProvider.sendSMS(phone, body);
    return;
  }
  throw new Error(`Unknown channel: ${channel}`);
}
