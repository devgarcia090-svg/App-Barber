import type { Client, NotificationSettings } from "@prisma/client";
import type { ReliabilityStatus } from "../types";

/** Derives a client's reliability tier from their no-show / late-cancel history. */
export function computeReliabilityStatus(
  noShowCount: number,
  lateCancelCount: number,
  settings: Pick<NotificationSettings, "riskyThreshold" | "watchThreshold">
): ReliabilityStatus {
  const strikes = noShowCount + lateCancelCount;
  if (strikes >= settings.riskyThreshold) return "RISKY";
  if (strikes >= settings.watchThreshold) return "WATCH";
  return "RELIABLE";
}

/** Hours of notice the client gave between cancelling and the appointment start. */
export function cancelNoticeHours(cancelledAt: Date, appointmentStart: Date): number {
  const ms = appointmentStart.getTime() - cancelledAt.getTime();
  return Math.max(0, ms / (1000 * 60 * 60));
}

export function isLateCancellation(
  noticeHours: number,
  settings: Pick<NotificationSettings, "lateCancelThresholdHours">
): boolean {
  return noticeHours < settings.lateCancelThresholdHours;
}

export interface PrewarningInfo {
  status: ReliabilityStatus;
  message: string;
}

/** Human-readable heads-up the barber sees before confirming/serving a risky client. */
export function buildPrewarning(client: Pick<Client, "name" | "noShowCount" | "lateCancelCount" | "reliabilityStatus">): PrewarningInfo | null {
  const status = client.reliabilityStatus as ReliabilityStatus;
  if (status === "RELIABLE") return null;

  const strikes = client.noShowCount + client.lateCancelCount;
  const parts: string[] = [];
  if (client.noShowCount > 0) {
    parts.push(`${client.noShowCount} vez${client.noShowCount === 1 ? "" : "es"} no se ha presentado`);
  }
  if (client.lateCancelCount > 0) {
    parts.push(`${client.lateCancelCount} cancelación${client.lateCancelCount === 1 ? "" : "es"} de última hora`);
  }

  const detail = parts.join(" y ");
  const message =
    status === "RISKY"
      ? `Atención: ${client.name} tiene historial de riesgo (${strikes} incidencias: ${detail}). Considera pedir confirmación extra, señal/depósito, o reconfirmar por WhatsApp el mismo día.`
      : `Aviso: ${client.name} ${detail} anteriormente. Convendría reconfirmar la cita.`;

  return { status, message };
}
