# Generar las apps para App Store y Play Store (EAS)

La app se compila con **EAS Build** (servicio de Expo en la nube: no necesitas Mac para el IPA de iOS).
El repo ya trae `mobile/eas.json` con los perfiles listos. Todo esto se ejecuta desde tu ordenador dentro
de `mobile/`.

## 0. Requisitos

- Cuenta de Expo (gratis) en https://expo.dev.
- Para publicar: cuenta de **Apple Developer** (99 €/año) y/o **Google Play Developer** (25 € pago único).
- CLI:
  ```bash
  npm i -g eas-cli
  eas login
  ```

## 1. Crear el proyecto EAS

```bash
cd mobile
eas init
```
Esto crea el proyecto en tu cuenta de Expo y escribe `extra.eas.projectId` en `app.json` (también es lo que
permite que funcionen las notificaciones push en la app compilada). Haz commit de ese cambio.

## 2. Poner tus valores de Supabase en `eas.json`

En `mobile/eas.json`, sustituye en los tres perfiles:
- `EXPO_PUBLIC_SUPABASE_URL` → la URL de tu proyecto Supabase.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` → tu *anon public key* (es pública, no pasa nada por incluirla).
- `EXPO_PUBLIC_BUSINESS_SLUG` → `oficina-del-barbero` (o el que uses).

Estas variables se incrustan en el build; si las cambias hay que recompilar.

## 3. Compilar

- **APK de prueba** (instalable directo en un Android, para probar en tu móvil):
  ```bash
  eas build -p android --profile preview
  ```
  Al terminar te da un enlace para descargar el `.apk`.

- **Producción** (para las tiendas):
  ```bash
  eas build -p android --profile production   # genera un .aab para Play
  eas build -p ios --profile production        # genera el .ipa (te pedirá tu cuenta Apple; EAS gestiona la firma)
  ```

El número de versión (`versionCode` / `buildNumber`) se incrementa solo en el servidor (`autoIncrement` +
`appVersionSource: remote`); no tienes que tocarlo a mano.

## 4. Notificaciones push en producción

- **Android:** sube las credenciales de FCM para que Expo pueda enviar el push:
  ```bash
  eas credentials    # Android → Push Notifications (FCM V1) → sigue el asistente
  ```
- **iOS:** EAS configura APNs automáticamente al compilar con tu cuenta Apple.

(Sin esto, la app funciona igual pero no llegan los recordatorios push.)

## 5. Enviar a las tiendas

Rellena la sección `submit.production` de `eas.json`:
- **iOS:** `appleId` (tu email de Apple), `ascAppId` (el ID de la app en App Store Connect) y `appleTeamId`.
- **Android:** descarga el JSON de una cuenta de servicio desde **Google Play Console → Configuración → Acceso
  a la API → Cuentas de servicio**, guárdalo como `mobile/play-service-account.json` (ya está en `.gitignore`,
  **no lo subas al repo**).

Luego:
```bash
eas submit -p android --profile production
eas submit -p ios --profile production
```

Esto sube el build al **canal de pruebas interno** (Play Internal testing / TestFlight). Pruébalo ahí antes
de mandarlo a revisión pública.

## Checklist antes de enviar a revisión

- [ ] `eas init` hecho (projectId en `app.json`).
- [ ] Valores de Supabase reales en `eas.json`.
- [ ] Política de privacidad publicada (ver `docs/legal-tiendas.md`) y su URL puesta en la ficha.
- [ ] Formularios de privacidad de App Store Connect y Play Console rellenos (ver `docs/legal-tiendas.md`).
- [ ] Credenciales FCM subidas (push Android).
- [ ] Capturas de pantalla, descripción, icono de 1024×1024 (iOS) y ficha de Play completa.

> Nota: los identificadores de app ya están configurados (`com.oficinadelbarbero.app` en iOS y Android).
