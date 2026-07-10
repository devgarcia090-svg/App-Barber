import { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, ApiError, type Service } from "../api";
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
      <Text style={styles.title}>Servicios</Text>
      <View style={styles.form}>
        <Text style={styles.label}>Nombre</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Duración (min)</Text>
            <TextInput style={styles.input} value={duration} onChangeText={setDuration} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Precio (€)</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" />
          </View>
        </View>
        <Pressable style={styles.saveBtn} onPress={handleCreate}>
          <Text style={styles.saveBtnText}>+ Añadir servicio</Text>
        </Pressable>
      </View>

      <FlatList
        data={services}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={{ fontWeight: "700" }}>{item.name}</Text>
            <Text style={styles.muted}>
              {item.durationMinutes} min · {formatMoney(item.priceCents)}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7fb", padding: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  label: { fontWeight: "600", fontSize: 13, marginTop: 6 },
  input: { borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 10, padding: 10, backgroundColor: "#fff" },
  form: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e3e3ea", padding: 12, gap: 4 },
  saveBtn: { backgroundColor: "#2563eb", borderRadius: 10, padding: 12, alignItems: "center", marginTop: 10 },
  saveBtnText: { color: "#fff", fontWeight: "700" },
  row: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 10, padding: 10 },
  muted: { color: "#6b6b78", fontSize: 12 },
});
