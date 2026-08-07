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
