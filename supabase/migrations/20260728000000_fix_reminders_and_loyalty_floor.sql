-- =============================================================================
-- Fixes menores (auditoría):
-- M3 — Si una cita se marcaba COMPLETED antes de la hora del recordatorio
--   programado, este se enviaba igualmente ("tu cita es el..." para una cita
--   que ya pasó). Ahora se cancela también al completar, igual que al
--   cancelar o marcar no presentado.
-- B1 — public_business exponía loyaltyThreshold sin el mismo suelo de 1 que
--   ya aplicaba owner_loyalty; un valor 0 o negativo guardado por error
--   mostraría en la página pública "premio al llegar a 0 visitas".
-- =============================================================================

-- ---- M3: cancelar recordatorios pendientes también al completar -----------
CREATE OR REPLACE FUNCTION public._on_appointment_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_risky INT; s_watch INT; s_late INT;
  notice_hours DOUBLE PRECISION;
  new_no_show INT; new_late INT; new_status "ReliabilityStatus"; strikes INT;
  was_late_cancel BOOLEAN;
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;

  SELECT "riskyThreshold", "watchThreshold", "lateCancelThresholdHours"
    INTO s_risky, s_watch, s_late
    FROM "NotificationSettings" WHERE "barberId" = NEW."barberId";
  s_risky := COALESCE(s_risky, 2); s_watch := COALESCE(s_watch, 1); s_late := COALESCE(s_late, 4);

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
  ELSIF NEW."status" = 'NO_SHOW' THEN
    UPDATE "Client" SET "noShowCount" = "noShowCount" + 1 WHERE "id" = NEW."clientId";
  ELSIF NEW."status" = 'COMPLETED' THEN
    UPDATE "Client" SET "completedCount" = "completedCount" + 1 WHERE "id" = NEW."clientId";
  END IF;

  -- Una cita CANCELLED, NO_SHOW o ya COMPLETED no necesita recordatorios futuros.
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

-- Red de seguridad adicional: si por lo que sea quedara algún recordatorio
-- pendiente de una cita ya completada cuando se ejecute el despachador.
-- (Idéntica a la original de 20260711140000_reminders.sql; único cambio:
-- 'COMPLETED' añadido al IN de la línea de "cita ya no viva".)
CREATE OR REPLACE FUNCTION public.dispatch_due_reminders()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  r RECORD;
  n INT := 0;
  v_title TEXT;
  v_body TEXT;
  v_when TEXT;
BEGIN
  FOR r IN
    SELECT rem."id" AS reminder_id, rem."kind", rem."channel",
           a."startTime", a."status" AS appt_status,
           c."pushToken", c."name" AS client_name, c."reliabilityStatus",
           sv."name" AS service_name, b."businessName"
    FROM "Reminder" rem
    JOIN "Appointment" a ON a."id" = rem."appointmentId"
    JOIN "Client" c ON c."id" = a."clientId"
    JOIN "Service" sv ON sv."id" = a."serviceId"
    JOIN "Barber" b ON b."id" = a."barberId"
    WHERE rem."status" = 'PENDING' AND rem."scheduledFor" <= now()
    ORDER BY rem."scheduledFor"
    LIMIT 200
  LOOP
    -- Appointment no longer live: drop the reminder.
    IF r.appt_status IN ('CANCELLED', 'NO_SHOW', 'COMPLETED') THEN
      UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "id" = r.reminder_id;
      CONTINUE;
    END IF;

    v_when := to_char(r."startTime" AT TIME ZONE 'Europe/Madrid', 'DD/MM HH24:MI');
    IF r."kind" = 'CLIENT_REMINDER' THEN
      v_title := r."businessName";
      v_body  := 'Recordatorio: tu cita de ' || r.service_name || ' es el ' || v_when || '.';
    ELSE
      v_title := 'Aviso de cita';
      v_body  := 'Cita con ' || r.client_name || ' (' || r."reliabilityStatus" || ') el ' || v_when || '.';
    END IF;

    IF r."channel" = 'PUSH' THEN
      IF r."pushToken" IS NOT NULL AND r."kind" = 'CLIENT_REMINDER' THEN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          body := jsonb_build_object('to', r."pushToken", 'title', v_title, 'body', v_body, 'sound', 'default'),
          headers := jsonb_build_object('Content-Type', 'application/json')
        );
        UPDATE "Reminder" SET "status" = 'SENT', "sentAt" = now() WHERE "id" = r.reminder_id;
        n := n + 1;
      ELSE
        -- push reminder but no device token (or barber pre-warning): nothing to send
        UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "id" = r.reminder_id;
      END IF;
    ELSE
      UPDATE "Reminder"
        SET "status" = 'FAILED', "error" = 'Sin proveedor HTTP configurado para ' || r."channel"
        WHERE "id" = r.reminder_id;
    END IF;
  END LOOP;

  RETURN n;
END;
$$;

-- ---- B1: mismo suelo de 1 visita que ya aplica owner_loyalty ---------------
CREATE OR REPLACE FUNCTION public.public_business(p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b "Barber"%ROWTYPE; BEGIN
  SELECT * INTO b FROM "Barber" WHERE "slug" = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;
  RETURN jsonb_build_object(
    'barber', jsonb_build_object('businessName', b."businessName", 'slug', b."slug", 'phone', b."phone",
      'bio', b."bio", 'address', b."address", 'instagram', b."instagram", 'photoUrl', b."photoUrl",
      'loyaltyEnabled', b."loyaltyEnabled", 'loyaltyThreshold', GREATEST(b."loyaltyThreshold", 1), 'loyaltyReward', b."loyaltyReward"),
    'services', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s."id",'name',s."name",'durationMinutes',s."durationMinutes",'priceCents',s."priceCents") ORDER BY s."createdAt")
                          FROM "Service" s WHERE s."barberId"=b."id" AND s."active"), '[]'::jsonb),
    'staff', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',st."id",'name',st."name",'color',st."color") ORDER BY st."createdAt")
                       FROM "Staff" st WHERE st."barberId"=b."id" AND st."active"), '[]'::jsonb)
  );
END; $$;
