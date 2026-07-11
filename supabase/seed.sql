-- Demo data for local dev / first production seed.
-- The OWNER logs in via Supabase Auth; link their auth user to this Barber row
-- afterwards by calling claim_business('oficina-del-barbero') once, or set
-- "authUserId" manually. Clients here have no password (created as walk-ins);
-- a client creates a password by registering in the app.

INSERT INTO "Barber"("id","businessName","slug","ownerName","email","phone")
VALUES ('biz_demo', 'Oficina del Barbero', 'oficina-del-barbero', 'Carlos', 'carlos@barberia-demo.com', '+34698923061');

INSERT INTO "NotificationSettings"("barberId") VALUES ('biz_demo');

INSERT INTO "Staff"("id","barberId","name","color") VALUES
  ('staff_samuel', 'biz_demo', 'Samuel', '#D6A756'),
  ('staff_joti',   'biz_demo', 'Joti',   '#5E8DFF');

-- Mon(1)..Sat(6): mornings 09:30-13:30 (570-810), Samuel also afternoons 16:00-20:00 (960-1200)
INSERT INTO "StaffWorkingHours"("staffId","dayOfWeek","startMinute","endMinute")
SELECT 'staff_samuel', d, 570, 810 FROM generate_series(1,6) d
UNION ALL SELECT 'staff_samuel', d, 960, 1200 FROM generate_series(1,6) d
UNION ALL SELECT 'staff_joti', d, 570, 810 FROM generate_series(1,6) d;

INSERT INTO "Service"("id","barberId","name","durationMinutes","priceCents") VALUES
  ('svc_corte',  'biz_demo', 'Corte caballero',        30, 1300),
  ('svc_barba',  'biz_demo', 'Corte+Barba',            45, 1900),
  ('svc_recorte','biz_demo', 'Recorte de la barba',    15,  800),
  ('svc_perfil', 'biz_demo', 'Corte+Perfilado Barba',  30, 1500);

INSERT INTO "Client"("id","barberId","name","phone","reliabilityStatus","noShowCount","lateCancelCount") VALUES
  ('cli_ana',   'biz_demo', 'Ana López',      '+34600111001', 'RELIABLE', 0, 0),
  ('cli_marta', 'biz_demo', 'Marta Sánchez',  '+34600111002', 'WATCH',    0, 1),
  ('cli_pedro', 'biz_demo', 'Pedro Gómez',    '+34600111003', 'RISKY',    2, 0);
