import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { createAppointment, OutsideWorkingHoursError, SlotUnavailableError } from "../services/appointments";

export const publicRouter = Router();

publicRouter.get("/:slug", async (req, res) => {
  const barber = await prisma.barber.findUnique({
    where: { slug: req.params.slug },
    include: {
      services: { where: { active: true } },
      staff: { where: { active: true }, select: { id: true, name: true, color: true } },
    },
  });
  if (!barber) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json({
    barber: { businessName: barber.businessName, slug: barber.slug, phone: barber.phone },
    services: barber.services,
    staff: barber.staff,
  });
});

publicRouter.get("/:slug/busy-slots", async (req, res) => {
  const barber = await prisma.barber.findUnique({ where: { slug: req.params.slug } });
  if (!barber) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  const dateParam = typeof req.query.date === "string" ? req.query.date : undefined;
  const staffId = typeof req.query.staffId === "string" ? req.query.staffId : undefined;
  if (!dateParam) {
    res.status(400).json({ error: "Query param 'date' (YYYY-MM-DD) is required" });
    return;
  }
  if (!staffId) {
    res.status(400).json({ error: "Query param 'staffId' is required" });
    return;
  }
  const dayStart = new Date(`${dateParam}T00:00:00`);
  const dayEnd = new Date(`${dateParam}T23:59:59`);

  const appointments = await prisma.appointment.findMany({
    where: {
      barberId: barber.id,
      staffId,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      startTime: { gte: dayStart, lte: dayEnd },
    },
    select: { startTime: true, endTime: true },
  });
  res.json({ busySlots: appointments });
});

const bookSchema = z.object({
  staffId: z.string().min(1),
  clientName: z.string().min(1),
  clientPhone: z.string().min(3),
  clientEmail: z.string().email().optional(),
  serviceId: z.string().min(1),
  startTime: z.string().datetime(),
  notes: z.string().optional(),
});

publicRouter.post("/:slug/book", async (req, res) => {
  const barber = await prisma.barber.findUnique({ where: { slug: req.params.slug } });
  if (!barber) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { staffId, clientName, clientPhone, clientEmail, serviceId, startTime, notes } = parsed.data;

  const [staff, service] = await Promise.all([
    prisma.staff.findFirst({ where: { id: staffId, barberId: barber.id, active: true } }),
    prisma.service.findFirst({ where: { id: serviceId, barberId: barber.id, active: true } }),
  ]);
  if (!staff) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const client = await prisma.client.upsert({
    where: { barberId_phone: { barberId: barber.id, phone: clientPhone } },
    update: { name: clientName, email: clientEmail },
    create: { barberId: barber.id, name: clientName, phone: clientPhone, email: clientEmail },
  });

  const start = new Date(startTime);
  const end = new Date(start.getTime() + service.durationMinutes * 60 * 1000);

  try {
    const appointment = await createAppointment({
      barberId: barber.id,
      staffId,
      clientId: client.id,
      serviceId: service.id,
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
