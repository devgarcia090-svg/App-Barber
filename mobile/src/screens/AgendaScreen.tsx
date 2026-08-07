import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError, type Appointment, type AppointmentStatus, type PaymentMethod, type Staff } from "../api";
import { ReliabilityBadge } from "../components/ReliabilityBadge";
import { PrewarningBanner } from "../components/PrewarningBanner";
import { DateStrip } from "../components/DateStrip";
import { colors, radius } from "../theme";
import { dayBounds, formatDateHuman, formatMoney, formatTime, STATUS_LABELS, todayStr } from "../utils";

const NEXT_STATUS: Partial<Record<AppointmentStatus, { label: string; status: AppointmentStatus; danger?: boolean }[]>> = {
  PENDING: [
    { label: "Confirmar", status: "CONFIRMED" },
    { label: "Cancelar", status: "CANCELLED", danger: true },
  ],
  CONFIRMED: [
    { label: "Completada", status: "COMPLETED" },
    { label: "No presentado", status: "NO_SHOW", danger: true },
    { label: "Cancelar", status: "CANCELLED", danger: true },
  ],
};

const STATUS_COLORS: Record<AppointmentStatus, { bg: string; fg: string }> = {
  PENDING: { bg: colors.amberSoft, fg: colors.amber },
  CONFIRMED: { bg: colors.blueSoft, fg: colors.blue },
  COMPLETED: { bg: colors.greenSoft, fg: colors.green },
  CANCELLED: { bg: "#2A2A33", fg: colors.muted },
  NO_SHOW: { bg: colors.redSoft, fg: colors.red },
};

export function AgendaScreen() {
  const [date, setDate] = useState(todayStr());
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState<string>("all");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingFor, setPayingFor] = useState<Appointment | null>(null);

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

  async function complete(appointmentId: string, method: PaymentMethod | null) {
    try {
      const { appointment } = await api.completeAppointment(appointmentId, method);
      setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, ...appointment } : a)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la cita");
    } finally {
      setPayingFor(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Agenda</Text>
      <DateStrip selected={date} onSelect={setDate} />
      <Text style={styles.dateHuman}>{formatDateHuman(date)}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.staffTabs} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Todos" active={staffId === "all"} onPress={() => setStaffId("all")} />
        {staff.map((s) => (
          <Chip key={s.id} label={s.name} color={s.color} active={staffId === s.id} onPress={() => setStaffId(s.id)} />
        ))}
      </ScrollView>

      {error && <Text style={styles.error}>{error}</Text>}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.gold} />
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={(a) => a.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.gold} />}
          contentContainerStyle={{ gap: 12, paddingBottom: 28 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-clear-outline" size={40} color={colors.faint} />
              <Text style={styles.emptyText}>No hay citas este día</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = STATUS_COLORS[item.status];
            return (
              <View style={[styles.card, { borderLeftColor: item.staff?.color ?? colors.gold }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.timeWrap}>
                    <Ionicons name="time-outline" size={14} color={colors.gold} />
                    <Text style={styles.time}>
                      {formatTime(item.startTime)} – {formatTime(item.endTime)}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusText, { color: statusStyle.fg }]}>{STATUS_LABELS[item.status]}</Text>
                  </View>
                </View>

                <View style={styles.clientRow}>
                  <Text style={styles.clientName}>{item.client.name}</Text>
                  <ReliabilityBadge status={item.client.reliabilityStatus} />
                </View>
                <Text style={styles.meta}>
                  {item.service.name} · {formatMoney(item.service.priceCents)}
                  {staffId === "all" && item.staff ? `  ·  ${item.staff.name}` : ""}
                </Text>

                <PrewarningBanner prewarning={item.prewarning} />

                {(NEXT_STATUS[item.status] ?? []).length > 0 && (
                  <View style={styles.actions}>
                    {(NEXT_STATUS[item.status] ?? []).map((next) => (
                      <Pressable
                        key={next.status}
                        style={({ pressed }) => [styles.actionBtn, next.danger && styles.actionBtnDanger, pressed && { opacity: 0.7 }]}
                        onPress={() => (next.status === "COMPLETED" ? setPayingFor(item) : updateStatus(item.id, next.status))}
                      >
                        <Text style={[styles.actionText, next.danger && { color: colors.red }]}>{next.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {item.status === "COMPLETED" && item.paymentMethod && (
                  <Text style={styles.payTag}>{item.paymentMethod === "CASH" ? "💶 Efectivo" : "💳 Tarjeta"}</Text>
                )}
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!payingFor} transparent animationType="fade" onRequestClose={() => setPayingFor(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPayingFor(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>¿Cómo ha pagado?</Text>
            {payingFor && (
              <Text style={styles.modalSubtitle}>
                {payingFor.client.name} · {payingFor.service.name} · {formatMoney(payingFor.service.priceCents)}
              </Text>
            )}
            <View style={styles.payOptions}>
              <Pressable style={styles.payBtn} onPress={() => payingFor && complete(payingFor.id, "CASH")}>
                <Text style={styles.payEmoji}>💶</Text>
                <Text style={styles.payLabel}>Efectivo</Text>
              </Pressable>
              <Pressable style={styles.payBtn} onPress={() => payingFor && complete(payingFor.id, "CARD")}>
                <Text style={styles.payEmoji}>💳</Text>
                <Text style={styles.payLabel}>Tarjeta</Text>
              </Pressable>
            </View>
            <Pressable style={styles.modalSkip} onPress={() => payingFor && complete(payingFor.id, null)}>
              <Text style={styles.modalSkipText}>Completar sin especificar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Chip({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      {color && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16, paddingTop: 8 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginBottom: 12 },
  dateHuman: { color: colors.muted, marginVertical: 10, textTransform: "capitalize", fontSize: 13, letterSpacing: 0.3 },
  staffTabs: { marginBottom: 14, maxHeight: 40, flexGrow: 0 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  chipText: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  chipTextActive: { color: colors.gold },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  error: { color: colors.red, marginBottom: 8, fontSize: 13 },
  empty: { alignItems: "center", gap: 10, marginTop: 48 },
  emptyText: { color: colors.faint, fontSize: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    padding: 14,
    gap: 6,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timeWrap: { flexDirection: "row", alignItems: "center", gap: 5 },
  time: { fontWeight: "700", color: colors.text, fontSize: 14, letterSpacing: 0.2 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  clientRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  clientName: { fontWeight: "700", fontSize: 16, color: colors.text },
  meta: { color: colors.muted, fontSize: 13 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionBtnDanger: {
    borderColor: colors.red + "55",
    backgroundColor: colors.redSoft,
  },
  actionText: { fontSize: 12.5, fontWeight: "700", color: colors.gold },
  payTag: { color: colors.muted, fontSize: 12.5, marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: "center",
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: colors.text, marginBottom: 6, textAlign: "center" },
  modalSubtitle: { fontSize: 13, color: colors.muted, marginBottom: 18, textAlign: "center" },
  payOptions: { flexDirection: "row", gap: 12, width: "100%" },
  payBtn: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.md,
    paddingVertical: 18,
    alignItems: "center",
    gap: 6,
  },
  payEmoji: { fontSize: 28 },
  payLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  modalSkip: { marginTop: 16, paddingVertical: 8 },
  modalSkipText: { color: colors.muted, fontSize: 13 },
});
