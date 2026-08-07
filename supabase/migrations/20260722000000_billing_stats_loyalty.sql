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
