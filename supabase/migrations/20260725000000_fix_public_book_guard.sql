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
