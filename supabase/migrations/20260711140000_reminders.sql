-- =============================================================================
-- App-Barber — Supabase-native reminders dispatch (phase 4)
-- Replaces the old node-cron dispatcher. pg_cron runs dispatch_due_reminders()
-- every 5 minutes; it sends client PUSH notifications via the free Expo push
-- API using pg_net (async HTTP from Postgres). Email/WhatsApp/SMS need a paid
-- HTTP provider, so those are marked FAILED with a clear reason until one is
-- wired up (they're disabled by default in NotificationSettings).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

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
    IF r.appt_status IN ('CANCELLED', 'NO_SHOW') THEN
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

-- Run every 5 minutes. (On hosted Supabase, enable pg_cron/pg_net from the
-- dashboard if this migration can't create them.)
SELECT cron.schedule('dispatch-reminders', '*/5 * * * *', $$SELECT public.dispatch_due_reminders();$$);
