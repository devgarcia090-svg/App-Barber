import { StyleSheet, Text, View } from "react-native";
import type { Prewarning } from "../api";

export function PrewarningBanner({ prewarning }: { prewarning?: Prewarning | null }) {
  if (!prewarning) return null;
  const risky = prewarning.status === "RISKY";
  return (
    <View style={[styles.banner, { backgroundColor: risky ? "#fee2e2" : "#fef3c7" }]}>
      <Text style={[styles.text, { color: risky ? "#991b1b" : "#92400e" }]}>⚠️ {prewarning.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
  },
  text: {
    fontSize: 13,
    lineHeight: 18,
  },
});
