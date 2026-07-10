import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { api, type Client } from "../api";
import { ReliabilityBadge } from "../components/ReliabilityBadge";
import { colors, radius } from "../theme";
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

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={17} color={colors.faint} />
        <TextInput
          style={styles.search}
          placeholder="Buscar por nombre o teléfono..."
          placeholderTextColor={colors.faint}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 28 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color={colors.faint} />
            <Text style={styles.emptyText}>No hay clientes</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceElevated }]}
            onPress={() => navigation.navigate("ClientDetail", { id: item.id })}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.muted}>{item.phone}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 5 }}>
              <ReliabilityBadge status={item.reliabilityStatus} />
              {(item.noShowCount > 0 || item.lateCancelCount > 0) && (
                <Text style={styles.strikes}>
                  {item.noShowCount} faltas · {item.lateCancelCount} tarde
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.faint} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16, paddingTop: 8 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginBottom: 14 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  search: { flex: 1, paddingVertical: 12, color: colors.text, fontSize: 14.5 },
  empty: { alignItems: "center", gap: 10, marginTop: 48 },
  emptyText: { color: colors.faint, fontSize: 14 },
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
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.gold, fontWeight: "800", fontSize: 16 },
  name: { fontWeight: "700", fontSize: 15.5, color: colors.text },
  muted: { color: colors.muted, fontSize: 12.5 },
  strikes: { color: colors.faint, fontSize: 11 },
});
