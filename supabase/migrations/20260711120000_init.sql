-- =============================================================================
-- App-Barber — Supabase-native schema (phase 1: schema + security)
-- Single business. The OWNER authenticates via Supabase Auth and reads/writes
-- their own data directly through RLS. Everything public (booking page) and
-- client-facing goes through Edge Functions (service role), added in later
-- phases — so there are deliberately NO anon policies here.
-- Table names keep the original PascalCase to reuse the existing data model.
-- =============================================================================

-- ---- Extensions -------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;  -- bcrypt for client passwords

-- ---- Enums ------------------------------------------------------------------
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED');
CREATE TYPE "ReliabilityStatus" AS ENUM ('RELIABLE', 'WATCH', 'RISKY');
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS', 'PUSH');
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "ReminderKind" AS ENUM ('CLIENT_REMINDER', 'BARBER_PREWARNING');

-- ---- Tables -----------------------------------------------------------------
CREATE TABLE "Barber" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "authUserId" UUID UNIQUE REFERENCES auth.users("id") ON DELETE SET NULL,
    "businessName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "Barber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Staff" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "barberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffWorkingHours" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "staffId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    CONSTRAINT "StaffWorkingHours_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
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
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Service" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "barberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Client" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "barberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "pushToken" TEXT,
    "totalAppointments" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "lateCancelCount" INTEGER NOT NULL DEFAULT 0,
    "reliabilityStatus" "ReliabilityStatus" NOT NULL DEFAULT 'RELIABLE',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "barberId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startTime" TIMESTAMPTZ NOT NULL,
    "endTime" TIMESTAMPTZ NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "cancelledAt" TIMESTAMPTZ,
    "cancelNoticeHours" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "appointmentId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "scheduledFor" TIMESTAMPTZ NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMPTZ,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- Opaque session tokens for clients (who do NOT use Supabase Auth; they log in
-- with phone + password through SECURITY DEFINER RPCs).
CREATE TABLE "ClientSession" (
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "expiresAt" TIMESTAMPTZ NOT NULL DEFAULT now() + interval '90 days',
    CONSTRAINT "ClientSession_pkey" PRIMARY KEY ("token")
);
ALTER TABLE "ClientSession" ADD CONSTRAINT "ClientSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE;
CREATE INDEX "ClientSession_clientId_idx" ON "ClientSession"("clientId");

-- ---- Indexes / constraints --------------------------------------------------
CREATE UNIQUE INDEX "Barber_slug_key" ON "Barber"("slug");
CREATE UNIQUE INDEX "Barber_email_key" ON "Barber"("email");
CREATE INDEX "StaffWorkingHours_staffId_dayOfWeek_idx" ON "StaffWorkingHours"("staffId", "dayOfWeek");
CREATE UNIQUE INDEX "NotificationSettings_barberId_key" ON "NotificationSettings"("barberId");
CREATE UNIQUE INDEX "Client_barberId_phone_key" ON "Client"("barberId", "phone");
CREATE INDEX "Appointment_barberId_startTime_idx" ON "Appointment"("barberId", "startTime");
CREATE INDEX "Appointment_staffId_startTime_idx" ON "Appointment"("staffId", "startTime");
CREATE INDEX "Reminder_status_scheduledFor_idx" ON "Reminder"("status", "scheduledFor");

ALTER TABLE "Staff" ADD CONSTRAINT "Staff_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE;
ALTER TABLE "StaffWorkingHours" ADD CONSTRAINT "StaffWorkingHours_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE;
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE;

-- ---- updatedAt auto-touch ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_barber   BEFORE UPDATE ON "Barber"               FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_staff    BEFORE UPDATE ON "Staff"                FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_settings BEFORE UPDATE ON "NotificationSettings" FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_client   BEFORE UPDATE ON "Client"              FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_appt     BEFORE UPDATE ON "Appointment"         FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- Row Level Security -----------------------------------------------------
-- Helper: the Barber id owned by the currently authenticated user.
CREATE OR REPLACE FUNCTION public.current_barber_id() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b."id" FROM "Barber" b WHERE b."authUserId" = auth.uid() LIMIT 1;
$$;

ALTER TABLE "Barber"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Staff"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffWorkingHours"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Service"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reminder"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientSession"        ENABLE ROW LEVEL SECURITY;  -- no policies: RPC-only

-- Owner can read/write their own business row.
CREATE POLICY "owner_barber" ON "Barber" FOR ALL TO authenticated
  USING ("authUserId" = auth.uid()) WITH CHECK ("authUserId" = auth.uid());

-- Owner can read/write everything scoped to their barberId.
CREATE POLICY "owner_staff" ON "Staff" FOR ALL TO authenticated
  USING ("barberId" = public.current_barber_id()) WITH CHECK ("barberId" = public.current_barber_id());
CREATE POLICY "owner_service" ON "Service" FOR ALL TO authenticated
  USING ("barberId" = public.current_barber_id()) WITH CHECK ("barberId" = public.current_barber_id());
CREATE POLICY "owner_client" ON "Client" FOR ALL TO authenticated
  USING ("barberId" = public.current_barber_id()) WITH CHECK ("barberId" = public.current_barber_id());
CREATE POLICY "owner_settings" ON "NotificationSettings" FOR ALL TO authenticated
  USING ("barberId" = public.current_barber_id()) WITH CHECK ("barberId" = public.current_barber_id());
CREATE POLICY "owner_appointment" ON "Appointment" FOR ALL TO authenticated
  USING ("barberId" = public.current_barber_id()) WITH CHECK ("barberId" = public.current_barber_id());

-- Working hours belong to a staff member of the owner's business.
CREATE POLICY "owner_working_hours" ON "StaffWorkingHours" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "Staff" s WHERE s."id" = "staffId" AND s."barberId" = public.current_barber_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM "Staff" s WHERE s."id" = "staffId" AND s."barberId" = public.current_barber_id()));

-- Reminders belong to an appointment of the owner's business.
CREATE POLICY "owner_reminder" ON "Reminder" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "Appointment" a WHERE a."id" = "appointmentId" AND a."barberId" = public.current_barber_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM "Appointment" a WHERE a."id" = "appointmentId" AND a."barberId" = public.current_barber_id()));

-- NOTE: no anon/public policies. The public booking page and all client
-- operations go through Edge Functions using the service role, which bypasses
-- RLS and enforces its own checks. This keeps sensitive columns
-- (passwordHash, client PII) unreadable from the browser.
