-- =============================================================================
-- Reprogramar / editar una cita desde el panel del dueño (fase 17).
-- Cuando un cliente llama para cambiar su cita, el dueño puede moverla de hora,
-- fecha, barbero o servicio sin borrarla y volver a crearla. Revalida horario y
-- solapes (excluyendo la propia cita) y reprograma los recordatorios.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.owner_reschedule(
  p_id TEXT, p_staff_id TEXT, p_service_id TEXT, p_start TIMESTAMPTZ, p_notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_barber TEXT; v_dur INT; v_end TIMESTAMPTZ; appt "Appointment"%ROWTYPE;
  d_start DATE; d_end DATE; m_start INT; m_end INT; dow INT;
BEGIN
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO appt FROM "Appointment" WHERE "id" = p_id AND "barberId" = v_barber;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF appt."status" IN ('CANCELLED','NO_SHOW','COMPLETED') THEN
    RAISE EXCEPTION 'NOT_EDITABLE' USING HINT = 'Solo se pueden mover citas pendientes o confirmadas';
  END IF;

  SELECT "durationMinutes" INTO v_dur FROM "Service" WHERE "id" = p_service_id AND "barberId" = v_barber AND "active";
  IF v_dur IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Staff" WHERE "id" = p_staff_id AND "barberId" = v_barber AND "active") THEN
    RAISE EXCEPTION 'STAFF_NOT_FOUND';
  END IF;

  v_end := p_start + make_interval(mins => v_dur);

  -- Horario del barbero + que no cruce medianoche (como _assert_bookable).
  d_start := (p_start AT TIME ZONE 'Europe/Madrid')::date;
  d_end   := (v_end   AT TIME ZONE 'Europe/Madrid')::date;
  m_start := EXTRACT(HOUR FROM (p_start AT TIME ZONE 'Europe/Madrid')) * 60 + EXTRACT(MINUTE FROM (p_start AT TIME ZONE 'Europe/Madrid'));
  m_end   := EXTRACT(HOUR FROM (v_end   AT TIME ZONE 'Europe/Madrid')) * 60 + EXTRACT(MINUTE FROM (v_end   AT TIME ZONE 'Europe/Madrid'));
  dow     := EXTRACT(DOW FROM (p_start AT TIME ZONE 'Europe/Madrid'))::int;
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

  -- Solape con otras citas vivas (excluyendo esta misma).
  IF EXISTS (
    SELECT 1 FROM "Appointment" a
    WHERE a."id" <> p_id AND a."staffId" = p_staff_id
      AND a."status" NOT IN ('CANCELLED','NO_SHOW')
      AND a."startTime" < v_end AND a."endTime" > p_start
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING HINT = 'Ese hueco se solapa con otra cita';
  END IF;

  UPDATE "Appointment"
     SET "staffId" = p_staff_id, "serviceId" = p_service_id,
         "startTime" = p_start, "endTime" = v_end, "notes" = p_notes
   WHERE "id" = p_id
   RETURNING * INTO appt;

  PERFORM public._schedule_reminders(p_id);  -- cancela los antiguos y crea los nuevos
  RETURN to_jsonb(appt);
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'SLOT_TAKEN' USING HINT = 'Ese hueco se solapa con otra cita';
END; $$;

GRANT EXECUTE ON FUNCTION public.owner_reschedule(TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) TO authenticated;
