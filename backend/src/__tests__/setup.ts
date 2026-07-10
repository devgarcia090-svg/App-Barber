import { beforeEach } from "vitest";
import { prisma } from "../lib/prisma";

beforeEach(async () => {
  await prisma.reminder.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.staffWorkingHours.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.client.deleteMany();
  await prisma.service.deleteMany();
  await prisma.notificationSettings.deleteMany();
  await prisma.barber.deleteMany();
});
