import { StyleSheet, Text, View } from "react-native";
import type { ReliabilityStatus } from "../api";
import { colors, radius } from "../theme";

const LABELS: Record<ReliabilityStatus, string> = {
  RELIABLE: "Fiable",
  WATCH: "Vigilar",
  RISKY: "Riesgo",
};

const STYLES: Record<ReliabilityStatus, { bg: string; fg: string }> = {
  RELIABLE: { bg: colors.greenSoft, fg: colors.green },
  WATCH: { bg: colors.amberSoft, fg: colors.amber },
  RISKY: { bg: colors.redSoft, fg: colors.red },
};

export function ReliabilityBadge({ status }: { status: ReliabilityStatus }) {
  const s = STYLES[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <View style={[styles.dot, { backgroundColor: s.fg }]} />
      <Text style={[styles.text, { color: s.fg }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});
