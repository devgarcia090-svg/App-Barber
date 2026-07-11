# App-Barber

App de reservas para barberías (estilo Booksy) centrada en resolver el problema de los clientes que no
cancelan a tiempo: lleva la cuenta de faltas y cancelaciones tardías por cliente, avisa al barbero antes
de que llegue una cita con un cliente "de riesgo" y manda recordatorios (email / WhatsApp / SMS) horas
antes de cada cita.

## Estructura del repo

```
backend/   API (Express + TypeScript + Prisma + SQLite)
web/       Panel web para el barbero (React + Vite) — pensado para gestionar el negocio desde el ordenador
mobile/    App móvil (Expo / React Native) — dos roles: el barbero gestiona su agenda, y el cliente
           final crea su cuenta y reserva sus propias citas cuando quiera
```

Los tres consumen la misma API. La app móvil sirve tanto al barbero (gestión) como al cliente final
(reserva de citas con cuenta propia); el cliente también puede reservar sin cuenta desde la web pública
si el negocio prefiere atender así.

## Funcionalidades principales

- **Varios barberos, cada uno con su agenda y horario propio** (franjas por día de la semana).
- **Servicios** con precio y duración configurables por el negocio.
- **Reserva rápida**: se elige barbero, servicio y fecha, aparece una rejilla de huecos libres/ocupados
  de ese día y basta con pulsar uno; solo hace falta el nombre y el teléfono del cliente (si ya existe,
  se detecta automáticamente por el teléfono).
- **Fiabilidad del cliente**: cada cliente acumula un contador de "no se presentó" y "canceló tarde"
  (por debajo de un umbral de horas configurable). Según ese histórico se marca como Fiable / Vigilar /
  Riesgo.
- **Pre-aviso al barbero**: si un cliente con historial de faltas reserva otra cita, el barbero ve un
  aviso destacado en la agenda y al crear la cita, con recomendación (pedir confirmación extra, señal, etc).
- **Recordatorios automáticos**: al cliente se le avisa X horas antes de su cita (configurable, por
  email/WhatsApp/SMS, y por notificación push si tiene la app y la ha activado). Al barbero se le puede
  avisar también antes de citas con clientes de riesgo (por ejemplo 24h y 1h antes), para que pueda
  reconfirmar personalmente.
- **App del cliente**: el cliente crea su propia cuenta (teléfono + contraseña) en la misma app móvil,
  elige servicio, barbero (o "cualquiera") y hora, reserva, y desde "Mis citas" puede ver su historial
  y cancelar. Puede eliminar su cuenta en cualquier momento desde su perfil.

## Backend

La base de datos vive en **Supabase** (PostgreSQL gestionado, con plan gratuito). Primero crea el
proyecto:

1. Entra en https://supabase.com y crea un proyecto (elige región Europa y apunta la contraseña de la
   base de datos).
2. En el panel de Supabase: **Project Settings → Database → Connection string**. Copia dos URIs:
   - la del **Transaction pooler** (puerto 6543) → va en `DATABASE_URL`, añadiéndole `?pgbouncer=true`
   - la de **Direct connection** (puerto 5432) → va en `DIRECT_URL`

Después:

```
cd backend
cp .env.example .env     # pega ahí tus dos URIs de Supabase (sustituye [PASSWORD])
npm install
npx prisma migrate deploy
npx tsx prisma/seed.ts   # datos de ejemplo (negocio, barberos, servicios, clientes)
npm run dev              # http://localhost:4000
```

Datos de ejemplo tras el seed: login `carlos@barberia-demo.com` / `password123`.

Variables de entorno relevantes (ver `backend/.env.example`):

- `DATABASE_URL` / `DIRECT_URL`: las dos cadenas de conexión de tu proyecto Supabase (pooler y directa).
- `JWT_SECRET`: usado para firmar los tokens de acceso del panel.
- `SMTP_*`: si no se configuran, los emails se escriben por consola en vez de enviarse de verdad (útil
  para probar el flujo sin contratar nada).
- `TWILIO_*`: igual que el email, sin credenciales se loggean por consola en vez de enviarse WhatsApp/SMS.
- `REMINDER_CRON`: cada cuánto se comprueba si hay recordatorios pendientes de enviar.

Tests: `npm test`. Los tests unitarios corren siempre; los de integración con base de datos solo si
defines `TEST_DATABASE_URL` apuntando a un Postgres desechable (¡nunca al de producción, borran todo!).

## Despliegue en producción (Railway + Supabase)

> **Importante**: Supabase aloja **solo la base de datos**. El servidor de la API (el código de
> `backend/`, que es Express/Node) **no** corre "dentro de Supabase" — hay que desplegarlo en un
> hosting de Node. Aquí usamos **Railway**, que se conecta a la base de datos de Supabase. Es decir:
> *base de datos en Supabase + API en Railway*.

El repo ya trae todo lo necesario para desplegar en Railway sin tocar nada más:

- `backend/railway.json`: le dice a Railway cómo construir y arrancar (usa `/health` como healthcheck).
- Script `start:prod` (`prisma migrate deploy && node dist/server.js`): **aplica las migraciones solo**
  en cada despliegue y luego arranca el servidor. No hay que ejecutar migraciones a mano.
- `postinstall` genera el cliente de Prisma automáticamente durante el build.

Pasos:

1. Ten ya creado el proyecto de **Supabase** con sus dos cadenas de conexión (ver sección *Backend*).
2. Entra en https://railway.app, **New Project → Deploy from GitHub repo** y elige este repositorio.
3. En el servicio creado, ve a **Settings → Root Directory** y pon `backend` (es un monorepo; así
   Railway construye solo el backend y encuentra `railway.json`).
4. En **Variables**, añade las mismas que tienes en tu `.env` local:
   - `DATABASE_URL` y `DIRECT_URL` (las dos URIs de Supabase, con la contraseña real).
   - `JWT_SECRET` (una cadena larga y aleatoria — **no** reutilices la de ejemplo).
   - Opcionales según quieras que funcionen de verdad: `SMTP_*` (emails), `TWILIO_*` (WhatsApp/SMS),
     `REMINDER_CRON`.
   - **No** configures `NODE_ENV=production` en Railway: rompería el build (Railway dejaría de instalar
     las herramientas de compilación). El código no lo necesita.
5. Railway construye y despliega. Cuando termine, en **Settings → Networking → Generate Domain** obtienes
   la URL pública HTTPS, por ejemplo `https://app-barber-production.up.railway.app`.
6. Comprueba que responde: abre `https://TU-URL/health` → debe devolver `{"ok":true}`.
7. **Siembra los datos iniciales una sola vez** (crea el negocio, servicios, etc.). Desde tu ordenador,
   con el `backend/.env` apuntando a la **base de datos de Supabase** (no a la local), ejecuta
   `npm run seed`. (Railway no ejecuta el seed automáticamente, y así lo controlas tú.)

Luego, para que la **app móvil** hable con esa API en producción, define en el build de móvil
`EXPO_PUBLIC_API_URL=https://TU-URL` (ver sección *App móvil* y el checklist de tiendas más abajo).

El mismo `railway.json` y los mismos scripts sirven casi igual en **Render** o **Fly.io** si algún día
cambias de host (solo cambia la forma de declarar el comando de arranque y las variables).

## Panel web

```
cd web
cp .env.example .env   # VITE_API_URL apuntando al backend
npm install
npm run dev             # http://localhost:5173
```

## App móvil (Expo)

```
cd mobile
cp .env.example .env   # EXPO_PUBLIC_API_URL apuntando al backend
npm install
npx expo start
```

Para probarla en tu móvil con **Expo Go**:

1. El teléfono y el ordenador deben estar en la **misma red WiFi**.
2. En `mobile/.env`, pon la IP local de tu ordenador (no `localhost`), por ejemplo
   `EXPO_PUBLIC_API_URL=http://192.168.1.23:4000`.
3. Arranca el backend y luego `npx expo start` dentro de `mobile/`.
4. Escanea el código QR que aparece en la terminal con la app Expo Go.

> Nota: este proyecto se ha desarrollado en un entorno en la nube sin acceso de red entrante, así que
> no ha sido posible dejar un enlace/QR ya funcionando desde aquí (los túneles de Expo/ngrok y
> localtunnel no consiguieron establecer conexión desde este sandbox). Para probarlo en Expo Go hace
> falta ejecutarlo en tu propio ordenador siguiendo los pasos de arriba.

## Publicación en App Store / Play Store (checklist)

Requisitos que ya cumple la app y los que quedan pendientes antes de enviarla a revisión:

- ✅ **Eliminación de cuenta dentro de la app** (exigido por Apple, guideline 5.1.1): tanto para el
  barbero (pestaña "Más" → "Eliminar cuenta", borra el negocio completo en cascada; también disponible
  en el panel web) como para el cliente (pestaña "Perfil" → "Eliminar cuenta", borra su cuenta e
  historial de citas).
- ✅ Identificadores de app configurados (`com.oficinadelbarbero.app` en iOS y Android).
- ⬜ **Política de privacidad**: ambas tiendas exigen una URL pública con la política de privacidad
  (qué datos se guardan —nombres y teléfonos de clientes, citas—, con qué fin, y cómo ejercer los
  derechos RGPD). Hay que redactarla y alojarla (vale una página estática).
- ⬜ **Formulario de privacidad de las tiendas**: declarar en App Store Connect ("App Privacy") y en
  Play Console ("Data safety") que la app recoge datos de contacto de clientes.
- ⬜ **Builds de producción**: generar con EAS Build (`npx eas build`) — requiere cuenta de Apple
  Developer (99 €/año) y de Google Play Developer (25 € una vez).
- 🟡 **Backend en producción**: el repo ya está **listo para desplegar en Railway** (config
  `railway.json`, migraciones automáticas en cada deploy, healthcheck) apuntando a Supabase — ver la
  sección *Despliegue en producción*. Falta ejecutar el despliegue y apuntar la app a la URL resultante.
  Apple rechaza apps que dependan de un servidor local, así que este paso es obligatorio antes de enviar.
- ⬜ **Endurecer la API antes de abrirla al público** (recomendado, no bloquea el deploy): cerrar CORS a
  los orígenes propios, añadir rate limiting en login y en las reservas públicas, y proteger el script de
  seed para que no pueda ejecutarse por error contra producción (hoy crea un usuario con contraseña
  conocida `password123`).

## Modelo de datos (resumen)

- `Barber`: el negocio/cuenta que inicia sesión.
- `Staff`: cada barbero individual del negocio, con su `StaffWorkingHours` (horario semanal).
- `Service`: servicios del negocio (nombre, duración, precio).
- `Client`: clientes del negocio, con contadores de fiabilidad (`noShowCount`, `lateCancelCount`,
  `reliabilityStatus`). Puede tener cuenta propia (`passwordHash`) para reservar desde la app, y un
  `pushToken` si ha activado las notificaciones.
- `Appointment`: cita ligada a un `Staff`, `Client` y `Service`.
- `Reminder`: recordatorios programados (al cliente o de pre-aviso al barbero), con canal y estado de envío.
- `NotificationSettings`: configuración por negocio de cuándo y cómo avisar (horas antes, umbrales de
  fiabilidad, canales activos).
