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
