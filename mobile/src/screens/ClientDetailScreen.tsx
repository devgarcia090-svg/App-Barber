import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import type { RouteProp } from "@react-navigation/native";
import { useRoute } from "@react-navigation/native";
import { api, type Appointment, type Client } from "../api";
import { ReliabilityBadge } from "../components/ReliabilityBadge";
import { PrewarningBanner } from "../components/PrewarningBanner";
import { formatMoney, formatTime, STATUS_LABELS } from "../utils";

type ParamList = { ClientDetail: { id: string } };

export function ClientDetailScreen() {
  const route = useRoute<RouteProp<ParamList, "ClientDetail">>();
  const [client, setClient] = useState<(Client & { appointments: Appointment[] }) | null>(null);

  useEffect(() => {
    api.getClient(route.params.id).then((r) => setClient(r.client));
  }, [route.params.id]);

  if (!client) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{client.name}</Text>
        <ReliabilityBadge status={client.reliabilityStatus} />
      </View>
      <Text style={styles.muted}>
        {client.phone} {client.email ? `· ${client.email}` : ""}
      </Text>
      <PrewarningBanner prewarning={client.prewarning} />

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{client.totalAppointments}</Text>
          <Text style={styles.muted}>Citas</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{client.completedCount}</Text>
          <Text style={styles.muted}>Completadas</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{client.noShowCount}</Text>
          <Text style={styles.muted}>Faltas</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{client.lateCancelCount}</Text>
          <Text style={styles.muted}>Cancel. tarde</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Historial</Text>
      <FlatList
        data={client.appointments}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        ListEmptyComponent={<Text style={styles.muted}>Sin citas todavía.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.muted}>
              {new Date(item.startTime).toLocaleDateString("es-ES")} {formatTime(item.startTime)}
            </Text>
            <Text style={{ fontWeight: "600" }}>{item.service.name}</Text>
            <Text style={styles.muted}>
              {formatMoney(item.service.priceCents)} · {STATUS_LABELS[item.status]}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7fb", padding: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  muted: { color: "#6b6b78", fontSize: 12 },
  statRow: { flexDirection: "row", gap: 12, marginVertical: 12, flexWrap: "wrap" },
  stat: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e3e3ea", padding: 10, alignItems: "center", flexGrow: 1 },
  statValue: { fontWeight: "700", fontSize: 18 },
  sectionTitle: { fontWeight: "700", fontSize: 16, marginBottom: 8, marginTop: 8 },
  row: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 10, padding: 10, gap: 2 },
});
