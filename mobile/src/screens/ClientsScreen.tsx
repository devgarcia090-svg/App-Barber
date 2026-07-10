import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, type Client } from "../api";
import { ReliabilityBadge } from "../components/ReliabilityBadge";
import type { RootStackParamList } from "../navigation/RootNavigator";

export function ClientsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      api.getClients().then((r) => setClients(r.clients));
    }, [])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [clients, query]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Clientes</Text>
      <TextInput style={styles.search} placeholder="Buscar por nombre o teléfono..." value={query} onChangeText={setQuery} />
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        ListEmptyComponent={<Text style={styles.muted}>No hay clientes.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate("ClientDetail", { id: item.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.muted}>{item.phone}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <ReliabilityBadge status={item.reliabilityStatus} />
              <Text style={styles.muted}>
                {item.noShowCount} faltas · {item.lateCancelCount} tarde
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7fb", padding: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 12 },
  search: { borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 10, padding: 12, backgroundColor: "#fff", marginBottom: 12 },
  muted: { color: "#6b6b78", fontSize: 12 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e3ea",
    borderRadius: 12,
    padding: 12,
  },
  name: { fontWeight: "700", fontSize: 15 },
});
