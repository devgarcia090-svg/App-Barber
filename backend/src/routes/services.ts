import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

export const servicesRouter = Router();
servicesRouter.use(requireAuth);

servicesRouter.get("/", async (req, res) => {
  const services = await prisma.service.findMany({
    where: { barberId: req.barberId! },
    orderBy: { createdAt: "asc" },
  });
  res.json({ services });
});

const upsertSchema = z.object({
  name: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
  active: z.boolean().optional(),
});

servicesRouter.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const service = await prisma.service.create({
    data: { ...parsed.data, barberId: req.barberId! },
  });
  res.status(201).json({ service });
});

servicesRouter.patch("/:id", async (req, res) => {
  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.service.findFirst({ where: { id: req.params.id, barberId: req.barberId! } });
  if (!existing) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const service = await prisma.service.update({ where: { id: existing.id }, data: parsed.data });
  res.json({ service });
});

servicesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.service.findFirst({ where: { id: req.params.id, barberId: req.barberId! } });
  if (!existing) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  await prisma.service.update({ where: { id: existing.id }, data: { active: false } });
  res.status(204).send();
});
