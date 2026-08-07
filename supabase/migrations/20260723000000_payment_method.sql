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
