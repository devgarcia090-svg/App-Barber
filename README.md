# App-Barber

App de reservas para una barbería (estilo Booksy) centrada en reducir los plantones: lleva la cuenta de
faltas y cancelaciones tardías por cliente, avisa al barbero antes de una cita con un cliente "de riesgo",
y manda recordatorios (push, y opcionalmente email/SMS) antes de cada cita.

## Arquitectura — todo en Supabase (sin servidor propio)

No hay un backend que haya que alojar ni pagar aparte. **Supabase es el backend completo**: base de datos
PostgreSQL, autenticación, y toda la lógica de negocio vive dentro de la base de datos (funciones RPC,
triggers, y `pg_cron` + `pg_net` para los recordatorios). Las apps hablan directamente con Supabase con la
clave pública (anon).

```
supabase/   Migraciones SQL (esquema + RLS + funciones RPC + recordatorios) y seed
web/        Panel del barbero (React + Vite) — se despliega gratis en Cloudflare Pages
mobile/     App Expo/React Native — dos roles: el barbero gestiona; el cliente reserva
```

- **Dueño/barbero**: inicia sesión con Supabase Auth (email + contraseña) y gestiona su negocio; el acceso
  a los datos está protegido por políticas RLS (cada negocio solo ve lo suyo).
- **Clientes**: crean cuenta con teléfono + contraseña (gestionada por funciones RPC con bcrypt y un token
  de sesión propio; no usan Supabase Auth), reservan, ven sus citas y las cancelan.
- **Reserva pública** (sin cuenta): la web `/reserva/<slug>` permite reservar solo con nombre y teléfono.

## Puesta en marcha de Supabase

1. Crea un proyecto en https://supabase.com (región Europa; apunta la contraseña de la base de datos).
2. Instala la CLI y enlaza el proyecto:
   ```
   npm i -g supabase
   supabase login
   supabase link --project-ref TU_PROJECT_REF
   ```
3. Aplica el esquema + la lógica y los datos de ejemplo:
   ```
   supabase db push        # aplica supabase/migrations/*
   psql "$DB_URL" -f supabase/seed.sql   # o el editor SQL del panel: pega supabase/seed.sql
   ```
4. En el panel, **Database → Extensions**, activa `pg_cron` y `pg_net` si no lo hizo la migración (son las
   que envían los recordatorios).
5. Crea la cuenta del dueño: en **Authentication → Users → Add user** (email + contraseña). Luego, una vez,
   inicia sesión desde la web o llama a `select claim_business('oficina-del-barbero');` autenticado como ese
   usuario para vincularlo al negocio.

Las claves para las apps están en **Project Settings → API**: `Project URL` y la `anon public key`.

### Desarrollo local

Con Docker instalado, `supabase start` levanta todo el stack en local (imprime las URLs y claves). `supabase
db reset` aplica migraciones + seed. Nota: el contenedor de Edge Functions no se usa (toda la lógica está en
funciones RPC de Postgres), así que un aviso de `edge-runtime` al arrancar es inofensivo.

## Panel web (barbero)

```
cd web
cp .env.example .env    # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_BUSINESS_SLUG
npm install
npm run dev             # http://localhost:5173
```

### Desplegar la web en Cloudflare Pages (gratis)

En el panel de Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, elige este repositorio y
configura el build:

- **Root directory (advanced):** `web`  (es un monorepo)
- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BUSINESS_SLUG` con los
  valores de tu proyecto Supabase.

El fichero `web/public/_redirects` (`/* /index.html 200`) ya está en el repo; Cloudflare Pages lo usa para
el fallback de SPA, así que las rutas como `/reserva/...` o `/privacidad` funcionan al recargar o entrar
directo. El enlace de reserva pública será `https://TU-SITIO.pages.dev/reserva/oficina-del-barbero` (o tu
dominio propio si lo conectas en Cloudflare).

## App móvil (Expo)

```
cd mobile
cp .env.example .env    # EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_BUSINESS_SLUG
npm install
npx expo start          # escanea el QR con Expo Go
```

Como la app habla directamente con Supabase (que ya es una URL pública HTTPS), la APK funciona desde
cualquier sitio sin montar ningún servidor. Para builds de tienda: `npx eas build` (requiere `eas.json` y
cuentas de Apple/Google Developer — ver checklist).

## Modelo de datos (resumen)

- `Barber`: el negocio; `authUserId` lo vincula al usuario de Supabase Auth del dueño.
- `Staff` + `StaffWorkingHours`: cada barbero y su horario semanal (admite horario partido, varios turnos/día).
- `Service`: servicios (nombre, duración, precio).
- `Client`: clientes, con contadores de fiabilidad; `passwordHash`/`pushToken` si tienen cuenta en la app.
- `ClientSession`: tokens de sesión de los clientes (login por teléfono, sin Supabase Auth).
- `Appointment`, `Reminder`, `NotificationSettings`.

Lógica en la base de datos (`supabase/migrations/`): funciones `public_*` (reserva pública), `client_*`
(cuenta y citas del cliente), `owner_book` (reserva del dueño), disponibilidad/validación de horario y
solapes, un trigger de fiabilidad, y `dispatch_due_reminders()` programada por `pg_cron`.

## Publicación en App Store / Play Store (checklist)

- ✅ **Backend en producción**: resuelto — Supabase es el backend (URL pública HTTPS gestionada, gratis).
- ✅ **Eliminación de cuenta en la app** (Apple 5.1.1): dueño (Ajustes) y cliente (Perfil).
- ✅ Identificadores de app configurados (`com.oficinadelbarbero.app`).
- ⬜ **Política de privacidad**: URL pública obligatoria (nombres/teléfonos de clientes, citas). Alojar una
  página estática.
- ⬜ **Formularios de privacidad** de App Store Connect ("App Privacy") y Play Console ("Data safety").
- ⬜ **Builds de producción** con EAS (`npx eas build`) — cuentas de Apple Developer (99 €/año) y Google
  Play (25 € pago único).
- ⬜ **Endurecer** antes de abrir al público: revisar límites de tasa en Supabase y confirmar que el seed
  de ejemplo no queda en producción.
