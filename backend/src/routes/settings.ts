import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get("/", async (req, res) => {
  const settings = await prisma.notificationSettings.upsert({
    where: { barberId: req.barberId! },
    update: {},
    create: { barberId: req.barberId! },
  });
  res.json({ settings });
});

const updateSchema = z.object({
  reminderHoursBefore: z
    .string()
    .regex(/^\d+(,\d+)*$/, "Comma-separated list of hours, e.g. \"24,2\"")
    .optional(),
  lateCancelThresholdHours: z.number().int().positive().optional(),
  riskyThreshold: z.number().int().positive().optional(),
  watchThreshold: z.number().int().positive().optional(),
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  barberPrewarningEnabled: z.boolean().optional(),
  barberPrewarningHoursBefore: z
    .string()
    .regex(/^\d+(,\d+)*$/, "Comma-separated list of hours, e.g. \"24,1\"")
    .optional(),
});

settingsRouter.patch("/", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const settings = await prisma.notificationSettings.upsert({
    where: { barberId: req.barberId! },
    update: parsed.data,
    create: { barberId: req.barberId!, ...parsed.data },
  });
  res.json({ settings });
});
