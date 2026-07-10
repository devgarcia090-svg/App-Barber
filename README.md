# App-Barber

App de reservas para barberías (estilo Booksy) centrada en resolver el problema de los clientes que no
cancelan a tiempo: lleva la cuenta de faltas y cancelaciones tardías por cliente, avisa al barbero antes
de que llegue una cita con un cliente "de riesgo" y manda recordatorios (email / WhatsApp / SMS) horas
antes de cada cita.

## Estructura del repo

```
backend/   API (Express + TypeScript + Prisma + SQLite)
web/       Panel web para el barbero (React + Vite) — pensado para reservar desde el ordenador
mobile/    App móvil (Expo / React Native) — mismo panel, para usar desde el móvil con Expo Go
```

Los tres consumen la misma API. No hay una app para el cliente final: el barbero (o quien atienda el
teléfono) es quien crea las citas, poniendo solo el nombre y el teléfono de quien llama.

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
  email/WhatsApp/SMS). Al barbero se le puede avisar también antes de citas con clientes de riesgo
  (por ejemplo 24h y 1h antes), para que pueda reconfirmar personalmente.

## Backend

```
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npx tsx prisma/seed.ts   # datos de ejemplo (negocio, barberos, servicios, clientes)
npm run dev              # http://localhost:4000
```

Datos de ejemplo tras el seed: login `carlos@barberia-demo.com` / `password123`.

Variables de entorno relevantes (ver `backend/.env.example`):

- `DATABASE_URL`: SQLite por defecto para desarrollo; cambia el `provider`/`url` en `prisma/schema.prisma`
  a Postgres para producción.
- `JWT_SECRET`: usado para firmar los tokens de acceso del panel.
- `SMTP_*`: si no se configuran, los emails se escriben por consola en vez de enviarse de verdad (útil
  para probar el flujo sin contratar nada).
- `TWILIO_*`: igual que el email, sin credenciales se loggean por consola en vez de enviarse WhatsApp/SMS.
- `REMINDER_CRON`: cada cuánto se comprueba si hay recordatorios pendientes de enviar.

Tests: `npm test` (motor de fiabilidad + citas, con SQLite de test independiente).

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

## Modelo de datos (resumen)

- `Barber`: el negocio/cuenta que inicia sesión.
- `Staff`: cada barbero individual del negocio, con su `StaffWorkingHours` (horario semanal).
- `Service`: servicios del negocio (nombre, duración, precio).
- `Client`: clientes del negocio, con contadores de fiabilidad (`noShowCount`, `lateCancelCount`,
  `reliabilityStatus`).
- `Appointment`: cita ligada a un `Staff`, `Client` y `Service`.
- `Reminder`: recordatorios programados (al cliente o de pre-aviso al barbero), con canal y estado de envío.
- `NotificationSettings`: configuración por negocio de cuándo y cómo avisar (horas antes, umbrales de
  fiabilidad, canales activos).
