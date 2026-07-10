import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { APPOINTMENT_STATUSES } from "../types";
import {
  createAppointment,
  OutsideWorkingHoursError,
  rescheduleAppointment,
  setAppointmentStatus,
  SlotUnavailableError,
} from "../services/appointments";
import { buildPrewarning } from "../services/reliability";

export const appointmentsRouter = Router();
appointmentsRouter.use(requireAuth);

appointmentsRouter.get("/", async (req, res) => {
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  const staffId = typeof req.query.staffId === "string" ? req.query.staffId : undefined;

  const appointments = await prisma.appointment.findMany({
    where: {
      barberId: req.barberId!,
      ...(staffId ? { staffId } : {}),
      ...(from || to
        ? { startTime: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    include: { client: true, service: true, staff: true },
    orderBy: { startTime: "asc" },
  });

  res.json({
    appointments: appointments.map((a) => ({ ...a, prewarning: buildPrewarning(a.client) })),
  });
});

appointmentsRouter.get("/:id", async (req, res) => {
  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.id, barberId: req.barberId! },
    include: { client: true, service: true, staff: true, reminders: true },
  });
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.json({ appointment: { ...appointment, prewarning: buildPrewarning(appointment.client) } });
});

const createSchema = z.object({
  staffId: z.string().min(1),
  clientId: z.string().min(1),
  serviceId: z.string().min(1),
  startTime: z.string().datetime(),
  notes: z.string().optional(),
});

appointmentsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { staffId, clientId, serviceId, startTime, notes } = parsed.data;

  const [staff, client, service] = await Promise.all([
    prisma.staff.findFirst({ where: { id: staffId, barberId: req.barberId! } }),
    prisma.client.findFirst({ where: { id: clientId, barberId: req.barberId! } }),
    prisma.service.findFirst({ where: { id: serviceId, barberId: req.barberId! } }),
  ]);
  if (!staff) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + service.durationMinutes * 60 * 1000);

  try {
    const appointment = await createAppointment({
      barberId: req.barberId!,
      staffId,
      clientId,
      serviceId,
      startTime: start,
      endTime: end,
      notes,
    });
    res.status(201).json({ appointment, prewarning: buildPrewarning(client) });
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof OutsideWorkingHoursError) {
      res.status(422).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const statusSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
});

appointmentsRouter.patch("/:id/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.appointment.findFirst({ where: { id: req.params.id, barberId: req.barberId! } });
  if (!existing) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  const appointment = await setAppointmentStatus(existing.id, parsed.data.status);
  res.json({ appointment });
});

const rescheduleSchema = z.object({ startTime: z.string().datetime() });

appointmentsRouter.patch("/:id/reschedule", async (req, res) => {
  const parsed = rescheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.appointment.findFirst({ where: { id: req.params.id, barberId: req.barberId! } });
  if (!existing) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  try {
    const appointment = await rescheduleAppointment(existing.id, new Date(parsed.data.startTime));
    res.json({ appointment });
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof OutsideWorkingHoursError) {
      res.status(422).json({ error: err.message });
      return;
    }
    throw err;
  }
});
