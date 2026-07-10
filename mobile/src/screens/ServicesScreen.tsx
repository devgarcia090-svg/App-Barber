import { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError, type Service } from "../api";
import { colors, radius } from "../theme";
import { formatMoney } from "../utils";

export function ServicesScreen() {
  const [services, setServices] = useState<Service[]>([]);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("15");

  useEffect(() => {
    api.getServices().then((r) => setServices(r.services));
  }, []);

  async function handleCreate() {
    if (!name) return;
    try {
      const { service } = await api.createService({
        name,
        durationMinutes: Number(duration),
        priceCents: Math.round(Number(price) * 100),
      });
      setServices((prev) => [...prev, service]);
      setName("");
    } catch (err) {
      Alert.alert("Error", err instanceof ApiError ? err.message : "No se pudo crear el servicio");
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.label}>NOMBRE DEL SERVICIO</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Corte de pelo" placeholderTextColor={colors.faint} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={styles.label}>DURACIÓN (MIN)</Text>
            <TextInput style={styles.input} value={duration} onChangeText={setDuration} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={styles.label}>PRECIO (€)</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" />
          </View>
        </View>
        <Pressable style={({ pressed }) => [styles.saveBtn, pressed && { backgroundColor: colors.goldDark }]} onPress={handleCreate}>
          <Text style={styles.saveBtnText}>+ AÑADIR SERVICIO</Text>
        </Pressable>
      </View>

      <FlatList
        data={services}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ gap: 10, paddingVertical: 16 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Ionicons name="cut-outline" size={18} color={colors.gold} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.muted}>{item.durationMinutes} min</Text>
            </View>
            <Text style={styles.price}>{formatMoney(item.priceCents)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  label: { fontWeight: "700", fontSize: 11, color: colors.muted, letterSpacing: 1.1 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  saveBtn: { backgroundColor: colors.gold, borderRadius: radius.sm, padding: 13, alignItems: "center", marginTop: 10 },
  saveBtnText: { color: "#1F1808", fontWeight: "800", fontSize: 12.5, letterSpacing: 1.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 13,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: { fontWeight: "700", color: colors.text, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 12.5 },
  price: { fontWeight: "800", color: colors.gold, fontSize: 15.5 },
});
