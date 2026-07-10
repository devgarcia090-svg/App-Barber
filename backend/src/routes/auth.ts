import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireJwtSecret } from "../middleware/auth";

export const authRouter = Router();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const registerSchema = z.object({
  businessName: z.string().min(2),
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { businessName, ownerName, email, password, phone } = parsed.data;

  const existing = await prisma.barber.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const baseSlug = slugify(businessName) || "barberia";
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.barber.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${++suffix}`;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const barber = await prisma.barber.create({
    data: {
      businessName,
      ownerName,
      email,
      phone,
      slug,
      passwordHash,
      notificationSettings: { create: {} },
    },
  });

  const token = signToken(barber.id, barber.email);
  res.status(201).json({ token, barber: toPublicBarber(barber) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const barber = await prisma.barber.findUnique({ where: { email } });
  if (!barber || !(await bcrypt.compare(password, barber.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = signToken(barber.id, barber.email);
  res.json({ token, barber: toPublicBarber(barber) });
});

const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

// App Store guideline 5.1.1(v): apps with account creation must offer
// in-app account deletion. Cascades wipe every business record.
authRouter.delete("/account", requireAuth, async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const barber = await prisma.barber.findUnique({ where: { id: req.barberId! } });
  if (!barber || !(await bcrypt.compare(parsed.data.password, barber.passwordHash))) {
    res.status(401).json({ error: "Contraseña incorrecta" });
    return;
  }

  await prisma.barber.delete({ where: { id: barber.id } });
  res.status(204).send();
});

function signToken(barberId: string, email: string): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"];
  return jwt.sign({ barberId, email }, requireJwtSecret(), { expiresIn });
}

function toPublicBarber(barber: {
  id: string;
  businessName: string;
  slug: string;
  ownerName: string;
  email: string;
  phone: string | null;
}) {
  const { id, businessName, slug, ownerName, email, phone } = barber;
  return { id, businessName, slug, ownerName, email, phone };
}
