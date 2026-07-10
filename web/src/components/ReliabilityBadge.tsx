import type { ReliabilityStatus } from "../api";

const LABELS: Record<ReliabilityStatus, string> = {
  RELIABLE: "Fiable",
  WATCH: "Vigilar",
  RISKY: "Riesgo",
};

export function ReliabilityBadge({ status }: { status: ReliabilityStatus }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{LABELS[status]}</span>;
}
