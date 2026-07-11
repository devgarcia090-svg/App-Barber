export const APPOINTMENT_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "NO_SHOW",
  "COMPLETED",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const RELIABILITY_STATUSES = ["RELIABLE", "WATCH", "RISKY"] as const;
export type ReliabilityStatus = (typeof RELIABILITY_STATUSES)[number];

export const REMINDER_CHANNELS = ["EMAIL", "WHATSAPP", "SMS"] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const REMINDER_STATUSES = ["PENDING", "SENT", "FAILED", "CANCELLED"] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_KINDS = ["CLIENT_REMINDER", "BARBER_PREWARNING"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export interface AuthTokenPayload {
  barberId: string;
  email: string;
}

export interface ClientAuthTokenPayload {
  clientId: string;
  barberId: string;
}
