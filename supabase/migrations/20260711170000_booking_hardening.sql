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
