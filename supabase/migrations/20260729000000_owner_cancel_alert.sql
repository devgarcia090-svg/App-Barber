-- =============================================================================
-- Aviso push al dueño cuando un cliente cancela una cita DE HOY, para que
-- pueda reaccionar al momento (avisar en Instagram, llamar a otro cliente...)
-- en vez de enterarse al abrir la app más tarde. Se envía en el momento,
-- directamente desde el trigger (no espera al cron de 5 min de recordatorios,
-- porque aquí cada minuto cuenta para poder rellenar el hueco).
-- =============================================================================

ALTER TABLE "Barber" ADD COLUMN IF NOT EXISTS "pushToken" TEXT;
ALTER TABLE "NotificationSettings" ADD COLUMN IF NOT EXISTS "sameDayCancelAlertEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.owner_set_push_token(p_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barber TEXT; BEGIN
  v_barber := public.current_barber_id();
  IF v_barber IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE "Barber" SET "pushToken" = p_token WHERE "id" = v_barber;
END; $$;

GRANT EXECUTE ON FUNCTION public.owner_set_push_token(TEXT) TO authenticated;

-- Misma función que 20260728, con un único añadido: si la cancelación es de
-- una cita de HOY (hora de Madrid), avisa al dueño por push al momento.
CREATE OR REPLACE FUNCTION public._on_appointment_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  s_risky INT; s_watch INT; s_late INT; s_cancel_alert BOOLEAN;
  notice_hours DOUBLE PRECISION;
  new_no_show INT; new_late INT; new_status "ReliabilityStatus"; strikes INT;
  was_late_cancel BOOLEAN;
  v_barber_push TEXT; v_client_name TEXT; v_service_name TEXT; v_when TEXT;
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;

  SELECT "riskyThreshold", "watchThreshold", "lateCancelThresholdHours", "sameDayCancelAlertEnabled"
    INTO s_risky, s_watch, s_late, s_cancel_alert
    FROM "NotificationSettings" WHERE "barberId" = NEW."barberId";
  s_risky := COALESCE(s_risky, 2); s_watch := COALESCE(s_watch, 1); s_late := COALESCE(s_late, 4);
  s_cancel_alert := COALESCE(s_cancel_alert, true);

  IF OLD."status" = 'NO_SHOW' THEN
    UPDATE "Client" SET "noShowCount" = GREATEST("noShowCount" - 1, 0) WHERE "id" = NEW."clientId";
  ELSIF OLD."status" = 'COMPLETED' THEN
    UPDATE "Client" SET "completedCount" = GREATEST("completedCount" - 1, 0) WHERE "id" = NEW."clientId";
  ELSIF OLD."status" = 'CANCELLED' THEN
    was_late_cancel := OLD."cancelNoticeHours" IS NOT NULL AND OLD."cancelNoticeHours" < s_late;
    IF was_late_cancel THEN
      UPDATE "Client" SET "lateCancelCount" = GREATEST("lateCancelCount" - 1, 0) WHERE "id" = NEW."clientId";
    END IF;
  END IF;

  IF NEW."status" = 'CANCELLED' THEN
    NEW."cancelledAt" := now();
    notice_hours := GREATEST(0, EXTRACT(EPOCH FROM (NEW."startTime" - now())) / 3600.0);
    NEW."cancelNoticeHours" := notice_hours;
    IF notice_hours < s_late THEN
      UPDATE "Client" SET "lateCancelCount" = "lateCancelCount" + 1 WHERE "id" = NEW."clientId";
    END IF;

    -- Aviso push al dueño si la cita cancelada era de hoy (hora de Madrid).
    IF s_cancel_alert AND (NEW."startTime" AT TIME ZONE 'Europe/Madrid')::date = (now() AT TIME ZONE 'Europe/Madrid')::date THEN
      SELECT "pushToken" INTO v_barber_push FROM "Barber" WHERE "id" = NEW."barberId";
      IF v_barber_push IS NOT NULL THEN
        SELECT "name" INTO v_client_name FROM "Client" WHERE "id" = NEW."clientId";
        SELECT "name" INTO v_service_name FROM "Service" WHERE "id" = NEW."serviceId";
        v_when := to_char(NEW."startTime" AT TIME ZONE 'Europe/Madrid', 'HH24:MI');
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          body := jsonb_build_object(
            'to', v_barber_push,
            'title', '❌ Cancelación de hoy',
            'body', v_client_name || ' ha cancelado su cita de ' || v_service_name || ' de las ' || v_when || '. ¡Aprovecha el hueco!',
            'sound', 'default'
          ),
          headers := jsonb_build_object('Content-Type', 'application/json')
        );
      END IF;
    END IF;
  ELSIF NEW."status" = 'NO_SHOW' THEN
    UPDATE "Client" SET "noShowCount" = "noShowCount" + 1 WHERE "id" = NEW."clientId";
  ELSIF NEW."status" = 'COMPLETED' THEN
    UPDATE "Client" SET "completedCount" = "completedCount" + 1 WHERE "id" = NEW."clientId";
  END IF;

  IF NEW."status" IN ('CANCELLED', 'NO_SHOW', 'COMPLETED') THEN
    UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "appointmentId" = NEW."id" AND "status" = 'PENDING';
  END IF;

  SELECT "noShowCount", "lateCancelCount" INTO new_no_show, new_late FROM "Client" WHERE "id" = NEW."clientId";
  strikes := new_no_show + new_late;
  new_status := CASE WHEN strikes >= s_risky THEN 'RISKY'::"ReliabilityStatus"
                     WHEN strikes >= s_watch THEN 'WATCH'::"ReliabilityStatus"
                     ELSE 'RELIABLE'::"ReliabilityStatus" END;
  UPDATE "Client" SET "reliabilityStatus" = new_status WHERE "id" = NEW."clientId";

  RETURN NEW;
END;
$$;
