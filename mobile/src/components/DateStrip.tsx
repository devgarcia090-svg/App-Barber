import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { buildDateStrip } from "../utils";

export function DateStrip({ selected, onSelect }: { selected: string; onSelect: (dateStr: string) => void }) {
  const days = buildDateStrip();

  return (
    <FlatList
      data={days}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(d) => d.dateStr}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const isSelected = item.dateStr === selected;
        return (
          <Pressable onPress={() => onSelect(item.dateStr)} style={[styles.day, isSelected && styles.daySelected]}>
            <Text style={[styles.dayLabel, isSelected && styles.textSelected]}>{item.dayLabel}</Text>
            <Text style={[styles.dayNumber, isSelected && styles.textSelected]}>{item.dayNumber}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
    paddingVertical: 4,
  },
  day: {
    width: 52,
    height: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e3e3ea",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  daySelected: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  dayLabel: {
    fontSize: 11,
    color: "#6b6b78",
    textTransform: "capitalize",
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1c1c26",
  },
  textSelected: {
    color: "#fff",
  },
});
