import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

// Falls back to the LAN IP of the Expo dev server for local testing, so a phone
// on the same WiFi can reach a locally-run Supabase if you ever need it; in
// production set EXPO_PUBLIC_SUPABASE_URL to your Supabase project URL.
function guessLanSupabaseUrl(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } }).manifest2?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(":")[0];
  return host ? `http://${host}:54321` : null;
}

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? guessLanSupabaseUrl() ?? "http://localhost:54321";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Single business this app books against.
export const BUSINESS_SLUG = process.env.EXPO_PUBLIC_BUSINESS_SLUG ?? "oficina-del-barbero";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
