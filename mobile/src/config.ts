import Constants from "expo-constants";

function guessLanApiUrl(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } }).manifest2?.extra?.expoGo?.debuggerHost;
  if (!hostUri) return null;
  const host = hostUri.split(":")[0];
  return host ? `http://${host}:4000` : null;
}

// Set EXPO_PUBLIC_API_URL in mobile/.env to point at your backend (required
// when using `expo start --tunnel`, since the LAN-IP guess won't work).
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? guessLanApiUrl() ?? "http://localhost:4000";

// This app is single-tenant: it only ever books appointments for one
// business, identified by its public slug (see backend's Barber.slug).
export const BUSINESS_SLUG = process.env.EXPO_PUBLIC_BUSINESS_SLUG ?? "oficina-del-barbero";
