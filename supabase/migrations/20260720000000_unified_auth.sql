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
