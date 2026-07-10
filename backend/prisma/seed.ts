import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Real listed hours for Oficina del Barbero: Mon-Sat 09:30-13:30.
const SAMU_SCHEDULE = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 9 * 60 + 30,
  endMinute: 13 * 60 + 30,
}));

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const barber = await prisma.barber.upsert({
    where: { email: "carlos@barberia-demo.com" },
    update: {
      businessName: "Oficina del Barbero",
      slug: "oficina-del-barbero",
      ownerName: "Samu",
      phone: "+34698923061",
    },
    create: {
      businessName: "Oficina del Barbero",
      slug: "oficina-del-barbero",
      ownerName: "Samu",
      email: "carlos@barberia-demo.com",
      passwordHash,
      phone: "+34698923061",
      notificationSettings: { create: {} },
    },
  });

  // Real Booksy catalogue for Oficina del Barbero.
  const [corte, corteBarba, recorteBarba, cortePerfilado] = await Promise.all([
    prisma.service.create({
      data: { barberId: barber.id, name: "Corte caballero", durationMinutes: 30, priceCents: 1300 },
    }),
    prisma.service.create({
      data: { barberId: barber.id, name: "Corte+Barba", durationMinutes: 45, priceCents: 1900 },
    }),
    prisma.service.create({
      data: { barberId: barber.id, name: "Recorte de la barba", durationMinutes: 15, priceCents: 800 },
    }),
    prisma.service.create({
      data: { barberId: barber.id, name: "Corte+Perfilado Barba", durationMinutes: 30, priceCents: 1500 },
    }),
  ]);

  const samuStaff = await prisma.staff.create({
    data: {
      barberId: barber.id,
      name: "Samuel",
      phone: "+34698923061",
      color: "#D6A756",
      workingHours: { create: SAMU_SCHEDULE },
    },
  });

  const jotiStaff = await prisma.staff.create({
    data: {
      barberId: barber.id,
      name: "Joti",
      color: "#5E8DFF",
      workingHours: { create: SAMU_SCHEDULE },
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
      staffId: samuStaff.id,
      clientId: reliableClient.id,
      serviceId: corte.id,
      startTime: tomorrow,
      endTime: new Date(tomorrow.getTime() + corte.durationMinutes * 60 * 1000),
      status: "CONFIRMED",
    },
  });
  await prisma.client.update({ where: { id: reliableClient.id }, data: { totalAppointments: { increment: 1 } } });

  const tomorrowLater = new Date(tomorrow);
  tomorrowLater.setHours(12, 0, 0, 0);
  await prisma.appointment.create({
    data: {
      barberId: barber.id,
      staffId: samuStaff.id,
      clientId: riskyClient.id,
      serviceId: corteBarba.id,
      startTime: tomorrowLater,
      endTime: new Date(tomorrowLater.getTime() + corteBarba.durationMinutes * 60 * 1000),
      status: "CONFIRMED",
    },
  });
  await prisma.client.update({ where: { id: riskyClient.id }, data: { totalAppointments: { increment: 1 } } });

  console.log("Seed complete:");
  console.log(`  Barber login -> email: ${barber.email} / password: password123`);
  console.log(`  Business -> ${barber.businessName} (Llano de Brujas, Murcia)`);
  console.log(`  Public booking slug -> ${barber.slug}`);
  console.log(`  Staff -> ${samuStaff.name}, ${jotiStaff.name} (L-S 09:30-13:30)`);
  console.log(`  Services: ${[corte.name, corteBarba.name, recorteBarba.name, cortePerfilado.name].join(", ")}`);
  console.log(`  Clients: ${reliableClient.name} (fiable), ${watchClient.name} (vigilar), ${riskyClient.name} (riesgo)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
