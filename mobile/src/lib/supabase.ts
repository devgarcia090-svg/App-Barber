import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Proyecto real de la barbería, por defecto. La clave anon es pública por
// diseño (todo el acceso está limitado por RLS) y ya está en el repo en
// web/.env.production y eas.json, así que ponerla aquí no expone nada nuevo.
// Antes esto dependía de crear un .env a mano: si faltaba, la clave quedaba
// vacía y Supabase respondía "No API key found in request", que el login
// mostraba como "contraseña incorrecta". Con estos valores por defecto la app
// funciona recién clonada, y un .env sigue teniendo prioridad para desarrollo.
const DEFAULT_SUPABASE_URL = "https://djfqlctpcchadjaxcvcb.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZnFsY3RwY2NoYWRqYXhjdmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTkyNTcsImV4cCI6MjA5OTI3NTI1N30.PTy5G72l7S8O1TXR9hl9Pd8EdF7h3z06iXW1xmuFD0o";

// Una variable presente pero vacía es lo mismo que no tenerla: mejor caer al
// valor por defecto que crear un cliente que falla en cada petición.
function envOr(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export const SUPABASE_URL = envOr(process.env.EXPO_PUBLIC_SUPABASE_URL, DEFAULT_SUPABASE_URL);
export const SUPABASE_ANON_KEY = envOr(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_ANON_KEY);

// Single business this app books against.
export const BUSINESS_SLUG = envOr(process.env.EXPO_PUBLIC_BUSINESS_SLUG, "oficina-del-barbero");

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
