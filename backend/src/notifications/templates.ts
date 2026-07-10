import type { Appointment, Barber, Client, Service } from "@prisma/client";
import { buildPrewarning } from "../services/reliability";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatAppointmentTime(date: Date): string {
  return DATE_FORMATTER.format(date);
}

export function buildClientReminderMessage(
  appointment: Appointment,
  client: Client,
  service: Service,
  barber: Barber
): string {
  return (
    `Hola ${client.name}! Te recordamos tu cita en ${barber.businessName} ` +
    `el ${formatAppointmentTime(appointment.startTime)} para ${service.name}. ` +
    `Si no puedes venir, avísanos cuanto antes para que otro cliente pueda coger ese hueco.`
  );
}

export function buildBarberPrewarningMessage(
  appointment: Appointment,
  client: Client,
  service: Service
): string {
  const prewarning = buildPrewarning(client);
  const base = `Próxima cita: ${client.name} el ${formatAppointmentTime(appointment.startTime)} (${service.name}).`;
  if (!prewarning) return base;
  return `${base}\n${prewarning.message}`;
}

export function buildClientReminderSubject(barber: Barber): string {
  return `Recordatorio de tu cita en ${barber.businessName}`;
}

export function buildBarberPrewarningSubject(): string {
  return `Aviso: próxima cita con cliente con historial de faltas`;
}
