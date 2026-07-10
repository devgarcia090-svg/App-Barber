-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReliabilityStatus" AS ENUM ('RELIABLE', 'WATCH', 'RISKY');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('CLIENT_REMINDER', 'BARBER_PREWARNING');

-- CreateTable
CREATE TABLE "Barber" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Barber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffWorkingHours" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "StaffWorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "reminderHoursBefore" TEXT NOT NULL DEFAULT '24,2',
    "lateCancelThresholdHours" INTEGER NOT NULL DEFAULT 4,
    "riskyThreshold" INTEGER NOT NULL DEFAULT 2,
    "watchThreshold" INTEGER NOT NULL DEFAULT 1,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "barberPrewarningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "barberPrewarningHoursBefore" TEXT NOT NULL DEFAULT '24,1',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "totalAppointments" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "lateCancelCount" INTEGER NOT NULL DEFAULT 0,
    "reliabilityStatus" "ReliabilityStatus" NOT NULL DEFAULT 'RELIABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "cancelledAt" TIMESTAMP(3),
    "cancelNoticeHours" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Barber_slug_key" ON "Barber"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Barber_email_key" ON "Barber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffWorkingHours_staffId_dayOfWeek_key" ON "StaffWorkingHours"("staffId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSettings_barberId_key" ON "NotificationSettings"("barberId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_barberId_phone_key" ON "Client"("barberId", "phone");

-- CreateIndex
CREATE INDEX "Appointment_barberId_startTime_idx" ON "Appointment"("barberId", "startTime");

-- CreateIndex
CREATE INDEX "Appointment_staffId_startTime_idx" ON "Appointment"("staffId", "startTime");

-- CreateIndex
CREATE INDEX "Reminder_status_scheduledFor_idx" ON "Reminder"("status", "scheduledFor");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffWorkingHours" ADD CONSTRAINT "StaffWorkingHours_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

