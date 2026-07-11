import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { hasTestDb } from "./setup";

const describeDb = describe.skipIf(!hasTestDb);
const app = createApp();

async function makeBarberWithServiceAndStaff() {
  const barber = await prisma.barber.create({
    data: {
      businessName: "Test Barbers",
      slug: `test-barbers-${Math.random().toString(36).slice(2)}`,
      ownerName: "Test Owner",
      email: `owner-${Math.random().toString(36).slice(2)}@test.com`,
      passwordHash: "hash",
      notificationSettings: { create: {} },
    },
  });
  const service = await prisma.service.create({
    data: { barberId: barber.id, name: "Corte", durationMinutes: 30, priceCents: 1000 },
  });
  const staff = await prisma.staff.create({
    data: {
      barberId: barber.id,
      name: "Barbero Test",
      workingHours: { create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startMinute: 0, endMinute: 24 * 60 - 1 })) },
    },
  });
  return { barber, service, staff };
}

describeDb("client auth + self-service booking", () => {
  it("registers a client, books, lists, and cancels its own appointment", async () => {
    const { barber, service, staff } = await makeBarberWithServiceAndStaff();

    const registerRes = await request(app)
      .post(`/api/public/${barber.slug}/client/register`)
      .send({ name: "Cliente App", phone: "+34611222333", password: "supersecret" });
    expect(registerRes.status).toBe(201);
    const token = registerRes.body.token as string;
    expect(token).toBeTruthy();

    const loginRes = await request(app)
      .post(`/api/public/${barber.slug}/client/login`)
      .send({ phone: "+34611222333", password: "supersecret" });
    expect(loginRes.status).toBe(200);

    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const bookRes = await request(app)
      .post("/api/client/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ staffId: staff.id, serviceId: service.id, startTime });
    expect(bookRes.status).toBe(201);
    const appointmentId = bookRes.body.appointment.id as string;

    const listRes = await request(app)
      .get("/api/client/appointments")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.appointments).toHaveLength(1);

    const cancelRes = await request(app)
      .patch(`/api/client/appointments/${appointmentId}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.appointment.status).toBe("CANCELLED");
  });

  it("rejects registering twice with the same phone, and login with a wrong password", async () => {
    const { barber } = await makeBarberWithServiceAndStaff();
    await request(app)
      .post(`/api/public/${barber.slug}/client/register`)
      .send({ name: "Cliente Uno", phone: "+34600000001", password: "supersecret" });

    const dupe = await request(app)
      .post(`/api/public/${barber.slug}/client/register`)
      .send({ name: "Otro", phone: "+34600000001", password: "otherpassword" });
    expect(dupe.status).toBe(409);

    const badLogin = await request(app)
      .post(`/api/public/${barber.slug}/client/login`)
      .send({ phone: "+34600000001", password: "wrong-password" });
    expect(badLogin.status).toBe(401);
  });

  it("does not let a client cancel or see another client's appointment", async () => {
    const { barber, service, staff } = await makeBarberWithServiceAndStaff();

    const clientA = await request(app)
      .post(`/api/public/${barber.slug}/client/register`)
      .send({ name: "A", phone: "+34600000002", password: "supersecret" });
    const clientB = await request(app)
      .post(`/api/public/${barber.slug}/client/register`)
      .send({ name: "B", phone: "+34600000003", password: "supersecret" });

    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const bookRes = await request(app)
      .post("/api/client/appointments")
      .set("Authorization", `Bearer ${clientA.body.token}`)
      .send({ staffId: staff.id, serviceId: service.id, startTime });
    const appointmentId = bookRes.body.appointment.id as string;

    const cancelAttempt = await request(app)
      .patch(`/api/client/appointments/${appointmentId}/cancel`)
      .set("Authorization", `Bearer ${clientB.body.token}`);
    expect(cancelAttempt.status).toBe(404);

    const listB = await request(app)
      .get("/api/client/appointments")
      .set("Authorization", `Bearer ${clientB.body.token}`);
    expect(listB.body.appointments).toHaveLength(0);
  });

  it("deletes the client account only with the correct password", async () => {
    const { barber } = await makeBarberWithServiceAndStaff();
    const registerRes = await request(app)
      .post(`/api/public/${barber.slug}/client/register`)
      .send({ name: "Cliente App", phone: "+34600000004", password: "supersecret" });
    const token = registerRes.body.token as string;

    const wrongPassword = await request(app)
      .delete("/api/client/account")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "wrong" });
    expect(wrongPassword.status).toBe(401);

    const deleteRes = await request(app)
      .delete("/api/client/account")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "supersecret" });
    expect(deleteRes.status).toBe(204);

    const client = await prisma.client.findUnique({ where: { barberId_phone: { barberId: barber.id, phone: "+34600000004" } } });
    expect(client).toBeNull();
  });
});
