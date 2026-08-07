-- =============================================================================
-- Fix (auditoría): el trigger de fiabilidad solo SUMABA contadores al ENTRAR en
-- un estado (COMPLETED/NO_SHOW/cancelación tardía) pero nunca los restaba al
-- SALIR de él. Si el dueño corregía una cita mal marcada (p.ej. "Completada"
-- por error → "No presentado"), el cliente se quedaba con un completedCount
-- inflado para siempre (afecta a la fidelización) y/o con noShowCount duplicado
-- si la cita oscilaba entre estados. Ahora el ajuste es simétrico: se resta al
-- salir de un estado y se suma al entrar, y la fiabilidad se recalcula siempre
-- que cambia el estado (no solo al entrar en CANCELLED/NO_SHOW), para que
-- también mejore si una corrección reduce las incidencias.
-- =============================================================================

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

  -- ---- Salir del estado anterior: revertir lo que sumó en su momento -------
  IF OLD."status" = 'NO_SHOW' THEN
    UPDATE "Client" SET "noShowCount" = GREATEST("noShowCount" - 1, 0) WHERE "id" = NEW."clientId";
  ELSIF OLD."status" = 'COMPLETED' THEN
    UPDATE "Client" SET "completedCount" = GREATEST("completedCount" - 1, 0) WHERE "id" = NEW."clientId";
  ELSIF OLD."status" = 'CANCELLED' THEN
    -- Se guardó como tardía en su momento si cancelNoticeHours quedó por debajo
    -- del umbral vigente entonces; lo usamos tal cual para revertir esa cuenta.
    was_late_cancel := OLD."cancelNoticeHours" IS NOT NULL AND OLD."cancelNoticeHours" < s_late;
    IF was_late_cancel THEN
      UPDATE "Client" SET "lateCancelCount" = GREATEST("lateCancelCount" - 1, 0) WHERE "id" = NEW."clientId";
    END IF;
  END IF;

  -- ---- Entrar en el nuevo estado --------------------------------------------
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

  IF NEW."status" IN ('CANCELLED', 'NO_SHOW') THEN
    -- Cancela cualquier recordatorio pendiente de una cita que ya no vaya a pasar.
    UPDATE "Reminder" SET "status" = 'CANCELLED' WHERE "appointmentId" = NEW."id" AND "status" = 'PENDING';
  END IF;

  -- ---- Fiabilidad: se recalcula siempre, para que también pueda mejorar ----
  SELECT "noShowCount", "lateCancelCount" INTO new_no_show, new_late FROM "Client" WHERE "id" = NEW."clientId";
  strikes := new_no_show + new_late;
  new_status := CASE WHEN strikes >= s_risky THEN 'RISKY'::"ReliabilityStatus"
                     WHEN strikes >= s_watch THEN 'WATCH'::"ReliabilityStatus"
                     ELSE 'RELIABLE'::"ReliabilityStatus" END;
  UPDATE "Client" SET "reliabilityStatus" = new_status WHERE "id" = NEW."clientId";

  RETURN NEW;
END;
$$;
