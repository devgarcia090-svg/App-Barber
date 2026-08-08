import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import { buildDateStrip } from "../utils";
import { colors, radius } from "../theme";

export function DateStrip({ selected, onSelect }: { selected: string; onSelect: (dateStr: string) => void }) {
  const days = buildDateStrip();

  return (
    <FlatList
      data={days}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(d) => d.dateStr}
      // Sin esto, una lista horizontal dentro de una columna flex se estira a
      // lo alto y deja un hueco enorme empujando el resto de la pantalla.
      style={styles.strip}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const isSelected = item.dateStr === selected;
        return (
          <Pressable onPress={() => onSelect(item.dateStr)} style={[styles.day, isSelected && styles.daySelected]}>
            <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>{item.dayLabel}</Text>
            <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>{item.dayNumber}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  strip: {
    flexGrow: 0,
  },
  list: {
    gap: 8,
    paddingVertical: 4,
  },
  day: {
    width: 52,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  daySelected: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  dayLabel: {
    fontSize: 11,
    color: colors.muted,
    textTransform: "capitalize",
    letterSpacing: 0.3,
  },
  dayLabelSelected: {
    color: "#3A2D12",
    fontWeight: "700",
  },
  dayNumber: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  dayNumberSelected: {
    color: "#1F1808",
  },
});
