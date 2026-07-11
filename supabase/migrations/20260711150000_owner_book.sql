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
