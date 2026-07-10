import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { buildPrewarning } from "../services/reliability";

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

clientsRouter.get("/", async (req, res) => {
  const clients = await prisma.client.findMany({
    where: { barberId: req.barberId! },
    orderBy: { name: "asc" },
  });
  res.json({
    clients: clients.map((client) => ({ ...client, prewarning: buildPrewarning(client) })),
  });
});

clientsRouter.get("/:id", async (req, res) => {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, barberId: req.barberId! },
    include: {
      appointments: { include: { service: true }, orderBy: { startTime: "desc" }, take: 20 },
    },
  });
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json({ client: { ...client, prewarning: buildPrewarning(client) } });
});

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  email: z.string().email().optional(),
});

clientsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.client.findUnique({
    where: { barberId_phone: { barberId: req.barberId!, phone: parsed.data.phone } },
  });
  if (existing) {
    res.status(409).json({ error: "A client with this phone already exists", client: existing });
    return;
  }
  const client = await prisma.client.create({ data: { ...parsed.data, barberId: req.barberId! } });
  res.status(201).json({ client });
});
