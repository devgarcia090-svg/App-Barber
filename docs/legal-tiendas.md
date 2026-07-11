# Legal y privacidad para App Store / Play Store

Guía para superar la revisión de las tiendas. La política de privacidad y los términos ya están dentro de
la web (rutas `/privacidad` y `/terminos`), así que una vez despliegues la web en Cloudflare Pages tendrás
las URLs públicas que piden las tiendas.

## 1. Rellena estos campos antes de publicar

En `web/src/pages/LegalPages.tsx`, sustituye los corchetes por los datos reales del negocio:

- `[Nombre o razón social del negocio]`
- `[NIF]`
- `[dirección]`
- `[email de contacto]` (aparece varias veces)

Vuelve a desplegar la web tras editarlos. La URL de tu política será
`https://TU-SITIO.pages.dev/privacidad` y la de términos `https://TU-SITIO.pages.dev/terminos` (o tu dominio
propio en Cloudflare).

## 2. URLs y datos que piden las fichas de la tienda

- **Política de privacidad (obligatoria en ambas):** `https://TU-SITIO.pages.dev/privacidad`
- **Email de soporte:** el email de contacto del negocio.
- **Eliminación de cuenta:** ya está dentro de la app (cliente: Perfil → «Eliminar cuenta»; dueño: Ajustes).
  - Apple (guía 5.1.1(v)): cumplido, es in-app.
  - Google Play exige además indicar cómo se solicita el borrado: enlaza a la misma política / al email, e
    indica que se puede borrar desde la propia app.

## 3. App Store Connect → «App Privacy» (Datos recogidos)

Declara estos tipos de datos. Ninguno se usa para *tracking* ni para publicidad; todos son para el
funcionamiento de la app y están vinculados al usuario:

| Tipo de dato | Categoría Apple | Finalidad |
|---|---|---|
| Nombre | Contact Info → Name | App Functionality |
| Teléfono | Contact Info → Phone Number | App Functionality |
| Email (opcional) | Contact Info → Email Address | App Functionality |
| Historial de citas | User Content / Other Data | App Functionality |
| Token de notificaciones | Identifiers → Device ID (push) | App Functionality |

- «¿Se usan para rastrear al usuario?» → **No**.
- «¿Se comparten con terceros para publicidad?» → **No**.
- Los proveedores (Supabase, Expo) son *encargados del tratamiento*, no compradores de datos.

## 4. Google Play Console → «Data safety»

- **Datos recogidos:** Nombre, Teléfono, Email (opcional), Identificadores (token push), Actividad en la app
  (historial de citas).
- **¿Se comparten con terceros?** No (solo proveedores que procesan por cuenta del negocio).
- **Cifrado en tránsito:** Sí (HTTPS).
- **¿El usuario puede pedir que se borren sus datos?** Sí — desde la propia app y/o escribiendo al email de
  contacto.
- **Datos recogidos obligatorios/opcionales:** Nombre y teléfono obligatorios para reservar; email opcional.

## 5. Otras cuentas necesarias (recordatorio)

- **Apple Developer Program**: 99 €/año.
- **Google Play Developer**: 25 € pago único.
- Nombre de desarrollador y datos de contacto se configuran en cada consola (no van en el código).

> Nota: esto es una guía práctica basada en lo que la app recoge; no es asesoramiento legal. Conviene que un
> profesional revise la política y los términos antes de publicar, sobre todo la parte de RGPD.
