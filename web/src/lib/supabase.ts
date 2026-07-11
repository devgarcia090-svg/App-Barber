import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Surfaces a clear message during dev instead of a cryptic network error.
  console.error("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el .env");
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: { persistSession: true, autoRefreshToken: true },
});

// This app books against a single business, identified by its public slug.
export const BUSINESS_SLUG = (import.meta.env.VITE_BUSINESS_SLUG as string | undefined) ?? "oficina-del-barbero";
