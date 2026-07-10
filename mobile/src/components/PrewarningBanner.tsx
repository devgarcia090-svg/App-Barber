import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Prewarning } from "../api";
import { colors, radius } from "../theme";

export function PrewarningBanner({ prewarning }: { prewarning?: Prewarning | null }) {
  if (!prewarning) return null;
  const risky = prewarning.status === "RISKY";
  const fg = risky ? colors.red : colors.amber;
  const bg = risky ? colors.redSoft : colors.amberSoft;
  return (
    <View style={[styles.banner, { backgroundColor: bg, borderColor: fg + "55" }]}>
      <Ionicons name="warning" size={16} color={fg} style={{ marginTop: 1 }} />
      <Text style={[styles.text, { color: fg }]}>{prewarning.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
});
