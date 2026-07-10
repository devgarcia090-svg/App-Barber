import { beforeEach } from "vitest";
import { prisma } from "../lib/prisma";

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

beforeEach(async () => {
  if (!hasTestDb) return;
  await prisma.reminder.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.staffWorkingHours.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.client.deleteMany();
  await prisma.service.deleteMany();
  await prisma.notificationSettings.deleteMany();
  await prisma.barber.deleteMany();
});
