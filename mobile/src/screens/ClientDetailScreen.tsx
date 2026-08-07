import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import type { RouteProp } from "@react-navigation/native";
import { useRoute } from "@react-navigation/native";
import { api, type Appointment, type Client } from "../api";
import { ReliabilityBadge } from "../components/ReliabilityBadge";
import { PrewarningBanner } from "../components/PrewarningBanner";
import { colors, radius } from "../theme";
import { formatDateEs, formatMoney, formatTime, STATUS_LABELS } from "../utils";

type ParamList = { ClientDetail: { id: string } };

export function ClientDetailScreen() {
  const route = useRoute<RouteProp<ParamList, "ClientDetail">>();
  const [client, setClient] = useState<(Client & { appointments: Appointment[] }) | null>(null);

  useEffect(() => {
    api.getClient(route.params.id).then((r) => setClient(r.client));
  }, [route.params.id]);

  if (!client) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title}>{client.name}</Text>
          <Text style={styles.muted}>
            {client.phone} {client.email ? `· ${client.email}` : ""}
          </Text>
        </View>
        <ReliabilityBadge status={client.reliabilityStatus} />
      </View>

      <PrewarningBanner prewarning={client.prewarning} />

      <View style={styles.statRow}>
        <Stat value={client.totalAppointments} label="Citas" />
        <Stat value={client.completedCount} label="Completadas" />
        <Stat value={client.noShowCount} label="Faltas" alert={client.noShowCount > 0} />
        <Stat value={client.lateCancelCount} label="Cancel. tarde" alert={client.lateCancelCount > 0} />
      </View>

      <Text style={styles.sectionTitle}>HISTORIAL</Text>
      <FlatList
        data={client.appointments}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 28 }}
        ListEmptyComponent={<Text style={styles.muted}>Sin citas todavía.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.rowService}>{item.service.name}</Text>
              <Text style={styles.muted}>
                {formatDateEs(item.startTime)} · {formatTime(item.startTime)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <Text style={styles.rowPrice}>{formatMoney(item.service.priceCents)}</Text>
              <Text style={styles.muted}>{STATUS_LABELS[item.status]}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function Stat({ value, label, alert }: { value: number; label: string; alert?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, alert && { color: colors.red }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.gold, fontWeight: "800", fontSize: 20 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  muted: { color: colors.muted, fontSize: 12.5 },
  statRow: { flexDirection: "row", gap: 10, marginVertical: 16 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: "center",
    gap: 2,
  },
  statValue: { fontWeight: "800", fontSize: 20, color: colors.text },
  statLabel: { color: colors.faint, fontSize: 10.5, letterSpacing: 0.3 },
  sectionTitle: { fontWeight: "700", fontSize: 11, color: colors.muted, letterSpacing: 1.2, marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 13,
  },
  rowService: { fontWeight: "700", color: colors.text, fontSize: 14.5 },
  rowPrice: { fontWeight: "700", color: colors.gold, fontSize: 14.5 },
});
