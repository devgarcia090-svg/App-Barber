import { StyleSheet, Text, View } from "react-native";
import type { ReliabilityStatus } from "../api";

const LABELS: Record<ReliabilityStatus, string> = {
  RELIABLE: "Fiable",
  WATCH: "Vigilar",
  RISKY: "Riesgo",
};

const COLORS: Record<ReliabilityStatus, { bg: string; fg: string }> = {
  RELIABLE: { bg: "#dcfce7", fg: "#15803d" },
  WATCH: { bg: "#fef3c7", fg: "#b45309" },
  RISKY: { bg: "#fee2e2", fg: "#b91c1c" },
};

export function ReliabilityBadge({ status }: { status: ReliabilityStatus }) {
  const colors = COLORS[status];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.fg }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
  },
});
