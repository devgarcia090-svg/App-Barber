import type { Prewarning } from "../api";

export function PrewarningBanner({ prewarning }: { prewarning?: Prewarning | null }) {
  if (!prewarning) return null;
  return <div className={`prewarning prewarning-${prewarning.status.toLowerCase()}`}>⚠️ {prewarning.message}</div>;
}
