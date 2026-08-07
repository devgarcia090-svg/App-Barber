-- =============================================================================
-- App-Barber — SETUP COMPLETO PARA SUPABASE (pegar en SQL Editor y pulsar RUN)
-- Crea todo: tablas + RLS + funciones + invitaciones + enlace mágico +
-- facturación/estadísticas + fidelización + método de pago + reprogramar citas
-- + fixes de seguridad y de fiabilidad/recordatorios (auditoría) + aviso push
-- por cancelación el mismo día + datos de ejemplo.
-- Ejecutar UNA vez en un proyecto sin datos.
--
-- IMPORTANTE tras ejecutar este script: el alta del dueño ya NO se hace desde
-- la web (se eliminó el auto-registro por motivos de seguridad). Créalo así:
--   1. Authentication → Users → Add user (email + contraseña), o
--      supabase.auth.admin.createUser(...) desde un script de confianza.
--   2. Ejecuta en el SQL Editor:
--      UPDATE "Barber" SET "authUserId" = (SELECT id FROM auth.users WHERE email = 'TU_EMAIL')
--      WHERE "slug" = 'TU_SLUG';
-- =============================================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;

-- ==== 20260711120000_init ====
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

-- ==== 20260711130000_functions ====
-- =============================================================================
-- App-Barber — Supabase-native business logic (phases 2 & 3)
-- All logic ported from the old Express services into Postgres:
--   * availability / slot math   (was services/availability.ts + utils)
--   * booking validation          (was services/appointments.ts)
--   * reliability engine          (was services/reliability.ts, via trigger)
--   * reminder scheduling         (was notifications/scheduler.ts)
--   * client auth (phone+pw)      (was routes: bcrypt via pgcrypto + sessions)
-- Public + client RPCs are SECURITY DEFINER and granted to anon so the apps
-- can call them with just the publishable key. Owner CRUD stays on RLS.
-- Wall-clock times are interpreted in Europe/Madrid (single Spanish business).
-- =============================================================================

-- ---- Reliability trigger ----------------------------------------------------
CREATE OR REPLACE FUNCTION public._on_appointment_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_risky INT; s_watch INT; s_late INT;
  notice_hours DOUBLE PRECISION;
  new_no_show INT; new_late INT; new_status "ReliabilityStatus"; strikes INT;
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;

  SELECT "riskyThreshold", "watchThreshold", "lateCancelThresholdHours"
    INTO s_risky, s_watch, s_late
    FROM "NotificationSettings" WHERE "barberId" = NEW."barberId";
  s_risky := COALESCE(s_risky, 2); s_watch := COALESCE(s_watch, 1); s_late := COALESCE(s_late, 4);

  IF NEW."status" = 'CANCELLED' THEN
    NEW."cancelledAt" := now();
    notice_hours := GREATEST(0, EXTRACT(EPOCH FROM (NEW."startTime" - now())) / 3600.0);
    NEW."cancelNoticeHours" := notice_hours;
    IF notice_hours < s_late THEN
      UPDATE "Client" SET "lateCancelCount" = "lateCancelCount" + 1 WHERE "id" = NEW."clientId";
    END IF;
  ELSIF NEW."status" = 'NO_SHOW' THEN
    UPDATE "Client" SET "noShowCount" = "noShowCount" + 1 WHERE "id" = NEW."clientId";
  ELSIF NEW."status" = 'COMPLETED' THEN
    UPDATE "Client" SET "completedCount" = "completedCount" + 1 WHERE "id" = NEW."clientId";
  END IF;

  IF NEW."status" IN ('CANCELLED', 'NO_SHOW') THEN
    SELECT "noShowCount", "lateCancelCount" INTO new_no_show, new_late FROM "Client" WHERE "id" = NEW."clientId";
    strikes := new_no_show + new_late;
    new_status := CASE WHEN strikes >= s_risky THEN 'RISKY'::"ReliabilityStatus"
                       WHEN strikes >= s_watch THEN 'WATCH'::"ReliabilityStatus"
                       ELSE 'RELIABLE'::"ReliabilityStatus" END;
    UPDATE "Client" SET "reliabilityStatus" = new_status WHERE "id" = NEW."clientId";
    -- cancel any pending reminders for a dead appointment
    UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "appointmentId" = NEW."id" AND "status" = 'PENDING';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER appointment_status_change BEFORE UPDATE ON "Appointment"
  FOR EACH ROW EXECUTE FUNCTION public._on_appointment_status_change();

-- ---- Booking validation -----------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_bookable(p_staff_id TEXT, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d_start DATE := (p_start AT TIME ZONE 'Europe/Madrid')::date;
  d_end   DATE := (p_end   AT TIME ZONE 'Europe/Madrid')::date;
  m_start INT  := EXTRACT(HOUR FROM (p_start AT TIME ZONE 'Europe/Madrid')) * 60 + EXTRACT(MINUTE FROM (p_start AT TIME ZONE 'Europe/Madrid'));
  m_end   INT  := EXTRACT(HOUR FROM (p_end   AT TIME ZONE 'Europe/Madrid')) * 60 + EXTRACT(MINUTE FROM (p_end   AT TIME ZONE 'Europe/Madrid'));
  dow     INT  := EXTRACT(DOW FROM (p_start AT TIME ZONE 'Europe/Madrid'))::int;
BEGIN
  IF d_start <> d_end THEN
    RAISE EXCEPTION 'OUTSIDE_HOURS' USING HINT = 'La cita cruza la medianoche';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "StaffWorkingHours" wh
    WHERE wh."staffId" = p_staff_id AND wh."dayOfWeek" = dow
      AND m_start >= wh."startMinute" AND m_end <= wh."endMinute"
  ) THEN
    RAISE EXCEPTION 'OUTSIDE_HOURS' USING HINT = 'Fuera del horario del barbero';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Appointment" a
    WHERE a."staffId" = p_staff_id AND a."status" NOT IN ('CANCELLED','NO_SHOW')
      AND a."startTime" < p_end AND a."endTime" > p_start
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING HINT = 'Ese hueco se solapa con otra cita';
  END IF;
END;
$$;

-- ---- Reminder scheduling ----------------------------------------------------
CREATE OR REPLACE FUNCTION public._parse_hours(csv TEXT)
RETURNS SETOF INT LANGUAGE sql IMMUTABLE AS $$
  SELECT n::numeric::int FROM regexp_split_to_table(coalesce(csv,''), ',') AS n
  WHERE trim(n) ~ '^[0-9]+(\.[0-9]+)?$' AND n::numeric > 0;
$$;

CREATE OR REPLACE FUNCTION public._schedule_reminders(p_appointment_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  appt "Appointment"%ROWTYPE;
  st "NotificationSettings"%ROWTYPE;
  cli "Client"%ROWTYPE;
  channels "ReminderChannel"[];
  ch "ReminderChannel";
  h INT;
  sched TIMESTAMPTZ;
BEGIN
  SELECT * INTO appt FROM "Appointment" WHERE "id" = p_appointment_id;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "appointmentId" = p_appointment_id AND "status" = 'PENDING';
  IF appt."status" NOT IN ('PENDING','CONFIRMED') THEN RETURN; END IF;

  SELECT * INTO st FROM "NotificationSettings" WHERE "barberId" = appt."barberId";
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO cli FROM "Client" WHERE "id" = appt."clientId";

  channels := ARRAY[]::"ReminderChannel"[];
  IF st."emailEnabled"    THEN channels := channels || 'EMAIL'::"ReminderChannel"; END IF;
  IF st."whatsappEnabled" THEN channels := channels || 'WHATSAPP'::"ReminderChannel"; END IF;
  IF st."smsEnabled"      THEN channels := channels || 'SMS'::"ReminderChannel"; END IF;
  IF cli."pushToken" IS NOT NULL THEN channels := channels || 'PUSH'::"ReminderChannel"; END IF;

  FOR h IN SELECT public._parse_hours(st."reminderHoursBefore") LOOP
    sched := appt."startTime" - make_interval(hours => h);
    IF sched > now() THEN
      FOREACH ch IN ARRAY channels LOOP
        INSERT INTO "Reminder"("appointmentId","kind","channel","scheduledFor","status")
        VALUES (p_appointment_id, 'CLIENT_REMINDER', ch, sched, 'PENDING');
      END LOOP;
    END IF;
  END LOOP;

  IF st."barberPrewarningEnabled" AND cli."reliabilityStatus" <> 'RELIABLE' THEN
    FOR h IN SELECT public._parse_hours(st."barberPrewarningHoursBefore") LOOP
      sched := appt."startTime" - make_interval(hours => h);
      IF sched > now() THEN
        FOREACH ch IN ARRAY channels LOOP
          INSERT INTO "Reminder"("appointmentId","kind","channel","scheduledFor","status")
          VALUES (p_appointment_id, 'BARBER_PREWARNING', ch, sched, 'PENDING');
        END LOOP;
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- ---- Core create-appointment ------------------------------------------------
CREATE OR REPLACE FUNCTION public._create_appointment(
  p_barber_id TEXT, p_staff_id TEXT, p_client_id TEXT, p_service_id TEXT,
  p_start TIMESTAMPTZ, p_notes TEXT DEFAULT NULL
) RETURNS "Appointment" LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dur INT;
  p_end TIMESTAMPTZ;
  appt "Appointment"%ROWTYPE;
BEGIN
  SELECT "durationMinutes" INTO dur FROM "Service" WHERE "id" = p_service_id AND "barberId" = p_barber_id AND "active";
  IF dur IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Staff" WHERE "id" = p_staff_id AND "barberId" = p_barber_id AND "active") THEN
    RAISE EXCEPTION 'STAFF_NOT_FOUND';
  END IF;

  p_end := p_start + make_interval(mins => dur);
  PERFORM public._assert_bookable(p_staff_id, p_start, p_end);

  INSERT INTO "Appointment"("barberId","staffId","clientId","serviceId","startTime","endTime","status","notes")
  VALUES (p_barber_id, p_staff_id, p_client_id, p_service_id, p_start, p_end, 'PENDING', p_notes)
  RETURNING * INTO appt;

  UPDATE "Client" SET "totalAppointments" = "totalAppointments" + 1 WHERE "id" = p_client_id;
  PERFORM public._schedule_reminders(appt."id");
  RETURN appt;
END;
$$;

-- ---- Availability -----------------------------------------------------------
-- Free (staff, minute) slots for one day, 15-min granularity, future only.
CREATE OR REPLACE FUNCTION public._free_slots(p_barber_id TEXT, p_duration INT, p_date DATE, p_staff_id TEXT DEFAULT NULL)
RETURNS TABLE(start_minute INT, staff_ids TEXT[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cand AS (
    SELECT s."id" AS staff_id, gs.minute::int AS minute,
      ((p_date::timestamp + make_interval(mins => gs.minute::int)) AT TIME ZONE 'Europe/Madrid') AS slot_start
    FROM "Staff" s
    JOIN "StaffWorkingHours" wh ON wh."staffId" = s."id" AND wh."dayOfWeek" = EXTRACT(DOW FROM p_date)::int
    CROSS JOIN LATERAL generate_series(wh."startMinute", wh."endMinute" - p_duration, 15) AS gs(minute)
    WHERE s."barberId" = p_barber_id AND s."active"
      AND (p_staff_id IS NULL OR s."id" = p_staff_id)
  )
  SELECT c.minute, array_agg(c.staff_id ORDER BY c.staff_id)
  FROM cand c
  WHERE c.slot_start >= now()
    AND NOT EXISTS (
      SELECT 1 FROM "Appointment" a
      WHERE a."staffId" = c.staff_id AND a."status" NOT IN ('CANCELLED','NO_SHOW')
        AND a."startTime" < c.slot_start + make_interval(mins => p_duration)
        AND a."endTime" > c.slot_start
    )
  GROUP BY c.minute
  ORDER BY c.minute;
$$;

-- Count of future work minutes ignoring bookings (capacity for the month view).
CREATE OR REPLACE FUNCTION public._capacity(p_barber_id TEXT, p_duration INT, p_date DATE, p_staff_id TEXT DEFAULT NULL)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT gs.minute)::int
  FROM "Staff" s
  JOIN "StaffWorkingHours" wh ON wh."staffId" = s."id" AND wh."dayOfWeek" = EXTRACT(DOW FROM p_date)::int
  CROSS JOIN LATERAL generate_series(wh."startMinute", wh."endMinute" - p_duration, 15) AS gs(minute)
  WHERE s."barberId" = p_barber_id AND s."active"
    AND (p_staff_id IS NULL OR s."id" = p_staff_id)
    AND ((p_date::timestamp + make_interval(mins => gs.minute::int)) AT TIME ZONE 'Europe/Madrid') >= now();
$$;

-- ---- Public RPCs (anon) -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_business(p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b "Barber"%ROWTYPE; BEGIN
  SELECT * INTO b FROM "Barber" WHERE "slug" = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;
  RETURN jsonb_build_object(
    'barber', jsonb_build_object('businessName', b."businessName", 'slug', b."slug", 'phone', b."phone"),
    'services', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s."id",'name',s."name",'durationMinutes',s."durationMinutes",'priceCents',s."priceCents") ORDER BY s."createdAt")
                          FROM "Service" s WHERE s."barberId"=b."id" AND s."active"), '[]'::jsonb),
    'staff', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',st."id",'name',st."name",'color',st."color") ORDER BY st."createdAt")
                       FROM "Staff" st WHERE st."barberId"=b."id" AND st."active"), '[]'::jsonb)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.public_day_slots(p_slug TEXT, p_service_id TEXT, p_date DATE, p_staff_id TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_dur INT; BEGIN
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  SELECT "durationMinutes" INTO v_dur FROM "Service" WHERE "id" = p_service_id AND "barberId" = v_barber AND "active";
  IF v_dur IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('startMinute', start_minute, 'staffIds', staff_ids))
                   FROM public._free_slots(v_barber, v_dur, p_date, p_staff_id)), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.public_availability(p_slug TEXT, p_service_id TEXT, p_from DATE, p_to DATE, p_staff_id TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_dur INT; BEGIN
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  SELECT "durationMinutes" INTO v_dur FROM "Service" WHERE "id" = p_service_id AND "barberId" = v_barber AND "active";
  IF v_dur IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'date', to_char(d, 'YYYY-MM-DD'),
      'freeCount', (SELECT count(*) FROM public._free_slots(v_barber, v_dur, d::date, p_staff_id)),
      'totalCount', public._capacity(v_barber, v_dur, d::date, p_staff_id)
    ) ORDER BY d)
    FROM generate_series(p_from, p_to, interval '1 day') AS d
  ), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.public_book(
  p_slug TEXT, p_staff_id TEXT, p_service_id TEXT, p_start TIMESTAMPTZ,
  p_client_name TEXT, p_client_phone TEXT, p_client_email TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_client TEXT; appt "Appointment"%ROWTYPE; BEGIN
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  IF v_barber IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;

  INSERT INTO "Client"("barberId","name","phone","email") VALUES (v_barber, p_client_name, p_client_phone, p_client_email)
  ON CONFLICT ("barberId","phone") DO UPDATE SET "name" = EXCLUDED."name",
    "email" = COALESCE(EXCLUDED."email", "Client"."email")
  RETURNING "id" INTO v_client;

  appt := public._create_appointment(v_barber, p_staff_id, v_client, p_service_id, p_start, p_notes);
  RETURN to_jsonb(appt);
END; $$;

-- ---- Client auth + self-service RPCs ----------------------------------------
CREATE OR REPLACE FUNCTION public._client_from_token(p_token TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT "clientId" FROM "ClientSession" WHERE "token" = p_token AND "expiresAt" > now();
$$;

CREATE OR REPLACE FUNCTION public._client_json(p_client_id TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id',"id",'name',"name",'phone',"phone",'email',"email")
  FROM "Client" WHERE "id" = p_client_id;
$$;

CREATE OR REPLACE FUNCTION public.client_register(p_slug TEXT, p_name TEXT, p_phone TEXT, p_password TEXT, p_email TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_barber TEXT; v_client TEXT; existing "Client"%ROWTYPE; v_token TEXT; BEGIN
  IF length(p_password) < 8 THEN RAISE EXCEPTION 'WEAK_PASSWORD'; END IF;
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  IF v_barber IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;

  SELECT * INTO existing FROM "Client" WHERE "barberId" = v_barber AND "phone" = p_phone;
  IF FOUND AND existing."passwordHash" IS NOT NULL THEN
    RAISE EXCEPTION 'PHONE_TAKEN';
  END IF;

  IF FOUND THEN
    UPDATE "Client" SET "name" = p_name, "email" = p_email,
      "passwordHash" = crypt(p_password, gen_salt('bf')) WHERE "id" = existing."id" RETURNING "id" INTO v_client;
  ELSE
    INSERT INTO "Client"("barberId","name","phone","email","passwordHash")
    VALUES (v_barber, p_name, p_phone, p_email, crypt(p_password, gen_salt('bf'))) RETURNING "id" INTO v_client;
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO "ClientSession"("token","clientId") VALUES (v_token, v_client);
  RETURN jsonb_build_object('token', v_token, 'client', public._client_json(v_client));
END; $$;

CREATE OR REPLACE FUNCTION public.client_login(p_slug TEXT, p_phone TEXT, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_barber TEXT; cli "Client"%ROWTYPE; v_token TEXT; BEGIN
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  SELECT * INTO cli FROM "Client" WHERE "barberId" = v_barber AND "phone" = p_phone;
  IF NOT FOUND OR cli."passwordHash" IS NULL OR crypt(p_password, cli."passwordHash") <> cli."passwordHash" THEN
    RAISE EXCEPTION 'BAD_CREDENTIALS';
  END IF;
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO "ClientSession"("token","clientId") VALUES (v_token, cli."id");
  RETURN jsonb_build_object('token', v_token, 'client', public._client_json(cli."id"));
END; $$;

CREATE OR REPLACE FUNCTION public.client_my_appointments(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client TEXT; BEGIN
  v_client := public._client_from_token(p_token);
  IF v_client IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',a."id",'startTime',a."startTime",'endTime',a."endTime",'status',a."status",'notes',a."notes",
      'service', jsonb_build_object('id',sv."id",'name',sv."name",'durationMinutes',sv."durationMinutes",'priceCents',sv."priceCents"),
      'staff', jsonb_build_object('id',st."id",'name',st."name",'color',st."color")
    ) ORDER BY a."startTime" DESC)
    FROM "Appointment" a JOIN "Service" sv ON sv."id"=a."serviceId" JOIN "Staff" st ON st."id"=a."staffId"
    WHERE a."clientId" = v_client), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.client_book(p_token TEXT, p_staff_id TEXT, p_service_id TEXT, p_start TIMESTAMPTZ, p_notes TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client TEXT; v_barber TEXT; appt "Appointment"%ROWTYPE; BEGIN
  v_client := public._client_from_token(p_token);
  IF v_client IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT "barberId" INTO v_barber FROM "Client" WHERE "id" = v_client;
  appt := public._create_appointment(v_barber, p_staff_id, v_client, p_service_id, p_start, p_notes);
  RETURN to_jsonb(appt);
END; $$;

CREATE OR REPLACE FUNCTION public.client_cancel(p_token TEXT, p_appointment_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client TEXT; appt "Appointment"%ROWTYPE; BEGIN
  v_client := public._client_from_token(p_token);
  IF v_client IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO appt FROM "Appointment" WHERE "id" = p_appointment_id AND "clientId" = v_client;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF appt."status" IN ('CANCELLED','COMPLETED','NO_SHOW') THEN RAISE EXCEPTION 'NOT_CANCELLABLE'; END IF;
  UPDATE "Appointment" SET "status" = 'CANCELLED' WHERE "id" = p_appointment_id RETURNING * INTO appt;
  RETURN to_jsonb(appt);
END; $$;

CREATE OR REPLACE FUNCTION public.client_set_push_token(p_token TEXT, p_push_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client TEXT; BEGIN
  v_client := public._client_from_token(p_token);
  IF v_client IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  UPDATE "Client" SET "pushToken" = p_push_token WHERE "id" = v_client;
END; $$;

CREATE OR REPLACE FUNCTION public.client_delete_account(p_token TEXT, p_password TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_client TEXT; cli "Client"%ROWTYPE; BEGIN
  v_client := public._client_from_token(p_token);
  IF v_client IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO cli FROM "Client" WHERE "id" = v_client;
  IF cli."passwordHash" IS NULL OR crypt(p_password, cli."passwordHash") <> cli."passwordHash" THEN
    RAISE EXCEPTION 'BAD_CREDENTIALS';
  END IF;
  DELETE FROM "Client" WHERE "id" = v_client;
END; $$;

-- ---- Owner: claim the single business on first login ------------------------
CREATE OR REPLACE FUNCTION public.claim_business(p_slug TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE "Barber" SET "authUserId" = auth.uid()
  WHERE "slug" = p_slug AND "authUserId" IS NULL;
END; $$;

-- ---- Grants -----------------------------------------------------------------
GRANT EXECUTE ON FUNCTION
  public.public_business(TEXT),
  public.public_day_slots(TEXT,TEXT,DATE,TEXT),
  public.public_availability(TEXT,TEXT,DATE,DATE,TEXT),
  public.public_book(TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT),
  public.client_register(TEXT,TEXT,TEXT,TEXT,TEXT),
  public.client_login(TEXT,TEXT,TEXT),
  public.client_my_appointments(TEXT),
  public.client_book(TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT),
  public.client_cancel(TEXT,TEXT),
  public.client_set_push_token(TEXT,TEXT),
  public.client_delete_account(TEXT,TEXT)
TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_business(TEXT) TO authenticated;

-- ==== 20260711140000_reminders ====
-- =============================================================================
-- App-Barber — Supabase-native reminders dispatch (phase 4)
-- Replaces the old node-cron dispatcher. pg_cron runs dispatch_due_reminders()
-- every 5 minutes; it sends client PUSH notifications via the free Expo push
-- API using pg_net (async HTTP from Postgres). Email/WhatsApp/SMS need a paid
-- HTTP provider, so those are marked FAILED with a clear reason until one is
-- wired up (they're disabled by default in NotificationSettings).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.dispatch_due_reminders()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  r RECORD;
  n INT := 0;
  v_title TEXT;
  v_body TEXT;
  v_when TEXT;
BEGIN
  FOR r IN
    SELECT rem."id" AS reminder_id, rem."kind", rem."channel",
           a."startTime", a."status" AS appt_status,
           c."pushToken", c."name" AS client_name, c."reliabilityStatus",
           sv."name" AS service_name, b."businessName"
    FROM "Reminder" rem
    JOIN "Appointment" a ON a."id" = rem."appointmentId"
    JOIN "Client" c ON c."id" = a."clientId"
    JOIN "Service" sv ON sv."id" = a."serviceId"
    JOIN "Barber" b ON b."id" = a."barberId"
    WHERE rem."status" = 'PENDING' AND rem."scheduledFor" <= now()
    ORDER BY rem."scheduledFor"
    LIMIT 200
  LOOP
    -- Appointment no longer live: drop the reminder.
    IF r.appt_status IN ('CANCELLED', 'NO_SHOW') THEN
      UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "id" = r.reminder_id;
      CONTINUE;
    END IF;

    v_when := to_char(r."startTime" AT TIME ZONE 'Europe/Madrid', 'DD/MM HH24:MI');
    IF r."kind" = 'CLIENT_REMINDER' THEN
      v_title := r."businessName";
      v_body  := 'Recordatorio: tu cita de ' || r.service_name || ' es el ' || v_when || '.';
    ELSE
      v_title := 'Aviso de cita';
      v_body  := 'Cita con ' || r.client_name || ' (' || r."reliabilityStatus" || ') el ' || v_when || '.';
    END IF;

    IF r."channel" = 'PUSH' THEN
      IF r."pushToken" IS NOT NULL AND r."kind" = 'CLIENT_REMINDER' THEN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          body := jsonb_build_object('to', r."pushToken", 'title', v_title, 'body', v_body, 'sound', 'default'),
          headers := jsonb_build_object('Content-Type', 'application/json')
        );
        UPDATE "Reminder" SET "status" = 'SENT', "sentAt" = now() WHERE "id" = r.reminder_id;
        n := n + 1;
      ELSE
        -- push reminder but no device token (or barber pre-warning): nothing to send
        UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "id" = r.reminder_id;
      END IF;
    ELSE
      UPDATE "Reminder"
        SET "status" = 'FAILED', "error" = 'Sin proveedor HTTP configurado para ' || r."channel"
        WHERE "id" = r.reminder_id;
    END IF;
  END LOOP;

  RETURN n;
END;
$$;

-- Run every 5 minutes. (On hosted Supabase, enable pg_cron/pg_net from the
-- dashboard if this migration can't create them.)
SELECT cron.schedule('dispatch-reminders', '*/5 * * * *', $$SELECT public.dispatch_due_reminders();$$);

-- ==== 20260711150000_owner_book ====
-- Owner-side booking: authenticated owner books for an existing client,
-- reusing the same validation + reminder scheduling as public/client booking.
CREATE OR REPLACE FUNCTION public.owner_book(
  p_staff_id TEXT, p_client_id TEXT, p_service_id TEXT, p_start TIMESTAMPTZ, p_notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; appt "Appointment"%ROWTYPE; BEGIN
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Client" WHERE "id" = p_client_id AND "barberId" = v_barber) THEN
    RAISE EXCEPTION 'CLIENT_NOT_FOUND';
  END IF;
  appt := public._create_appointment(v_barber, p_staff_id, p_client_id, p_service_id, p_start, p_notes);
  RETURN to_jsonb(appt);
END; $$;

GRANT EXECUTE ON FUNCTION public.owner_book(TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) TO authenticated;

-- ==== 20260711160000_grants ====
-- Table privileges for the API roles. RLS still gates WHICH rows each role
-- sees; these GRANTs are the base privilege the policies build on.
--   * authenticated (the owner): direct CRUD, scoped by the owner_* policies.
--   * service_role: full access for admin scripts / setup.
--   * anon: NO direct table access — it only calls the SECURITY DEFINER RPCs
--     (public_* / client_*), which already have EXECUTE grants.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- Keep future tables working too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

-- ==== 20260711170000_booking_hardening ====
-- =============================================================================
-- Security/correctness hardening (from the audit)
-- 1) Race condition: booking used check-then-insert with no lock, so two
--    concurrent requests could both pass the overlap check and double-book.
--    Add a real DB-level exclusion constraint so overlaps are impossible.
-- 2) public_book (guest booking, no auth) upserted the client by phone and
--    overwrote name/email. That let anyone who knows a registered client's
--    phone rewrite their name. Never touch a registered client's record.
-- =============================================================================

-- 1) No two live appointments for the same staff can overlap in time.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_overlap"
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startTime", "endTime") WITH &&
  ) WHERE ("status" <> 'CANCELLED' AND "status" <> 'NO_SHOW');

-- Turn a race that slips past _assert_bookable into a clean SLOT_TAKEN error.
CREATE OR REPLACE FUNCTION public._create_appointment(
  p_barber_id TEXT, p_staff_id TEXT, p_client_id TEXT, p_service_id TEXT,
  p_start TIMESTAMPTZ, p_notes TEXT DEFAULT NULL
) RETURNS "Appointment" LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dur INT;
  p_end TIMESTAMPTZ;
  appt "Appointment"%ROWTYPE;
BEGIN
  SELECT "durationMinutes" INTO dur FROM "Service" WHERE "id" = p_service_id AND "barberId" = p_barber_id AND "active";
  IF dur IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Staff" WHERE "id" = p_staff_id AND "barberId" = p_barber_id AND "active") THEN
    RAISE EXCEPTION 'STAFF_NOT_FOUND';
  END IF;

  p_end := p_start + make_interval(mins => dur);
  PERFORM public._assert_bookable(p_staff_id, p_start, p_end);

  BEGIN
    INSERT INTO "Appointment"("barberId","staffId","clientId","serviceId","startTime","endTime","status","notes")
    VALUES (p_barber_id, p_staff_id, p_client_id, p_service_id, p_start, p_end, 'PENDING', p_notes)
    RETURNING * INTO appt;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING HINT = 'Ese hueco se solapa con otra cita';
  END;

  UPDATE "Client" SET "totalAppointments" = "totalAppointments" + 1 WHERE "id" = p_client_id;
  PERFORM public._schedule_reminders(appt."id");
  RETURN appt;
END;
$$;

-- 2) Guest booking must not rewrite a client who already has an account, and
-- must never clobber an existing email.
CREATE OR REPLACE FUNCTION public.public_book(
  p_slug TEXT, p_staff_id TEXT, p_service_id TEXT, p_start TIMESTAMPTZ,
  p_client_name TEXT, p_client_phone TEXT, p_client_email TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_client TEXT; appt "Appointment"%ROWTYPE; BEGIN
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  IF v_barber IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;

  INSERT INTO "Client"("barberId","name","phone","email") VALUES (v_barber, p_client_name, p_client_phone, p_client_email)
  ON CONFLICT ("barberId","phone") DO UPDATE SET
    -- only update the name of a walk-in without an account; never a registered one
    "name"  = CASE WHEN "Client"."passwordHash" IS NULL THEN EXCLUDED."name" ELSE "Client"."name" END,
    -- only fill an empty email; never overwrite an existing one
    "email" = COALESCE("Client"."email", EXCLUDED."email")
  RETURNING "id" INTO v_client;

  appt := public._create_appointment(v_barber, p_staff_id, v_client, p_service_id, p_start, p_notes);
  RETURN to_jsonb(appt);
END; $$;

-- ==== 20260720000000_unified_auth ====
-- =============================================================================
-- Unified auth: everyone logs in with email + password via Supabase Auth, and
-- a role (admin | client) is derived from the DB. Removes the phone+token
-- client login (ClientSession + token RPCs) in favour of Supabase Auth users
-- linked to a Client row. Guest (no-account) public booking is unchanged.
-- =============================================================================

-- Link a client account to a Supabase Auth user.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "authUserId" UUID UNIQUE REFERENCES auth.users("id") ON DELETE SET NULL;

-- Drop the old token-based client auth (replaced by Supabase Auth).
DROP FUNCTION IF EXISTS public.client_register(TEXT,TEXT,TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.client_login(TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.client_my_appointments(TEXT);
DROP FUNCTION IF EXISTS public.client_book(TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT);
DROP FUNCTION IF EXISTS public.client_cancel(TEXT,TEXT);
DROP FUNCTION IF EXISTS public.client_set_push_token(TEXT,TEXT);
DROP FUNCTION IF EXISTS public.client_delete_account(TEXT,TEXT);
DROP FUNCTION IF EXISTS public._client_from_token(TEXT);
DROP TABLE IF EXISTS "ClientSession";

-- The Client id owned by the currently authenticated user (null for owners).
CREATE OR REPLACE FUNCTION public.current_client_id() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT "id" FROM "Client" WHERE "authUserId" = auth.uid() LIMIT 1;
$$;

-- Role + profile of the logged-in user. The app calls this right after login
-- and routes to the barber UI or the client UI based on `role`.
CREATE OR REPLACE FUNCTION public.me() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b "Barber"%ROWTYPE; c "Client"%ROWTYPE; BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('role', null); END IF;
  SELECT * INTO b FROM "Barber" WHERE "authUserId" = auth.uid();
  IF FOUND THEN
    RETURN jsonb_build_object('role','admin','profile',
      jsonb_build_object('id',b."id",'businessName',b."businessName",'slug',b."slug",'ownerName',b."ownerName",'email',b."email",'phone',b."phone"));
  END IF;
  SELECT * INTO c FROM "Client" WHERE "authUserId" = auth.uid();
  IF FOUND THEN
    RETURN jsonb_build_object('role','client','profile',
      jsonb_build_object('id',c."id",'name',c."name",'phone',c."phone",'email',c."email"));
  END IF;
  RETURN jsonb_build_object('role', null);
END; $$;

-- Client signup: called right after supabase.auth.signUp, using the new
-- session. Links this auth user to a Client row for the business — claiming an
-- existing walk-in record with the same phone if it has no account yet.
CREATE OR REPLACE FUNCTION public.client_signup(p_slug TEXT, p_name TEXT, p_phone TEXT, p_email TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; existing "Client"%ROWTYPE; v_client TEXT; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  IF v_barber IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;

  -- already linked? just return it
  SELECT * INTO existing FROM "Client" WHERE "authUserId" = auth.uid();
  IF FOUND THEN RETURN public._client_json(existing."id"); END IF;

  SELECT * INTO existing FROM "Client" WHERE "barberId" = v_barber AND "phone" = p_phone;
  IF FOUND THEN
    IF existing."authUserId" IS NOT NULL THEN RAISE EXCEPTION 'PHONE_TAKEN'; END IF;
    UPDATE "Client" SET "authUserId" = auth.uid(), "name" = p_name,
      "email" = COALESCE(p_email, "email") WHERE "id" = existing."id" RETURNING "id" INTO v_client;
  ELSE
    INSERT INTO "Client"("barberId","name","phone","email","authUserId")
    VALUES (v_barber, p_name, p_phone, p_email, auth.uid()) RETURNING "id" INTO v_client;
  END IF;
  RETURN public._client_json(v_client);
END; $$;

-- Client self-service, now keyed on the Supabase session (no token param).
CREATE OR REPLACE FUNCTION public.client_my_appointments()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client TEXT; BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',a."id",'startTime',a."startTime",'endTime',a."endTime",'status',a."status",'notes',a."notes",
      'service', jsonb_build_object('id',sv."id",'name',sv."name",'durationMinutes',sv."durationMinutes",'priceCents',sv."priceCents"),
      'staff', jsonb_build_object('id',st."id",'name',st."name",'color',st."color")
    ) ORDER BY a."startTime" DESC)
    FROM "Appointment" a JOIN "Service" sv ON sv."id"=a."serviceId" JOIN "Staff" st ON st."id"=a."staffId"
    WHERE a."clientId" = v_client), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.client_book(p_staff_id TEXT, p_service_id TEXT, p_start TIMESTAMPTZ, p_notes TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client TEXT; v_barber TEXT; appt "Appointment"%ROWTYPE; BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT "barberId" INTO v_barber FROM "Client" WHERE "id" = v_client;
  appt := public._create_appointment(v_barber, p_staff_id, v_client, p_service_id, p_start, p_notes);
  RETURN to_jsonb(appt);
END; $$;

CREATE OR REPLACE FUNCTION public.client_cancel(p_appointment_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client TEXT; appt "Appointment"%ROWTYPE; BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO appt FROM "Appointment" WHERE "id" = p_appointment_id AND "clientId" = v_client;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF appt."status" IN ('CANCELLED','COMPLETED','NO_SHOW') THEN RAISE EXCEPTION 'NOT_CANCELLABLE'; END IF;
  UPDATE "Appointment" SET "status" = 'CANCELLED' WHERE "id" = p_appointment_id RETURNING * INTO appt;
  RETURN to_jsonb(appt);
END; $$;

CREATE OR REPLACE FUNCTION public.client_set_push_token(p_push_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client TEXT; BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  UPDATE "Client" SET "pushToken" = p_push_token WHERE "id" = v_client;
END; $$;

-- In-app account deletion (Apple 5.1.1): wipes the client's data AND the auth
-- user, so nothing lingers.
CREATE OR REPLACE FUNCTION public.client_delete_account()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client TEXT; v_uid UUID; BEGIN
  v_uid := auth.uid();
  v_client := public.current_client_id();
  IF v_client IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  DELETE FROM "Client" WHERE "id" = v_client;
  DELETE FROM auth.users WHERE "id" = v_uid;
END; $$;

GRANT EXECUTE ON FUNCTION
  public.me(),
  public.client_signup(TEXT,TEXT,TEXT,TEXT),
  public.client_my_appointments(),
  public.client_book(TEXT,TEXT,TIMESTAMPTZ,TEXT),
  public.client_cancel(TEXT),
  public.client_set_push_token(TEXT),
  public.client_delete_account()
TO authenticated;

-- ==== 20260721000000_invites_magic_link ====
-- =============================================================================
-- Invitaciones y enlace mágico (todo con el email nativo de Supabase Auth).
-- Cuando un cliente acepta la invitación o entra con un enlace mágico, Supabase
-- crea su usuario de Auth. Este trigger vincula ese usuario con la ficha de
-- Client que ya existía (creada por el dueño) emparejando por email — así el
-- cliente ve directamente su historial de citas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE "Client"
     SET "authUserId" = NEW."id"
   WHERE "authUserId" IS NULL
     AND lower("email") = lower(NEW."email");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.client_complete_profile(p_slug TEXT, p_name TEXT, p_phone TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_email TEXT; existing "Client"%ROWTYPE; v_client TEXT; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  IF v_barber IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO existing FROM "Client" WHERE "authUserId" = auth.uid();
  IF FOUND THEN RETURN public._client_json(existing."id"); END IF;

  SELECT * INTO existing FROM "Client" WHERE "barberId" = v_barber AND "phone" = p_phone;
  IF FOUND THEN
    IF existing."authUserId" IS NOT NULL THEN RAISE EXCEPTION 'PHONE_TAKEN'; END IF;
    UPDATE "Client" SET "authUserId" = auth.uid(), "name" = p_name, "email" = COALESCE("email", v_email)
      WHERE "id" = existing."id" RETURNING "id" INTO v_client;
  ELSE
    INSERT INTO "Client"("barberId","name","phone","email","authUserId")
    VALUES (v_barber, p_name, p_phone, v_email, auth.uid()) RETURNING "id" INTO v_client;
  END IF;
  RETURN public._client_json(v_client);
END; $$;

GRANT EXECUTE ON FUNCTION public.client_complete_profile(TEXT,TEXT,TEXT) TO authenticated;

-- ==== 20260722000000_billing_stats_loyalty ====
-- =============================================================================
-- Booksy-parity modules (fase 15):
--   1) Facturación + estadísticas — RPCs de solo lectura para el dueño con
--      ingresos, servicios más pedidos, ausencias y facturas por cita.
--   2) Fidelización + perfil/QR — tarjeta de puntos por visitas completadas,
--      perfil público del negocio (bio, dirección, Instagram, foto) y datos de
--      fidelización expuestos también en la página pública de reservas.
-- Todo es Supabase nativo: columnas nuevas + funciones SECURITY DEFINER. Los
-- importes se calculan sobre citas COMPLETED usando el precio del servicio.
-- Las fechas se interpretan en la zona horaria del negocio (Europe/Madrid).
-- =============================================================================

-- ---- 1. Perfil público + configuración de fidelización ----------------------
ALTER TABLE "Barber" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "Barber" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Barber" ADD COLUMN IF NOT EXISTS "instagram" TEXT;
ALTER TABLE "Barber" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE "Barber" ADD COLUMN IF NOT EXISTS "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Barber" ADD COLUMN IF NOT EXISTS "loyaltyThreshold" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Barber" ADD COLUMN IF NOT EXISTS "loyaltyReward" TEXT NOT NULL DEFAULT 'Un servicio gratis';

-- me() ahora devuelve también el perfil y la configuración de fidelización, de
-- modo que el panel del dueño los pueda editar.
CREATE OR REPLACE FUNCTION public.me() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b "Barber"%ROWTYPE; c "Client"%ROWTYPE; BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('role', null); END IF;
  SELECT * INTO b FROM "Barber" WHERE "authUserId" = auth.uid();
  IF FOUND THEN
    RETURN jsonb_build_object('role','admin','profile',
      jsonb_build_object('id',b."id",'businessName',b."businessName",'slug',b."slug",'ownerName',b."ownerName",
        'email',b."email",'phone',b."phone",'bio',b."bio",'address',b."address",'instagram',b."instagram",
        'photoUrl',b."photoUrl",'loyaltyEnabled',b."loyaltyEnabled",'loyaltyThreshold',b."loyaltyThreshold",
        'loyaltyReward',b."loyaltyReward"));
  END IF;
  SELECT * INTO c FROM "Client" WHERE "authUserId" = auth.uid();
  IF FOUND THEN
    RETURN jsonb_build_object('role','client','profile',
      jsonb_build_object('id',c."id",'name',c."name",'phone',c."phone",'email',c."email"));
  END IF;
  RETURN jsonb_build_object('role', null);
END; $$;

-- La página pública muestra el perfil del negocio y, si la fidelización está
-- activa, cuántas visitas dan premio.
CREATE OR REPLACE FUNCTION public.public_business(p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b "Barber"%ROWTYPE; BEGIN
  SELECT * INTO b FROM "Barber" WHERE "slug" = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;
  RETURN jsonb_build_object(
    'barber', jsonb_build_object('businessName', b."businessName", 'slug', b."slug", 'phone', b."phone",
      'bio', b."bio", 'address', b."address", 'instagram', b."instagram", 'photoUrl', b."photoUrl",
      'loyaltyEnabled', b."loyaltyEnabled", 'loyaltyThreshold', b."loyaltyThreshold", 'loyaltyReward', b."loyaltyReward"),
    'services', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s."id",'name',s."name",'durationMinutes',s."durationMinutes",'priceCents',s."priceCents") ORDER BY s."createdAt")
                          FROM "Service" s WHERE s."barberId"=b."id" AND s."active"), '[]'::jsonb),
    'staff', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',st."id",'name',st."name",'color',st."color") ORDER BY st."createdAt")
                       FROM "Staff" st WHERE st."barberId"=b."id" AND st."active"), '[]'::jsonb)
  );
END; $$;

-- ---- 2. Facturación + estadísticas ------------------------------------------
-- Resumen para un rango de fechas [p_from, p_to] (ambos inclusive, por día en
-- hora local). Ingresos = suma de precios de las citas COMPLETED.
CREATE OR REPLACE FUNCTION public.owner_stats(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_lo TIMESTAMPTZ; v_hi TIMESTAMPTZ; BEGIN
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  -- Límites del rango convertidos desde días locales a instantes UTC.
  v_lo := (p_from::timestamp) AT TIME ZONE 'Europe/Madrid';
  v_hi := ((p_to + 1)::timestamp) AT TIME ZONE 'Europe/Madrid';

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', (
      SELECT jsonb_build_object(
        'revenueCents', COALESCE(SUM(sv."priceCents") FILTER (WHERE a."status" = 'COMPLETED'), 0),
        'completed', COUNT(*) FILTER (WHERE a."status" = 'COMPLETED'),
        'noShow', COUNT(*) FILTER (WHERE a."status" = 'NO_SHOW'),
        'cancelled', COUNT(*) FILTER (WHERE a."status" = 'CANCELLED'),
        'upcoming', COUNT(*) FILTER (WHERE a."status" IN ('PENDING','CONFIRMED')),
        'total', COUNT(*)
      )
      FROM "Appointment" a JOIN "Service" sv ON sv."id" = a."serviceId"
      WHERE a."barberId" = v_barber AND a."startTime" >= v_lo AND a."startTime" < v_hi
    ),
    'byDay', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'revenueCents', rev, 'completed', cnt) ORDER BY d)
      FROM (
        SELECT (a."startTime" AT TIME ZONE 'Europe/Madrid')::date AS d,
               SUM(sv."priceCents") AS rev, COUNT(*) AS cnt
        FROM "Appointment" a JOIN "Service" sv ON sv."id" = a."serviceId"
        WHERE a."barberId" = v_barber AND a."status" = 'COMPLETED'
          AND a."startTime" >= v_lo AND a."startTime" < v_hi
        GROUP BY 1
      ) t
    ), '[]'::jsonb),
    'byStaff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('staffId', st."id", 'name', st."name", 'color', st."color",
                                          'revenueCents', rev, 'completed', cnt) ORDER BY rev DESC)
      FROM (
        SELECT a."staffId" AS sid, SUM(sv."priceCents") AS rev, COUNT(*) AS cnt
        FROM "Appointment" a JOIN "Service" sv ON sv."id" = a."serviceId"
        WHERE a."barberId" = v_barber AND a."status" = 'COMPLETED'
          AND a."startTime" >= v_lo AND a."startTime" < v_hi
        GROUP BY 1
      ) t JOIN "Staff" st ON st."id" = t.sid
    ), '[]'::jsonb),
    'topServices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('serviceId', sv."id", 'name', sv."name",
                                          'revenueCents', rev, 'completed', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT a."serviceId" AS svid, SUM(sv0."priceCents") AS rev, COUNT(*) AS cnt
        FROM "Appointment" a JOIN "Service" sv0 ON sv0."id" = a."serviceId"
        WHERE a."barberId" = v_barber AND a."status" = 'COMPLETED'
          AND a."startTime" >= v_lo AND a."startTime" < v_hi
        GROUP BY 1
      ) t JOIN "Service" sv ON sv."id" = t.svid
    ), '[]'::jsonb)
  );
END; $$;

-- Facturas: una fila por cita COMPLETED del rango, lista para exportar.
CREATE OR REPLACE FUNCTION public.owner_invoices(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_lo TIMESTAMPTZ; v_hi TIMESTAMPTZ; BEGIN
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_lo := (p_from::timestamp) AT TIME ZONE 'Europe/Madrid';
  v_hi := ((p_to + 1)::timestamp) AT TIME ZONE 'Europe/Madrid';
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a."id", 'date', a."startTime", 'clientName', c."name", 'clientPhone', c."phone",
      'serviceName', sv."name", 'staffName', st."name", 'priceCents', sv."priceCents"
    ) ORDER BY a."startTime" DESC)
    FROM "Appointment" a
    JOIN "Service" sv ON sv."id" = a."serviceId"
    JOIN "Client" c ON c."id" = a."clientId"
    JOIN "Staff" st ON st."id" = a."staffId"
    WHERE a."barberId" = v_barber AND a."status" = 'COMPLETED'
      AND a."startTime" >= v_lo AND a."startTime" < v_hi
  ), '[]'::jsonb);
END; $$;

-- ---- 3. Fidelización --------------------------------------------------------
-- Vista de fidelización: cada cliente con sus visitas completadas, cuántos
-- premios ha ganado y cuántas visitas le faltan para el siguiente.
CREATE OR REPLACE FUNCTION public.owner_loyalty()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_threshold INT; BEGIN
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT GREATEST("loyaltyThreshold", 1) INTO v_threshold FROM "Barber" WHERE "id" = v_barber;
  RETURN jsonb_build_object(
    'threshold', v_threshold,
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c."id", 'name', c."name", 'phone', c."phone",
        'completedCount', c."completedCount",
        'rewardsEarned', (c."completedCount" / v_threshold),
        'progress', (c."completedCount" % v_threshold),
        'toNext', (v_threshold - (c."completedCount" % v_threshold))
      ) ORDER BY c."completedCount" DESC)
      FROM "Client" c WHERE c."barberId" = v_barber AND c."completedCount" > 0
    ), '[]'::jsonb)
  );
END; $$;

GRANT EXECUTE ON FUNCTION
  public.owner_stats(DATE, DATE),
  public.owner_invoices(DATE, DATE),
  public.owner_loyalty()
TO authenticated;

-- ==== 20260723000000_payment_method ====
-- =============================================================================
-- Método de pago (fase 16): al completar una cita el dueño indica si el cliente
-- pagó en EFECTIVO o con TARJETA. Se guarda en la cita y la facturación lo
-- desglosa. Aditivo y no destructivo.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod";

-- Completar una cita registrando el método de pago en una sola operación.
-- (El dueño también podría hacerlo con un UPDATE directo por RLS, pero este RPC
-- valida el método y deja el código de la app más claro.)
CREATE OR REPLACE FUNCTION public.owner_complete_appointment(p_id TEXT, p_method TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; appt "Appointment"%ROWTYPE; v_method "PaymentMethod"; BEGIN
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_method IS NOT NULL THEN v_method := p_method::"PaymentMethod"; END IF;
  UPDATE "Appointment" SET "status" = 'COMPLETED', "paymentMethod" = v_method
    WHERE "id" = p_id AND "barberId" = v_barber
    RETURNING * INTO appt;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN to_jsonb(appt);
END; $$;

-- Estadísticas: añade el desglose por método de pago a los totales.
CREATE OR REPLACE FUNCTION public.owner_stats(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_lo TIMESTAMPTZ; v_hi TIMESTAMPTZ; BEGIN
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_lo := (p_from::timestamp) AT TIME ZONE 'Europe/Madrid';
  v_hi := ((p_to + 1)::timestamp) AT TIME ZONE 'Europe/Madrid';

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', (
      SELECT jsonb_build_object(
        'revenueCents', COALESCE(SUM(sv."priceCents") FILTER (WHERE a."status" = 'COMPLETED'), 0),
        'revenueCashCents', COALESCE(SUM(sv."priceCents") FILTER (WHERE a."status" = 'COMPLETED' AND a."paymentMethod" = 'CASH'), 0),
        'revenueCardCents', COALESCE(SUM(sv."priceCents") FILTER (WHERE a."status" = 'COMPLETED' AND a."paymentMethod" = 'CARD'), 0),
        'completed', COUNT(*) FILTER (WHERE a."status" = 'COMPLETED'),
        'noShow', COUNT(*) FILTER (WHERE a."status" = 'NO_SHOW'),
        'cancelled', COUNT(*) FILTER (WHERE a."status" = 'CANCELLED'),
        'upcoming', COUNT(*) FILTER (WHERE a."status" IN ('PENDING','CONFIRMED')),
        'total', COUNT(*)
      )
      FROM "Appointment" a JOIN "Service" sv ON sv."id" = a."serviceId"
      WHERE a."barberId" = v_barber AND a."startTime" >= v_lo AND a."startTime" < v_hi
    ),
    'byDay', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'revenueCents', rev, 'completed', cnt) ORDER BY d)
      FROM (
        SELECT (a."startTime" AT TIME ZONE 'Europe/Madrid')::date AS d,
               SUM(sv."priceCents") AS rev, COUNT(*) AS cnt
        FROM "Appointment" a JOIN "Service" sv ON sv."id" = a."serviceId"
        WHERE a."barberId" = v_barber AND a."status" = 'COMPLETED'
          AND a."startTime" >= v_lo AND a."startTime" < v_hi
        GROUP BY 1
      ) t
    ), '[]'::jsonb),
    'byStaff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('staffId', st."id", 'name', st."name", 'color', st."color",
                                          'revenueCents', rev, 'completed', cnt) ORDER BY rev DESC)
      FROM (
        SELECT a."staffId" AS sid, SUM(sv."priceCents") AS rev, COUNT(*) AS cnt
        FROM "Appointment" a JOIN "Service" sv ON sv."id" = a."serviceId"
        WHERE a."barberId" = v_barber AND a."status" = 'COMPLETED'
          AND a."startTime" >= v_lo AND a."startTime" < v_hi
        GROUP BY 1
      ) t JOIN "Staff" st ON st."id" = t.sid
    ), '[]'::jsonb),
    'topServices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('serviceId', sv."id", 'name', sv."name",
                                          'revenueCents', rev, 'completed', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT a."serviceId" AS svid, SUM(sv0."priceCents") AS rev, COUNT(*) AS cnt
        FROM "Appointment" a JOIN "Service" sv0 ON sv0."id" = a."serviceId"
        WHERE a."barberId" = v_barber AND a."status" = 'COMPLETED'
          AND a."startTime" >= v_lo AND a."startTime" < v_hi
        GROUP BY 1
      ) t JOIN "Service" sv ON sv."id" = t.svid
    ), '[]'::jsonb)
  );
END; $$;

-- Facturas: incluye el método de pago de cada cita.
CREATE OR REPLACE FUNCTION public.owner_invoices(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_lo TIMESTAMPTZ; v_hi TIMESTAMPTZ; BEGIN
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_lo := (p_from::timestamp) AT TIME ZONE 'Europe/Madrid';
  v_hi := ((p_to + 1)::timestamp) AT TIME ZONE 'Europe/Madrid';
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a."id", 'date', a."startTime", 'clientName', c."name", 'clientPhone', c."phone",
      'serviceName', sv."name", 'staffName', st."name", 'priceCents', sv."priceCents",
      'paymentMethod', a."paymentMethod"
    ) ORDER BY a."startTime" DESC)
    FROM "Appointment" a
    JOIN "Service" sv ON sv."id" = a."serviceId"
    JOIN "Client" c ON c."id" = a."clientId"
    JOIN "Staff" st ON st."id" = a."staffId"
    WHERE a."barberId" = v_barber AND a."status" = 'COMPLETED'
      AND a."startTime" >= v_lo AND a."startTime" < v_hi
  ), '[]'::jsonb);
END; $$;

GRANT EXECUTE ON FUNCTION public.owner_complete_appointment(TEXT, TEXT) TO authenticated;

-- ==== 20260724000000_reschedule ====
-- =============================================================================
-- Reprogramar / editar una cita desde el panel del dueño (fase 17).
-- Cuando un cliente llama para cambiar su cita, el dueño puede moverla de hora,
-- fecha, barbero o servicio sin borrarla y volver a crearla. Revalida horario y
-- solapes (excluyendo la propia cita) y reprograma los recordatorios.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.owner_reschedule(
  p_id TEXT, p_staff_id TEXT, p_service_id TEXT, p_start TIMESTAMPTZ, p_notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_barber TEXT; v_dur INT; v_end TIMESTAMPTZ; appt "Appointment"%ROWTYPE;
  d_start DATE; d_end DATE; m_start INT; m_end INT; dow INT;
BEGIN
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO appt FROM "Appointment" WHERE "id" = p_id AND "barberId" = v_barber;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF appt."status" IN ('CANCELLED','NO_SHOW','COMPLETED') THEN
    RAISE EXCEPTION 'NOT_EDITABLE' USING HINT = 'Solo se pueden mover citas pendientes o confirmadas';
  END IF;

  SELECT "durationMinutes" INTO v_dur FROM "Service" WHERE "id" = p_service_id AND "barberId" = v_barber AND "active";
  IF v_dur IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Staff" WHERE "id" = p_staff_id AND "barberId" = v_barber AND "active") THEN
    RAISE EXCEPTION 'STAFF_NOT_FOUND';
  END IF;

  v_end := p_start + make_interval(mins => v_dur);

  -- Horario del barbero + que no cruce medianoche (como _assert_bookable).
  d_start := (p_start AT TIME ZONE 'Europe/Madrid')::date;
  d_end   := (v_end   AT TIME ZONE 'Europe/Madrid')::date;
  m_start := EXTRACT(HOUR FROM (p_start AT TIME ZONE 'Europe/Madrid')) * 60 + EXTRACT(MINUTE FROM (p_start AT TIME ZONE 'Europe/Madrid'));
  m_end   := EXTRACT(HOUR FROM (v_end   AT TIME ZONE 'Europe/Madrid')) * 60 + EXTRACT(MINUTE FROM (v_end   AT TIME ZONE 'Europe/Madrid'));
  dow     := EXTRACT(DOW FROM (p_start AT TIME ZONE 'Europe/Madrid'))::int;
  IF d_start <> d_end THEN
    RAISE EXCEPTION 'OUTSIDE_HOURS' USING HINT = 'La cita cruza la medianoche';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "StaffWorkingHours" wh
    WHERE wh."staffId" = p_staff_id AND wh."dayOfWeek" = dow
      AND m_start >= wh."startMinute" AND m_end <= wh."endMinute"
  ) THEN
    RAISE EXCEPTION 'OUTSIDE_HOURS' USING HINT = 'Fuera del horario del barbero';
  END IF;

  -- Solape con otras citas vivas (excluyendo esta misma).
  IF EXISTS (
    SELECT 1 FROM "Appointment" a
    WHERE a."id" <> p_id AND a."staffId" = p_staff_id
      AND a."status" NOT IN ('CANCELLED','NO_SHOW')
      AND a."startTime" < v_end AND a."endTime" > p_start
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING HINT = 'Ese hueco se solapa con otra cita';
  END IF;

  UPDATE "Appointment"
     SET "staffId" = p_staff_id, "serviceId" = p_service_id,
         "startTime" = p_start, "endTime" = v_end, "notes" = p_notes
   WHERE "id" = p_id
   RETURNING * INTO appt;

  PERFORM public._schedule_reminders(p_id);  -- cancela los antiguos y crea los nuevos
  RETURN to_jsonb(appt);
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'SLOT_TAKEN' USING HINT = 'Ese hueco se solapa con otra cita';
END; $$;

GRANT EXECUTE ON FUNCTION public.owner_reschedule(TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) TO authenticated;

-- ==== 20260725000000_fix_public_book_guard ====
-- =============================================================================
-- Fix de seguridad (auditoría): public_book protegía el nombre de un cliente
-- "registrado" comprobando "passwordHash" IS NULL, pero desde la migración de
-- auth unificada (20260720000000) el registro real ya no usa passwordHash sino
-- "authUserId" — passwordHash quedó huérfano y siempre NULL para cualquiera
-- que se registrase por el flujo actual. Resultado: cualquier persona anónima
-- que conociera el teléfono de un cliente registrado podía sobrescribir su
-- nombre llamando a public_book sin autenticarse. Verificado y reproducido
-- contra una base de datos real antes de este fix.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.public_book(
  p_slug TEXT, p_staff_id TEXT, p_service_id TEXT, p_start TIMESTAMPTZ,
  p_client_name TEXT, p_client_phone TEXT, p_client_email TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_client TEXT; appt "Appointment"%ROWTYPE; BEGIN
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  IF v_barber IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;

  INSERT INTO "Client"("barberId","name","phone","email") VALUES (v_barber, p_client_name, p_client_phone, p_client_email)
  ON CONFLICT ("barberId","phone") DO UPDATE SET
    -- solo se actualiza el nombre de un cliente "walk-in" sin cuenta; nunca el
    -- de uno con cuenta registrada (comprobado por authUserId, no passwordHash).
    "name"  = CASE WHEN "Client"."authUserId" IS NULL THEN EXCLUDED."name" ELSE "Client"."name" END,
    -- solo rellena un email vacío; nunca sobrescribe uno existente.
    "email" = COALESCE("Client"."email", EXCLUDED."email")
  RETURNING "id" INTO v_client;

  appt := public._create_appointment(v_barber, p_staff_id, v_client, p_service_id, p_start, p_notes);
  RETURN to_jsonb(appt);
END; $$;

-- Limpieza (minimización de datos): passwordHash quedó sin uso — ninguna
-- función activa lo escribe desde la auth unificada, y las que lo hacían
-- (client_register/client_login) ya se eliminaron. Si un cliente se registró
-- con el sistema antiguo antes de esa migración, este DROP borra ese hash
-- huérfano, que ya no protege nada.
ALTER TABLE "Client" DROP COLUMN IF EXISTS "passwordHash";

-- ==== 20260726000000_fix_status_counters ====
-- =============================================================================
-- Fix (auditoría): el trigger de fiabilidad solo SUMABA contadores al ENTRAR en
-- un estado (COMPLETED/NO_SHOW/cancelación tardía) pero nunca los restaba al
-- SALIR de él. Si el dueño corregía una cita mal marcada (p.ej. "Completada"
-- por error → "No presentado"), el cliente se quedaba con un completedCount
-- inflado para siempre (afecta a la fidelización) y/o con noShowCount duplicado
-- si la cita oscilaba entre estados. Ahora el ajuste es simétrico: se resta al
-- salir de un estado y se suma al entrar, y la fiabilidad se recalcula siempre
-- que cambia el estado (no solo al entrar en CANCELLED/NO_SHOW), para que
-- también mejore si una corrección reduce las incidencias.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._on_appointment_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_risky INT; s_watch INT; s_late INT;
  notice_hours DOUBLE PRECISION;
  new_no_show INT; new_late INT; new_status "ReliabilityStatus"; strikes INT;
  was_late_cancel BOOLEAN;
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;

  SELECT "riskyThreshold", "watchThreshold", "lateCancelThresholdHours"
    INTO s_risky, s_watch, s_late
    FROM "NotificationSettings" WHERE "barberId" = NEW."barberId";
  s_risky := COALESCE(s_risky, 2); s_watch := COALESCE(s_watch, 1); s_late := COALESCE(s_late, 4);

  -- ---- Salir del estado anterior: revertir lo que sumó en su momento -------
  IF OLD."status" = 'NO_SHOW' THEN
    UPDATE "Client" SET "noShowCount" = GREATEST("noShowCount" - 1, 0) WHERE "id" = NEW."clientId";
  ELSIF OLD."status" = 'COMPLETED' THEN
    UPDATE "Client" SET "completedCount" = GREATEST("completedCount" - 1, 0) WHERE "id" = NEW."clientId";
  ELSIF OLD."status" = 'CANCELLED' THEN
    -- Se guardó como tardía en su momento si cancelNoticeHours quedó por debajo
    -- del umbral vigente entonces; lo usamos tal cual para revertir esa cuenta.
    was_late_cancel := OLD."cancelNoticeHours" IS NOT NULL AND OLD."cancelNoticeHours" < s_late;
    IF was_late_cancel THEN
      UPDATE "Client" SET "lateCancelCount" = GREATEST("lateCancelCount" - 1, 0) WHERE "id" = NEW."clientId";
    END IF;
  END IF;

  -- ---- Entrar en el nuevo estado --------------------------------------------
  IF NEW."status" = 'CANCELLED' THEN
    NEW."cancelledAt" := now();
    notice_hours := GREATEST(0, EXTRACT(EPOCH FROM (NEW."startTime" - now())) / 3600.0);
    NEW."cancelNoticeHours" := notice_hours;
    IF notice_hours < s_late THEN
      UPDATE "Client" SET "lateCancelCount" = "lateCancelCount" + 1 WHERE "id" = NEW."clientId";
    END IF;
  ELSIF NEW."status" = 'NO_SHOW' THEN
    UPDATE "Client" SET "noShowCount" = "noShowCount" + 1 WHERE "id" = NEW."clientId";
  ELSIF NEW."status" = 'COMPLETED' THEN
    UPDATE "Client" SET "completedCount" = "completedCount" + 1 WHERE "id" = NEW."clientId";
  END IF;

  IF NEW."status" IN ('CANCELLED', 'NO_SHOW') THEN
    -- Cancela cualquier recordatorio pendiente de una cita que ya no vaya a pasar.
    UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "appointmentId" = NEW."id" AND "status" = 'PENDING';
  END IF;

  -- ---- Fiabilidad: se recalcula siempre, para que también pueda mejorar ----
  SELECT "noShowCount", "lateCancelCount" INTO new_no_show, new_late FROM "Client" WHERE "id" = NEW."clientId";
  strikes := new_no_show + new_late;
  new_status := CASE WHEN strikes >= s_risky THEN 'RISKY'::"ReliabilityStatus"
                     WHEN strikes >= s_watch THEN 'WATCH'::"ReliabilityStatus"
                     ELSE 'RELIABLE'::"ReliabilityStatus" END;
  UPDATE "Client" SET "reliabilityStatus" = new_status WHERE "id" = NEW."clientId";

  RETURN NEW;
END;
$$;

-- ==== 20260727000000_security_fixes ====
-- =============================================================================
-- Fixes de seguridad (auditoría). Cuatro hallazgos, de más a menos grave:
--
-- C1 (CRÍTICO) — Auto-registro como dueño. La ruta /registro + el RPC
--   claim_business(slug) dejaban que CUALQUIER visitante que se registrase con
--   un email cualquiera se convirtiera en el admin del negocio, con tal de
--   llegar antes que el dueño real a su primer login. Se elimina el RPC por
--   completo; el alta del dueño pasa a hacerse solo por SQL (service_role),
--   como ya se documenta en el README.
--
-- C2 (CRÍTICO) — Robo de la ficha de un cliente por teléfono. client_signup y
--   client_complete_profile vinculaban una cuenta nueva a un cliente "walk-in"
--   ya existente con solo escribir su teléfono, sin demostrar que es suyo.
--   Ahora solo se vincula si el email YA guardado en esa ficha coincide con el
--   email verificado (por Supabase Auth) de quien se acaba de registrar; si no
--   coincide, se rechaza y se sugiere pedir una invitación al negocio (que sí
--   vincula por email, bajo control del dueño).
--
-- C3 (CRÍTICO, condicional a la config. del proyecto) — El trigger que vincula
--   un nuevo auth.users a su Client por email se disparaba en el INSERT, antes
--   de confirmar el correo. Ahora solo vincula si el email ya está confirmado,
--   y se añade un segundo trigger que reacciona cuando se confirma más tarde.
--
-- A1 (ALTO) — La policy de "Barber" era FOR ALL, así que cualquier usuario
--   autenticado podía INSERTAR su propia fila Barber (crear un negocio
--   fantasma). Se separa en SELECT/UPDATE únicamente; el alta sigue siendo
--   cosa de service_role.
--
-- M3 (MEDIO) — Al eliminar su cuenta, el dueño borraba su fila Barber pero no
--   su usuario de auth.users (a diferencia de client_delete_account, que sí lo
--   hacía). Se añade owner_delete_account() análogo.
-- =============================================================================

-- ---- C1: eliminar el auto-registro como dueño -------------------------------
DROP FUNCTION IF EXISTS public.claim_business(TEXT);

-- ---- A1: Barber ya no admite INSERT/DELETE desde el cliente -----------------
DROP POLICY IF EXISTS "owner_barber" ON "Barber";
CREATE POLICY "owner_barber_select" ON "Barber" FOR SELECT TO authenticated
  USING ("authUserId" = auth.uid());
CREATE POLICY "owner_barber_update" ON "Barber" FOR UPDATE TO authenticated
  USING ("authUserId" = auth.uid()) WITH CHECK ("authUserId" = auth.uid());

-- ---- C2: client_signup — vincular solo si el email verificado coincide -----
CREATE OR REPLACE FUNCTION public.client_signup(p_slug TEXT, p_name TEXT, p_phone TEXT, p_email TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; existing "Client"%ROWTYPE; v_client TEXT; v_auth_email TEXT; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  IF v_barber IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;

  -- ya vinculado? devolver directamente
  SELECT * INTO existing FROM "Client" WHERE "authUserId" = auth.uid();
  IF FOUND THEN RETURN public._client_json(existing."id"); END IF;

  SELECT "email" INTO v_auth_email FROM auth.users WHERE "id" = auth.uid();

  SELECT * INTO existing FROM "Client" WHERE "barberId" = v_barber AND "phone" = p_phone;
  IF FOUND THEN
    IF existing."authUserId" IS NOT NULL THEN RAISE EXCEPTION 'PHONE_TAKEN'; END IF;
    -- El teléfono solo no basta como prueba: cualquiera puede escribir el de
    -- otra persona. Solo se vincula si el email ya guardado en esa ficha
    -- coincide con el de la cuenta recién creada (verificado por Supabase Auth).
    IF existing."email" IS NOT NULL AND v_auth_email IS NOT NULL AND lower(existing."email") = lower(v_auth_email) THEN
      UPDATE "Client" SET "authUserId" = auth.uid(), "name" = p_name
        WHERE "id" = existing."id" RETURNING "id" INTO v_client;
    ELSE
      RAISE EXCEPTION 'PHONE_TAKEN'
        USING HINT = 'Ese teléfono ya tiene citas registradas. Pide al negocio que te envíe una invitación por email para recuperar tu historial.';
    END IF;
  ELSE
    INSERT INTO "Client"("barberId","name","phone","email","authUserId")
    VALUES (v_barber, p_name, p_phone, COALESCE(p_email, v_auth_email), auth.uid()) RETURNING "id" INTO v_client;
  END IF;
  RETURN public._client_json(v_client);
END; $$;

-- ---- C2: client_complete_profile — misma protección (enlace mágico) -------
CREATE OR REPLACE FUNCTION public.client_complete_profile(p_slug TEXT, p_name TEXT, p_phone TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_email TEXT; existing "Client"%ROWTYPE; v_client TEXT; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  IF v_barber IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;
  SELECT "email" INTO v_email FROM auth.users WHERE "id" = auth.uid();

  SELECT * INTO existing FROM "Client" WHERE "authUserId" = auth.uid();
  IF FOUND THEN RETURN public._client_json(existing."id"); END IF;

  SELECT * INTO existing FROM "Client" WHERE "barberId" = v_barber AND "phone" = p_phone;
  IF FOUND THEN
    IF existing."authUserId" IS NOT NULL THEN RAISE EXCEPTION 'PHONE_TAKEN'; END IF;
    IF existing."email" IS NOT NULL AND v_email IS NOT NULL AND lower(existing."email") = lower(v_email) THEN
      UPDATE "Client" SET "authUserId" = auth.uid(), "name" = p_name
        WHERE "id" = existing."id" RETURNING "id" INTO v_client;
    ELSE
      RAISE EXCEPTION 'PHONE_TAKEN'
        USING HINT = 'Ese teléfono ya tiene citas registradas. Pide al negocio que te envíe una invitación por email para recuperar tu historial.';
    END IF;
  ELSE
    INSERT INTO "Client"("barberId","name","phone","email","authUserId")
    VALUES (v_barber, p_name, p_phone, v_email, auth.uid()) RETURNING "id" INTO v_client;
  END IF;
  RETURN public._client_json(v_client);
END; $$;

-- ---- C3: solo vincular por email cuando el email ya está confirmado -------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW."email_confirmed_at" IS NULL THEN RETURN NEW; END IF;
  UPDATE "Client"
     SET "authUserId" = NEW."id"
   WHERE "authUserId" IS NULL
     AND lower("email") = lower(NEW."email");
  RETURN NEW;
END;
$$;

-- Ya existía (dispara al crearse el usuario; ahora solo actúa si ya está
-- confirmado, p.ej. cuando las confirmaciones están desactivadas).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Nuevo: si las confirmaciones están activas, el email se confirma más tarde
-- (al pulsar el enlace) — este trigger vincula en ese momento, no antes.
DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF "email_confirmed_at" ON auth.users
  FOR EACH ROW
  WHEN (OLD."email_confirmed_at" IS NULL AND NEW."email_confirmed_at" IS NOT NULL)
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ---- M3: borrar la cuenta del dueño también borra su auth.users -----------
CREATE OR REPLACE FUNCTION public.owner_delete_account()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; v_uid UUID; BEGIN
  v_uid := auth.uid();
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM "Barber" WHERE "id" = v_barber;
  DELETE FROM auth.users WHERE "id" = v_uid;
END; $$;

GRANT EXECUTE ON FUNCTION public.owner_delete_account() TO authenticated;

-- ==== 20260728000000_fix_reminders_and_loyalty_floor ====
-- =============================================================================
-- Fixes menores (auditoría):
-- M3 — Si una cita se marcaba COMPLETED antes de la hora del recordatorio
--   programado, este se enviaba igualmente ("tu cita es el..." para una cita
--   que ya pasó). Ahora se cancela también al completar, igual que al
--   cancelar o marcar no presentado.
-- B1 — public_business exponía loyaltyThreshold sin el mismo suelo de 1 que
--   ya aplicaba owner_loyalty; un valor 0 o negativo guardado por error
--   mostraría en la página pública "premio al llegar a 0 visitas".
-- =============================================================================

-- ---- M3: cancelar recordatorios pendientes también al completar -----------
CREATE OR REPLACE FUNCTION public._on_appointment_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_risky INT; s_watch INT; s_late INT;
  notice_hours DOUBLE PRECISION;
  new_no_show INT; new_late INT; new_status "ReliabilityStatus"; strikes INT;
  was_late_cancel BOOLEAN;
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;

  SELECT "riskyThreshold", "watchThreshold", "lateCancelThresholdHours"
    INTO s_risky, s_watch, s_late
    FROM "NotificationSettings" WHERE "barberId" = NEW."barberId";
  s_risky := COALESCE(s_risky, 2); s_watch := COALESCE(s_watch, 1); s_late := COALESCE(s_late, 4);

  IF OLD."status" = 'NO_SHOW' THEN
    UPDATE "Client" SET "noShowCount" = GREATEST("noShowCount" - 1, 0) WHERE "id" = NEW."clientId";
  ELSIF OLD."status" = 'COMPLETED' THEN
    UPDATE "Client" SET "completedCount" = GREATEST("completedCount" - 1, 0) WHERE "id" = NEW."clientId";
  ELSIF OLD."status" = 'CANCELLED' THEN
    was_late_cancel := OLD."cancelNoticeHours" IS NOT NULL AND OLD."cancelNoticeHours" < s_late;
    IF was_late_cancel THEN
      UPDATE "Client" SET "lateCancelCount" = GREATEST("lateCancelCount" - 1, 0) WHERE "id" = NEW."clientId";
    END IF;
  END IF;

  IF NEW."status" = 'CANCELLED' THEN
    NEW."cancelledAt" := now();
    notice_hours := GREATEST(0, EXTRACT(EPOCH FROM (NEW."startTime" - now())) / 3600.0);
    NEW."cancelNoticeHours" := notice_hours;
    IF notice_hours < s_late THEN
      UPDATE "Client" SET "lateCancelCount" = "lateCancelCount" + 1 WHERE "id" = NEW."clientId";
    END IF;
  ELSIF NEW."status" = 'NO_SHOW' THEN
    UPDATE "Client" SET "noShowCount" = "noShowCount" + 1 WHERE "id" = NEW."clientId";
  ELSIF NEW."status" = 'COMPLETED' THEN
    UPDATE "Client" SET "completedCount" = "completedCount" + 1 WHERE "id" = NEW."clientId";
  END IF;

  -- Una cita CANCELLED, NO_SHOW o ya COMPLETED no necesita recordatorios futuros.
  IF NEW."status" IN ('CANCELLED', 'NO_SHOW', 'COMPLETED') THEN
    UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "appointmentId" = NEW."id" AND "status" = 'PENDING';
  END IF;

  SELECT "noShowCount", "lateCancelCount" INTO new_no_show, new_late FROM "Client" WHERE "id" = NEW."clientId";
  strikes := new_no_show + new_late;
  new_status := CASE WHEN strikes >= s_risky THEN 'RISKY'::"ReliabilityStatus"
                     WHEN strikes >= s_watch THEN 'WATCH'::"ReliabilityStatus"
                     ELSE 'RELIABLE'::"ReliabilityStatus" END;
  UPDATE "Client" SET "reliabilityStatus" = new_status WHERE "id" = NEW."clientId";

  RETURN NEW;
END;
$$;

-- Red de seguridad adicional: si por lo que sea quedara algún recordatorio
-- pendiente de una cita ya completada cuando se ejecute el despachador.
-- (Idéntica a la original de 20260711140000_reminders.sql; único cambio:
-- 'COMPLETED' añadido al IN de la línea de "cita ya no viva".)
CREATE OR REPLACE FUNCTION public.dispatch_due_reminders()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  r RECORD;
  n INT := 0;
  v_title TEXT;
  v_body TEXT;
  v_when TEXT;
BEGIN
  FOR r IN
    SELECT rem."id" AS reminder_id, rem."kind", rem."channel",
           a."startTime", a."status" AS appt_status,
           c."pushToken", c."name" AS client_name, c."reliabilityStatus",
           sv."name" AS service_name, b."businessName"
    FROM "Reminder" rem
    JOIN "Appointment" a ON a."id" = rem."appointmentId"
    JOIN "Client" c ON c."id" = a."clientId"
    JOIN "Service" sv ON sv."id" = a."serviceId"
    JOIN "Barber" b ON b."id" = a."barberId"
    WHERE rem."status" = 'PENDING' AND rem."scheduledFor" <= now()
    ORDER BY rem."scheduledFor"
    LIMIT 200
  LOOP
    -- Appointment no longer live: drop the reminder.
    IF r.appt_status IN ('CANCELLED', 'NO_SHOW', 'COMPLETED') THEN
      UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "id" = r.reminder_id;
      CONTINUE;
    END IF;

    v_when := to_char(r."startTime" AT TIME ZONE 'Europe/Madrid', 'DD/MM HH24:MI');
    IF r."kind" = 'CLIENT_REMINDER' THEN
      v_title := r."businessName";
      v_body  := 'Recordatorio: tu cita de ' || r.service_name || ' es el ' || v_when || '.';
    ELSE
      v_title := 'Aviso de cita';
      v_body  := 'Cita con ' || r.client_name || ' (' || r."reliabilityStatus" || ') el ' || v_when || '.';
    END IF;

    IF r."channel" = 'PUSH' THEN
      IF r."pushToken" IS NOT NULL AND r."kind" = 'CLIENT_REMINDER' THEN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          body := jsonb_build_object('to', r."pushToken", 'title', v_title, 'body', v_body, 'sound', 'default'),
          headers := jsonb_build_object('Content-Type', 'application/json')
        );
        UPDATE "Reminder" SET "status" = 'SENT', "sentAt" = now() WHERE "id" = r.reminder_id;
        n := n + 1;
      ELSE
        -- push reminder but no device token (or barber pre-warning): nothing to send
        UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "id" = r.reminder_id;
      END IF;
    ELSE
      UPDATE "Reminder"
        SET "status" = 'FAILED', "error" = 'Sin proveedor HTTP configurado para ' || r."channel"
        WHERE "id" = r.reminder_id;
    END IF;
  END LOOP;

  RETURN n;
END;
$$;

-- ---- B1: mismo suelo de 1 visita que ya aplica owner_loyalty ---------------
CREATE OR REPLACE FUNCTION public.public_business(p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b "Barber"%ROWTYPE; BEGIN
  SELECT * INTO b FROM "Barber" WHERE "slug" = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;
  RETURN jsonb_build_object(
    'barber', jsonb_build_object('businessName', b."businessName", 'slug', b."slug", 'phone', b."phone",
      'bio', b."bio", 'address', b."address", 'instagram', b."instagram", 'photoUrl', b."photoUrl",
      'loyaltyEnabled', b."loyaltyEnabled", 'loyaltyThreshold', GREATEST(b."loyaltyThreshold", 1), 'loyaltyReward', b."loyaltyReward"),
    'services', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s."id",'name',s."name",'durationMinutes',s."durationMinutes",'priceCents',s."priceCents") ORDER BY s."createdAt")
                          FROM "Service" s WHERE s."barberId"=b."id" AND s."active"), '[]'::jsonb),
    'staff', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',st."id",'name',st."name",'color',st."color") ORDER BY st."createdAt")
                       FROM "Staff" st WHERE st."barberId"=b."id" AND st."active"), '[]'::jsonb)
  );
END; $$;

-- ==== 20260729000000_owner_cancel_alert ====
-- =============================================================================
-- Aviso push al dueño cuando un cliente cancela una cita DE HOY, para que
-- pueda reaccionar al momento (avisar en Instagram, llamar a otro cliente...)
-- en vez de enterarse al abrir la app más tarde. Se envía en el momento,
-- directamente desde el trigger (no espera al cron de 5 min de recordatorios,
-- porque aquí cada minuto cuenta para poder rellenar el hueco).
-- =============================================================================

ALTER TABLE "Barber" ADD COLUMN IF NOT EXISTS "pushToken" TEXT;
ALTER TABLE "NotificationSettings" ADD COLUMN IF NOT EXISTS "sameDayCancelAlertEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.owner_set_push_token(p_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; BEGIN
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE "Barber" SET "pushToken" = p_token WHERE "id" = v_barber;
END; $$;

GRANT EXECUTE ON FUNCTION public.owner_set_push_token(TEXT) TO authenticated;

-- Misma función que 20260728, con un único añadido: si la cancelación es de
-- una cita de HOY (hora de Madrid), avisa al dueño por push al momento.
CREATE OR REPLACE FUNCTION public._on_appointment_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  s_risky INT; s_watch INT; s_late INT; s_cancel_alert BOOLEAN;
  notice_hours DOUBLE PRECISION;
  new_no_show INT; new_late INT; new_status "ReliabilityStatus"; strikes INT;
  was_late_cancel BOOLEAN;
  v_barber_push TEXT; v_client_name TEXT; v_service_name TEXT; v_when TEXT;
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;

  SELECT "riskyThreshold", "watchThreshold", "lateCancelThresholdHours", "sameDayCancelAlertEnabled"
    INTO s_risky, s_watch, s_late, s_cancel_alert
    FROM "NotificationSettings" WHERE "barberId" = NEW."barberId";
  s_risky := COALESCE(s_risky, 2); s_watch := COALESCE(s_watch, 1); s_late := COALESCE(s_late, 4);
  s_cancel_alert := COALESCE(s_cancel_alert, true);

  IF OLD."status" = 'NO_SHOW' THEN
    UPDATE "Client" SET "noShowCount" = GREATEST("noShowCount" - 1, 0) WHERE "id" = NEW."clientId";
  ELSIF OLD."status" = 'COMPLETED' THEN
    UPDATE "Client" SET "completedCount" = GREATEST("completedCount" - 1, 0) WHERE "id" = NEW."clientId";
  ELSIF OLD."status" = 'CANCELLED' THEN
    was_late_cancel := OLD."cancelNoticeHours" IS NOT NULL AND OLD."cancelNoticeHours" < s_late;
    IF was_late_cancel THEN
      UPDATE "Client" SET "lateCancelCount" = GREATEST("lateCancelCount" - 1, 0) WHERE "id" = NEW."clientId";
    END IF;
  END IF;

  IF NEW."status" = 'CANCELLED' THEN
    NEW."cancelledAt" := now();
    notice_hours := GREATEST(0, EXTRACT(EPOCH FROM (NEW."startTime" - now())) / 3600.0);
    NEW."cancelNoticeHours" := notice_hours;
    IF notice_hours < s_late THEN
      UPDATE "Client" SET "lateCancelCount" = "lateCancelCount" + 1 WHERE "id" = NEW."clientId";
    END IF;

    -- Aviso push al dueño si la cita cancelada era de hoy (hora de Madrid).
    IF s_cancel_alert AND (NEW."startTime" AT TIME ZONE 'Europe/Madrid')::date = (now() AT TIME ZONE 'Europe/Madrid')::date THEN
      SELECT "pushToken" INTO v_barber_push FROM "Barber" WHERE "id" = NEW."barberId";
      IF v_barber_push IS NOT NULL THEN
        SELECT "name" INTO v_client_name FROM "Client" WHERE "id" = NEW."clientId";
        SELECT "name" INTO v_service_name FROM "Service" WHERE "id" = NEW."serviceId";
        v_when := to_char(NEW."startTime" AT TIME ZONE 'Europe/Madrid', 'HH24:MI');
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          body := jsonb_build_object(
            'to', v_barber_push,
            'title', '❌ Cancelación de hoy',
            'body', v_client_name || ' ha cancelado su cita de ' || v_service_name || ' de las ' || v_when || '. ¡Aprovecha el hueco!',
            'sound', 'default'
          ),
          headers := jsonb_build_object('Content-Type', 'application/json')
        );
      END IF;
    END IF;
  ELSIF NEW."status" = 'NO_SHOW' THEN
    UPDATE "Client" SET "noShowCount" = "noShowCount" + 1 WHERE "id" = NEW."clientId";
  ELSIF NEW."status" = 'COMPLETED' THEN
    UPDATE "Client" SET "completedCount" = "completedCount" + 1 WHERE "id" = NEW."clientId";
  END IF;

  IF NEW."status" IN ('CANCELLED', 'NO_SHOW', 'COMPLETED') THEN
    UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "appointmentId" = NEW."id" AND "status" = 'PENDING';
  END IF;

  SELECT "noShowCount", "lateCancelCount" INTO new_no_show, new_late FROM "Client" WHERE "id" = NEW."clientId";
  strikes := new_no_show + new_late;
  new_status := CASE WHEN strikes >= s_risky THEN 'RISKY'::"ReliabilityStatus"
                     WHEN strikes >= s_watch THEN 'WATCH'::"ReliabilityStatus"
                     ELSE 'RELIABLE'::"ReliabilityStatus" END;
  UPDATE "Client" SET "reliabilityStatus" = new_status WHERE "id" = NEW."clientId";

  RETURN NEW;
END;
$$;

-- ==== seed ====
-- Demo data for local dev / first production seed.
-- The OWNER logs in via Supabase Auth; link their auth user to this Barber row
-- afterwards by calling claim_business('oficina-del-barbero') once, or set
-- "authUserId" manually. Clients here have no password (created as walk-ins);
-- a client creates a password by registering in the app.

INSERT INTO "Barber"("id","businessName","slug","ownerName","email","phone")
VALUES ('biz_demo', 'Oficina del Barbero', 'oficina-del-barbero', 'Carlos', 'carlos@barberia-demo.com', '+34698923061');

-- Push is the free default channel; email/WhatsApp/SMS need a paid HTTP
-- provider, so they're off until the owner wires one up.
INSERT INTO "NotificationSettings"("barberId","emailEnabled","whatsappEnabled","smsEnabled")
VALUES ('biz_demo', false, false, false);

INSERT INTO "Staff"("id","barberId","name","color") VALUES
  ('staff_samuel', 'biz_demo', 'Samuel', '#D6A756'),
  ('staff_joti',   'biz_demo', 'Joti',   '#5E8DFF');

-- Mon(1)..Sat(6): mornings 09:30-13:30 (570-810), Samuel also afternoons 16:00-20:00 (960-1200)
INSERT INTO "StaffWorkingHours"("staffId","dayOfWeek","startMinute","endMinute")
SELECT 'staff_samuel', d, 570, 810 FROM generate_series(1,6) d
UNION ALL SELECT 'staff_samuel', d, 960, 1200 FROM generate_series(1,6) d
UNION ALL SELECT 'staff_joti', d, 570, 810 FROM generate_series(1,6) d;

INSERT INTO "Service"("id","barberId","name","durationMinutes","priceCents") VALUES
  ('svc_corte',  'biz_demo', 'Corte caballero',        30, 1300),
  ('svc_barba',  'biz_demo', 'Corte+Barba',            45, 1900),
  ('svc_recorte','biz_demo', 'Recorte de la barba',    15,  800),
  ('svc_perfil', 'biz_demo', 'Corte+Perfilado Barba',  30, 1500);

INSERT INTO "Client"("id","barberId","name","phone","reliabilityStatus","noShowCount","lateCancelCount") VALUES
  ('cli_ana',   'biz_demo', 'Ana López',      '+34600111001', 'RELIABLE', 0, 0),
  ('cli_marta', 'biz_demo', 'Marta Sánchez',  '+34600111002', 'WATCH',    0, 1),
  ('cli_pedro', 'biz_demo', 'Pedro Gómez',    '+34600111003', 'RISKY',    2, 0);
