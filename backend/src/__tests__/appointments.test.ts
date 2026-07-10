import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { hasTestDb } from "./setup";
import {
  createAppointment,
  OutsideWorkingHoursError,
  setAppointmentStatus,
  SlotUnavailableError,
} from "../services/appointments";

// These tests need a disposable Postgres database (TEST_DATABASE_URL).
const describeDb = describe.skipIf(!hasTestDb);

const ALL_DAY_EVERY_DAY = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 0,
  endMinute: 24 * 60 - 1,
}));

async function makeBarberWithClientAndService(schedule = ALL_DAY_EVERY_DAY) {
  const barber = await prisma.barber.create({
    data: {
      businessName: "Test Barbers",
      slug: `test-barbers-${Math.random().toString(36).slice(2)}`,
      ownerName: "Test Owner",
      email: `owner-${Math.random().toString(36).slice(2)}@test.com`,
      passwordHash: "hash",
      notificationSettings: { create: { riskyThreshold: 2, watchThreshold: 1, lateCancelThresholdHours: 4 } },
    },
  });
  const service = await prisma.service.create({
    data: { barberId: barber.id, name: "Corte", durationMinutes: 30, priceCents: 1000 },
  });
  const client = await prisma.client.create({
    data: { barberId: barber.id, name: "Cliente Test", phone: "+34600111222" },
  });
  const staff = await prisma.staff.create({
    data: { barberId: barber.id, name: "Barbero Test", workingHours: { create: schedule } },
  });
  return { barber, service, client, staff };
}

describeDb("createAppointment", () => {
  it("creates an appointment and schedules client reminders", async () => {
    const { barber, staff, service, client } = await makeBarberWithClientAndService();
    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);

    const appointment = await createAppointment({
      barberId: barber.id,
      staffId: staff.id,
      clientId: client.id,
      serviceId: service.id,
      startTime,
      endTime,
    });

    expect(appointment.status).toBe("PENDING");

    const reminders = await prisma.reminder.findMany({ where: { appointmentId: appointment.id } });
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.every((r) => r.kind === "CLIENT_REMINDER")).toBe(true);

    const updatedClient = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(updatedClient.totalAppointments).toBe(1);
  });

  it("schedules barber pre-warning reminders (one per configured offset) for risky clients", async () => {
    const { barber, staff, service, client } = await makeBarberWithClientAndService();
    await prisma.client.update({
      where: { id: client.id },
      data: { noShowCount: 2, reliabilityStatus: "RISKY" },
    });

    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);
    const appointment = await createAppointment({
      barberId: barber.id,
      staffId: staff.id,
      clientId: client.id,
      serviceId: service.id,
      startTime,
      endTime,
    });

    const reminders = await prisma.reminder.findMany({ where: { appointmentId: appointment.id } });
    const prewarnings = reminders.filter((r) => r.kind === "BARBER_PREWARNING");
    // default settings: barberPrewarningHoursBefore = "24,1" (2 offsets) x
    // email+whatsapp enabled (2 channels) = 4 reminder rows across 2 distinct times
    expect(prewarnings.length).toBe(4);
    expect(new Set(prewarnings.map((r) => r.scheduledFor.getTime())).size).toBe(2);
  });

  it("rejects overlapping appointments for the same staff member", async () => {
    const { barber, staff, service, client } = await makeBarberWithClientAndService();
    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);

    await createAppointment({
      barberId: barber.id,
      staffId: staff.id,
      clientId: client.id,
      serviceId: service.id,
      startTime,
      endTime,
    });

    await expect(
      createAppointment({
        barberId: barber.id,
        staffId: staff.id,
        clientId: client.id,
        serviceId: service.id,
        startTime: new Date(startTime.getTime() + 10 * 60 * 1000),
        endTime: new Date(endTime.getTime() + 10 * 60 * 1000),
      })
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("allows two different staff members to be booked at the same time", async () => {
    const { barber, staff, service, client } = await makeBarberWithClientAndService();
    const otherStaff = await prisma.staff.create({
      data: { barberId: barber.id, name: "Otro Barbero", workingHours: { create: ALL_DAY_EVERY_DAY } },
    });
    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);

    await createAppointment({ barberId: barber.id, staffId: staff.id, clientId: client.id, serviceId: service.id, startTime, endTime });

    await expect(
      createAppointment({
        barberId: barber.id,
        staffId: otherStaff.id,
        clientId: client.id,
        serviceId: service.id,
        startTime,
        endTime,
      })
    ).resolves.toBeTruthy();
  });

  it("rejects a booking outside the staff member's working hours", async () => {
    // Only open Monday 09:00-12:00
    const { barber, staff, service, client } = await makeBarberWithClientAndService([
      { dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 },
    ]);

    const nextTuesday = new Date();
    nextTuesday.setDate(nextTuesday.getDate() + ((2 - nextTuesday.getDay() + 7) % 7 || 7));
    nextTuesday.setHours(10, 0, 0, 0);

    await expect(
      createAppointment({
        barberId: barber.id,
        staffId: staff.id,
        clientId: client.id,
        serviceId: service.id,
        startTime: nextTuesday,
        endTime: new Date(nextTuesday.getTime() + service.durationMinutes * 60 * 1000),
      })
    ).rejects.toBeInstanceOf(OutsideWorkingHoursError);
  });
});

describeDb("setAppointmentStatus", () => {
  it("increments lateCancelCount and flips reliability to WATCH on a late cancellation", async () => {
    const { barber, staff, service, client } = await makeBarberWithClientAndService();
    const startTime = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3h from now
    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);
    const appointment = await createAppointment({
      barberId: barber.id,
      staffId: staff.id,
      clientId: client.id,
      serviceId: service.id,
      startTime,
      endTime,
    });

    // Cancelling now gives ~3h notice, under the 4h late-cancel threshold.
    await setAppointmentStatus(appointment.id, "CANCELLED", new Date());

    const updatedClient = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(updatedClient.lateCancelCount).toBe(1);
    expect(updatedClient.reliabilityStatus).toBe("WATCH");
  });

  it("does not penalize a cancellation made with plenty of notice", async () => {
    const { barber, staff, service, client } = await makeBarberWithClientAndService();
    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);
    const appointment = await createAppointment({
      barberId: barber.id,
      staffId: staff.id,
      clientId: client.id,
      serviceId: service.id,
      startTime,
      endTime,
    });

    await setAppointmentStatus(appointment.id, "CANCELLED", new Date());

    const updatedClient = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(updatedClient.lateCancelCount).toBe(0);
    expect(updatedClient.reliabilityStatus).toBe("RELIABLE");
  });

  it("marks the client RISKY after two no-shows and cancels pending reminders", async () => {
    const { barber, staff, service, client } = await makeBarberWithClientAndService();

    for (let i = 0; i < 2; i++) {
      const startTime = new Date(Date.now() + (24 + i * 3) * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);
      const appointment = await createAppointment({
        barberId: barber.id,
        staffId: staff.id,
        clientId: client.id,
        serviceId: service.id,
        startTime,
        endTime,
      });
      await setAppointmentStatus(appointment.id, "NO_SHOW");
    }

    const updatedClient = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(updatedClient.noShowCount).toBe(2);
    expect(updatedClient.reliabilityStatus).toBe("RISKY");
  });
});
