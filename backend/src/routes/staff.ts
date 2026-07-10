import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

export const staffRouter = Router();
staffRouter.use(requireAuth);

staffRouter.get("/", async (req, res) => {
  const staff = await prisma.staff.findMany({
    where: { barberId: req.barberId! },
    include: { workingHours: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ staff });
});

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

staffRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const staff = await prisma.staff.create({ data: { ...parsed.data, barberId: req.barberId! } });
  res.status(201).json({ staff });
});

staffRouter.patch("/:id", async (req, res) => {
  const parsed = createSchema.partial().extend({ active: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.staff.findFirst({ where: { id: req.params.id, barberId: req.barberId! } });
  if (!existing) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  const staff = await prisma.staff.update({ where: { id: existing.id }, data: parsed.data });
  res.json({ staff });
});

const workingHoursSchema = z.object({
  schedule: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(1).max(1440),
    })
  ),
});

/** Replaces the staff member's entire weekly schedule in one shot. */
staffRouter.put("/:id/working-hours", async (req, res) => {
  const parsed = workingHoursSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.staff.findFirst({ where: { id: req.params.id, barberId: req.barberId! } });
  if (!existing) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  for (const row of parsed.data.schedule) {
    if (row.endMinute <= row.startMinute) {
      res.status(400).json({ error: `endMinute must be after startMinute for dayOfWeek ${row.dayOfWeek}` });
      return;
    }
  }

  const workingHours = await prisma.$transaction(async (tx) => {
    await tx.staffWorkingHours.deleteMany({ where: { staffId: existing.id } });
    await tx.staffWorkingHours.createMany({
      data: parsed.data.schedule.map((row) => ({ ...row, staffId: existing.id })),
    });
    return tx.staffWorkingHours.findMany({ where: { staffId: existing.id } });
  });

  res.json({ workingHours });
});
