import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireClientAuth } from "../middleware/auth";
import { toPublicClient } from "./public";
import { createAppointment, OutsideWorkingHoursError, SlotUnavailableError, setAppointmentStatus } from "../services/appointments";

export const clientRouter = Router();
clientRouter.use(requireClientAuth);

clientRouter.get("/me", async (req, res) => {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: req.clientId! } });
  res.json({ client: toPublicClient(client) });
});

const pushTokenSchema = z.object({ token: z.string().min(1).nullable() });

clientRouter.patch("/push-token", async (req, res) => {
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await prisma.client.update({ where: { id: req.clientId! }, data: { pushToken: parsed.data.token } });
  res.status(204).send();
});

clientRouter.get("/appointments", async (req, res) => {
  const appointments = await prisma.appointment.findMany({
    where: { clientId: req.clientId!, barberId: req.barberId! },
    include: { service: true, staff: true },
    orderBy: { startTime: "desc" },
  });
  res.json({ appointments });
});

const bookSchema = z.object({
  staffId: z.string().min(1),
  serviceId: z.string().min(1),
  startTime: z.string().datetime(),
  notes: z.string().optional(),
});

clientRouter.post("/appointments", async (req, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { staffId, serviceId, startTime, notes } = parsed.data;

  const [staff, service] = await Promise.all([
    prisma.staff.findFirst({ where: { id: staffId, barberId: req.barberId!, active: true } }),
    prisma.service.findFirst({ where: { id: serviceId, barberId: req.barberId!, active: true } }),
  ]);
  if (!staff) {
    res.status(404).json({ error: "Staff member not found" });
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
      clientId: req.clientId!,
      serviceId,
      startTime: start,
      endTime: end,
      notes,
    });
    res.status(201).json({ appointment });
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

clientRouter.patch("/appointments/:id/cancel", async (req, res) => {
  const existing = await prisma.appointment.findFirst({
    where: { id: req.params.id, clientId: req.clientId!, barberId: req.barberId! },
  });
  if (!existing) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  if (existing.status === "CANCELLED" || existing.status === "COMPLETED" || existing.status === "NO_SHOW") {
    res.status(409).json({ error: "This appointment can no longer be cancelled" });
    return;
  }
  const appointment = await setAppointmentStatus(existing.id, "CANCELLED");
  res.json({ appointment });
});

const deleteAccountSchema = z.object({ password: z.string().min(1) });

// App Store guideline 5.1.1(v): apps with account creation must offer in-app account deletion.
clientRouter.delete("/account", async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const client = await prisma.client.findUniqueOrThrow({ where: { id: req.clientId! } });
  if (!client.passwordHash || !(await bcrypt.compare(parsed.data.password, client.passwordHash))) {
    res.status(401).json({ error: "Contraseña incorrecta" });
    return;
  }
  await prisma.client.delete({ where: { id: client.id } });
  res.status(204).send();
});
