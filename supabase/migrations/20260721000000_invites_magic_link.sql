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
