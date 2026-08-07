-- =============================================================================
-- Enlace de cancelación para reservas sin cuenta (QR / página pública). Quien
-- reserva solo con nombre y teléfono no tiene ninguna otra forma de cancelar
-- por sí mismo (no hay sesión que comprobar). Se genera un token aleatorio y
-- de un solo uso POR CITA (no por cliente, y no adivinable) que sirve para
-- ver y cancelar únicamente esa cita, sin exponer el resto de su historial.
-- No requiere SMS/email de terceros: el enlace se muestra en la propia
-- pantalla de confirmación tras reservar.
-- =============================================================================

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "guestCancelToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_guestCancelToken_key" ON "Appointment"("guestCancelToken");

-- public_book ahora genera el token y lo devuelve en la respuesta.
CREATE OR REPLACE FUNCTION public.public_book(
  p_slug TEXT, p_staff_id TEXT, p_service_id TEXT, p_start TIMESTAMPTZ,
  p_client_name TEXT, p_client_phone TEXT, p_client_email TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_barber TEXT; v_client TEXT; appt "Appointment"%ROWTYPE; v_token TEXT; BEGIN
  SELECT "id" INTO v_barber FROM "Barber" WHERE "slug" = p_slug;
  IF v_barber IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;

  INSERT INTO "Client"("barberId","name","phone","email") VALUES (v_barber, p_client_name, p_client_phone, p_client_email)
  ON CONFLICT ("barberId","phone") DO UPDATE SET
    "name"  = CASE WHEN "Client"."authUserId" IS NULL THEN EXCLUDED."name" ELSE "Client"."name" END,
    "email" = COALESCE("Client"."email", EXCLUDED."email")
  RETURNING "id" INTO v_client;

  appt := public._create_appointment(v_barber, p_staff_id, v_client, p_service_id, p_start, p_notes);

  v_token := encode(gen_random_bytes(20), 'hex');
  UPDATE "Appointment" SET "guestCancelToken" = v_token WHERE "id" = appt."id" RETURNING * INTO appt;

  RETURN to_jsonb(appt);
END; $$;

-- Consultar una cita por su token (para la pantalla "gestionar mi reserva").
CREATE OR REPLACE FUNCTION public.public_get_appointment_by_token(p_token TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', a."id", 'startTime', a."startTime", 'endTime', a."endTime", 'status', a."status",
    'serviceName', sv."name", 'staffName', st."name", 'businessName', b."businessName", 'clientName', c."name"
  )
  FROM "Appointment" a
  JOIN "Service" sv ON sv."id" = a."serviceId"
  JOIN "Staff" st ON st."id" = a."staffId"
  JOIN "Barber" b ON b."id" = a."barberId"
  JOIN "Client" c ON c."id" = a."clientId"
  WHERE a."guestCancelToken" = p_token;
$$;

-- Cancelar por token: sin autenticación, solo puede tocar la cita a la que
-- pertenece ese token exacto (no cualquier cita del cliente).
CREATE OR REPLACE FUNCTION public.public_cancel_appointment(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE appt "Appointment"%ROWTYPE; BEGIN
  SELECT * INTO appt FROM "Appointment" WHERE "guestCancelToken" = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF appt."status" IN ('CANCELLED','COMPLETED','NO_SHOW') THEN RAISE EXCEPTION 'NOT_CANCELLABLE'; END IF;
  UPDATE "Appointment" SET "status" = 'CANCELLED' WHERE "id" = appt."id" RETURNING * INTO appt;
  RETURN to_jsonb(appt);
END; $$;

GRANT EXECUTE ON FUNCTION
  public.public_get_appointment_by_token(TEXT),
  public.public_cancel_appointment(TEXT)
TO anon, authenticated;
