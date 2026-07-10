import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError, type Appointment, type AppointmentStatus, type Staff } from "../api";
import { ReliabilityBadge } from "../components/ReliabilityBadge";
import { PrewarningBanner } from "../components/PrewarningBanner";
import { DateStrip } from "../components/DateStrip";
import { dayBounds, formatDateHuman, formatMoney, formatTime, STATUS_LABELS, todayStr } from "../utils";

const NEXT_STATUS: Partial<Record<AppointmentStatus, { label: string; status: AppointmentStatus }[]>> = {
  PENDING: [
    { label: "Confirmar", status: "CONFIRMED" },
    { label: "Cancelar", status: "CANCELLED" },
  ],
  CONFIRMED: [
    { label: "Completada", status: "COMPLETED" },
    { label: "No presentado", status: "NO_SHOW" },
    { label: "Cancelar", status: "CANCELLED" },
  ],
};

export function AgendaScreen() {
  const [date, setDate] = useState(todayStr());
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState<string>("all");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getStaff().then((r) => setStaff(r.staff.filter((s) => s.active)));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const { from, to } = dayBounds(date);
    api
      .getAppointments({ from, to, ...(staffId !== "all" ? { staffId } : {}) })
      .then((r) => setAppointments(r.appointments))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error cargando la agenda"))
      .finally(() => setLoading(false));
  }, [date, staffId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function updateStatus(appointmentId: string, status: AppointmentStatus) {
    try {
      const { appointment } = await api.setAppointmentStatus(appointmentId, status);
      setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, ...appointment } : a)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar la cita");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Agenda</Text>
      <DateStrip selected={date} onSelect={setDate} />
      <Text style={styles.dateHuman}>{formatDateHuman(date)}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.staffTabs} contentContainerStyle={{ gap: 8 }}>
        <Pressable style={[styles.chip, staffId === "all" && styles.chipActive]} onPress={() => setStaffId("all")}>
          <Text style={[styles.chipText, staffId === "all" && styles.chipTextActive]}>Todos</Text>
        </Pressable>
        {staff.map((s) => (
          <Pressable key={s.id} style={[styles.chip, staffId === s.id && styles.chipActive]} onPress={() => setStaffId(s.id)}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={[styles.chipText, staffId === s.id && styles.chipTextActive]}>{s.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {error && <Text style={styles.error}>{error}</Text>}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={(a) => a.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
          ListEmptyComponent={<Text style={styles.muted}>No hay citas ese día.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.time}>
                  {formatTime(item.startTime)} - {formatTime(item.endTime)}
                </Text>
                <View style={[styles.statusPill]}>
                  <Text style={styles.statusText}>{STATUS_LABELS[item.status]}</Text>
                </View>
              </View>
              <View style={styles.clientRow}>
                <Text style={styles.clientName}>{item.client.name}</Text>
                <ReliabilityBadge status={item.client.reliabilityStatus} />
              </View>
              <Text style={styles.muted}>
                {item.service.name} · {formatMoney(item.service.priceCents)}
                {staffId === "all" && item.staff ? ` · ${item.staff.name}` : ""}
              </Text>
              <PrewarningBanner prewarning={item.prewarning} />
              <View style={styles.actions}>
                {(NEXT_STATUS[item.status] ?? []).map((next) => (
                  <Pressable key={next.status} style={styles.actionBtn} onPress={() => updateStatus(item.id, next.status)}>
                    <Text style={styles.actionText}>{next.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7fb", padding: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  dateHuman: { color: "#6b6b78", marginVertical: 8, textTransform: "capitalize" },
  staffTabs: { marginBottom: 12, maxHeight: 40 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#e3e3ea",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  chipActive: { borderColor: "#2563eb" },
  chipText: { fontSize: 13, color: "#1c1c26" },
  chipTextActive: { color: "#2563eb", fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: 999 },
  error: { color: "#dc2626", marginBottom: 8 },
  muted: { color: "#6b6b78" },
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e3e3ea", padding: 12, gap: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  time: { fontWeight: "700" },
  statusPill: { backgroundColor: "#f1f1f4", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, color: "#6b6b78" },
  clientRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  clientName: { fontWeight: "700", fontSize: 15 },
  actions: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },
  actionBtn: { borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  actionText: { fontSize: 12, fontWeight: "600", color: "#2563eb" },
});
