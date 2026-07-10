import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WEEKDAY_SCHEDULE = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 9 * 60, // 09:00
  endMinute: 20 * 60, // 20:00
}));

const SATURDAY_SCHEDULE = [{ dayOfWeek: 6, startMinute: 10 * 60, endMinute: 15 * 60 }];

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const barber = await prisma.barber.upsert({
    where: { email: "carlos@barberia-demo.com" },
    update: {
      businessName: "La Oficina del Barbero",
      slug: "la-oficina-del-barbero",
    },
    create: {
      businessName: "La Oficina del Barbero",
      slug: "la-oficina-del-barbero",
      ownerName: "Carlos Ruiz",
      email: "carlos@barberia-demo.com",
      passwordHash,
      phone: "+34600000000",
      notificationSettings: { create: {} },
    },
  });

  const [corte, corteBarba, afeitado] = await Promise.all([
    prisma.service.create({
      data: { barberId: barber.id, name: "Corte de pelo", durationMinutes: 30, priceCents: 1500 },
    }),
    prisma.service.create({
      data: { barberId: barber.id, name: "Corte + barba", durationMinutes: 45, priceCents: 2200 },
    }),
    prisma.service.create({
      data: { barberId: barber.id, name: "Afeitado clásico", durationMinutes: 20, priceCents: 1200 },
    }),
  ]);

  const carlosStaff = await prisma.staff.create({
    data: {
      barberId: barber.id,
      name: "Carlos Ruiz",
      phone: "+34600000000",
      color: "#2563eb",
      workingHours: { create: [...WEEKDAY_SCHEDULE, ...SATURDAY_SCHEDULE] },
    },
  });

  const luisStaff = await prisma.staff.create({
    data: {
      barberId: barber.id,
      name: "Luis Fernández",
      phone: "+34600999888",
      color: "#16a34a",
      // Luis only works afternoons Tue-Sat
      workingHours: {
        create: [2, 3, 4, 5, 6].map((dayOfWeek) => ({
          dayOfWeek,
          startMinute: 15 * 60,
          endMinute: 21 * 60,
        })),
      },
    },
  });

  const reliableClient = await prisma.client.create({
    data: { barberId: barber.id, name: "Ana López", phone: "+34611111111", email: "ana@example.com" },
  });

  const riskyClient = await prisma.client.create({
    data: {
      barberId: barber.id,
      name: "Pedro Gómez",
      phone: "+34622222222",
      noShowCount: 2,
      lateCancelCount: 1,
      reliabilityStatus: "RISKY",
    },
  });

  const watchClient = await prisma.client.create({
    data: {
      barberId: barber.id,
      name: "Marta Sánchez",
      phone: "+34633333333",
      lateCancelCount: 1,
      reliabilityStatus: "WATCH",
    },
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  while (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1); // skip Sunday (closed)
  tomorrow.setHours(10, 0, 0, 0);

  await prisma.appointment.create({
    data: {
      barberId: barber.id,
      staffId: carlosStaff.id,
      clientId: reliableClient.id,
      serviceId: corte.id,
      startTime: tomorrow,
      endTime: new Date(tomorrow.getTime() + corte.durationMinutes * 60 * 1000),
      status: "CONFIRMED",
    },
  });
  await prisma.client.update({ where: { id: reliableClient.id }, data: { totalAppointments: { increment: 1 } } });

  const tomorrowAfternoon = new Date(tomorrow);
  tomorrowAfternoon.setHours(17, 0, 0, 0);
  await prisma.appointment.create({
    data: {
      barberId: barber.id,
      staffId: luisStaff.id,
      clientId: riskyClient.id,
      serviceId: corteBarba.id,
      startTime: tomorrowAfternoon,
      endTime: new Date(tomorrowAfternoon.getTime() + corteBarba.durationMinutes * 60 * 1000),
      status: "CONFIRMED",
    },
  });
  await prisma.client.update({ where: { id: riskyClient.id }, data: { totalAppointments: { increment: 1 } } });

  console.log("Seed complete:");
  console.log(`  Barber login -> email: ${barber.email} / password: password123`);
  console.log(`  Business -> ${barber.businessName}`);
  console.log(`  Public booking slug -> ${barber.slug}`);
  console.log(`  Staff -> ${carlosStaff.name}, ${luisStaff.name}`);
  console.log(`  Services: ${[corte.name, corteBarba.name, afeitado.name].join(", ")}`);
  console.log(`  Clients: ${reliableClient.name} (fiable), ${watchClient.name} (vigilar), ${riskyClient.name} (riesgo)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
