import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError, type Appointment, type AppointmentStatus } from "../api";
import { colors, radius } from "../theme";
import { formatDateHuman, formatMoney, formatTime, STATUS_LABELS, toDateStr } from "../utils";

const STATUS_COLORS: Record<AppointmentStatus, { bg: string; fg: string }> = {
  PENDING: { bg: colors.amberSoft, fg: colors.amber },
  CONFIRMED: { bg: colors.blueSoft, fg: colors.blue },
  COMPLETED: { bg: colors.greenSoft, fg: colors.green },
  CANCELLED: { bg: "#2A2A33", fg: colors.muted },
  NO_SHOW: { bg: colors.redSoft, fg: colors.red },
};

export function MyAppointmentsScreen() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getMyAppointments()
      .then((r) => setAppointments(r.appointments))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function confirmCancel(appointment: Appointment) {
    Alert.alert("Cancelar cita", `¿Seguro que quieres cancelar tu cita del ${formatDateHuman(toDateStr(new Date(appointment.startTime)))}?`, [
      { text: "No", style: "cancel" },
      {
        text: "Sí, cancelar",
        style: "destructive",
        onPress: async () => {
          try {
            const { appointment: updated } = await api.cancelMyAppointment(appointment.id);
            setAppointments((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
          } catch (err) {
            Alert.alert("Error", err instanceof ApiError ? err.message : "No se pudo cancelar la cita");
          }
        },
      },
    ]);
  }

  const now = Date.now();
  const canCancel = (a: Appointment) => (a.status === "PENDING" || a.status === "CONFIRMED") && new Date(a.startTime).getTime() > now;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis citas</Text>
      <FlatList
        data={appointments}
        keyExtractor={(a) => a.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.gold} />}
        contentContainerStyle={{ gap: 12, paddingBottom: 28 }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-clear-outline" size={40} color={colors.faint} />
              <Text style={styles.emptyText}>Todavía no tienes citas</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const statusStyle = STATUS_COLORS[item.status];
          const start = new Date(item.startTime);
          return (
            <View style={[styles.card, { borderLeftColor: item.staff?.color ?? colors.gold }]}>
              <View style={styles.cardHeader}>
                <Text style={styles.date}>{formatDateHuman(toDateStr(start))}</Text>
                <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusText, { color: statusStyle.fg }]}>{STATUS_LABELS[item.status]}</Text>
                </View>
              </View>
              <View style={styles.timeWrap}>
                <Ionicons name="time-outline" size={14} color={colors.gold} />
                <Text style={styles.time}>{formatTime(item.startTime)}</Text>
              </View>
              <Text style={styles.meta}>
                {item.service.name} · {formatMoney(item.service.priceCents)}
                {item.staff ? `  ·  ${item.staff.name}` : ""}
              </Text>
              {canCancel(item) && (
                <Pressable style={styles.cancelBtn} onPress={() => confirmCancel(item)}>
                  <Text style={styles.cancelText}>Cancelar cita</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16, paddingTop: 8 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginBottom: 14 },
  empty: { alignItems: "center", gap: 10, marginTop: 48 },
  emptyText: { color: colors.faint, fontSize: 14 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, padding: 14, gap: 6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { fontWeight: "700", color: colors.text, fontSize: 14, textTransform: "capitalize" },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  timeWrap: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  time: { fontWeight: "700", color: colors.text, fontSize: 14 },
  meta: { color: colors.muted, fontSize: 13 },
  cancelBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.red + "55",
    backgroundColor: colors.redSoft,
    borderRadius: radius.sm,
    paddingVertical: 9,
    alignItems: "center",
  },
  cancelText: { fontSize: 12.5, fontWeight: "700", color: colors.red },
});
