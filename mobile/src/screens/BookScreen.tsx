import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError, type PublicBusiness, type PublicSlot, type Service } from "../api";
import { DateStrip } from "../components/DateStrip";
import { colors, radius } from "../theme";
import { formatMoney, minutesToTimeLabel, todayStr, zonedWallTimeToDate } from "../utils";

const ANY_STAFF = "any";

export function BookScreen() {
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState(ANY_STAFF);
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getPublicBusiness().then((b) => {
      setBusiness(b);
      if (b.services[0]) setServiceId((prev) => prev || b.services[0].id);
    });
  }, []);

  const selectedService: Service | undefined = business?.services.find((s) => s.id === serviceId);

  useEffect(() => {
    if (!serviceId) return;
    setLoadingSlots(true);
    setSelectedMinute(null);
    api
      .getPublicDaySlots(serviceId, date, staffId === ANY_STAFF ? undefined : staffId)
      .then((r) => setSlots(r.slots))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [serviceId, staffId, date]);

  const slotForMinute = useMemo(() => new Map(slots.map((s) => [s.startMinute, s])), [slots]);

  async function handleBook() {
    if (selectedMinute === null || !selectedService) return;
    const slot = slotForMinute.get(selectedMinute);
    const chosenStaffId = staffId === ANY_STAFF ? slot?.staffIds[0] : staffId;
    if (!chosenStaffId) {
      Alert.alert("Ese hueco ya no está libre", "Elige otra hora.");
      return;
    }
    const startTime = zonedWallTimeToDate(date, selectedMinute);

    setSubmitting(true);
    try {
      await api.bookAsClient({ staffId: chosenStaffId, serviceId, startTime: startTime.toISOString() });
      setSelectedMinute(null);
      Alert.alert("¡Cita reservada!", "Te esperamos. Puedes verla en 'Mis citas'.");
    } catch (err) {
      Alert.alert("No se pudo reservar", err instanceof ApiError ? err.message : "Inténtalo de nuevo");
    } finally {
      setSubmitting(false);
    }
  }

  if (!business) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}>
      <Text style={styles.title}>{business.barber.businessName}</Text>
      <Text style={styles.subtitle}>Elige servicio, barbero y hora — reserva en segundos.</Text>

      <Text style={styles.label}>SERVICIO</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {business.services.map((s) => (
          <Pressable key={s.id} style={[styles.chip, serviceId === s.id && styles.chipActive]} onPress={() => setServiceId(s.id)}>
            <Text style={[styles.chipText, serviceId === s.id && styles.chipTextActive]}>
              {s.name} · {formatMoney(s.priceCents)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.label}>BARBERO</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Pressable style={[styles.chip, staffId === ANY_STAFF && styles.chipActive]} onPress={() => setStaffId(ANY_STAFF)}>
          <Text style={[styles.chipText, staffId === ANY_STAFF && styles.chipTextActive]}>Cualquiera</Text>
        </Pressable>
        {business.staff.map((s) => (
          <Pressable key={s.id} style={[styles.chip, staffId === s.id && styles.chipActive]} onPress={() => setStaffId(s.id)}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={[styles.chipText, staffId === s.id && styles.chipTextActive]}>{s.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.label}>FECHA</Text>
      <DateStrip selected={date} onSelect={setDate} />

      <Text style={styles.label}>HUECOS DISPONIBLES</Text>
      {loadingSlots && <ActivityIndicator color={colors.gold} />}
      {!loadingSlots && slots.length === 0 && <Text style={styles.subtitle}>No quedan huecos libres ese día.</Text>}
      <View style={styles.slotGrid}>
        {slots.map((slot) => {
          const isSelected = selectedMinute === slot.startMinute;
          return (
            <Pressable
              key={slot.startMinute}
              onPress={() => setSelectedMinute(slot.startMinute)}
              style={[styles.slot, isSelected && styles.slotSelected]}
            >
              <Text style={[styles.slotText, isSelected && styles.slotTextSelected]}>{minutesToTimeLabel(slot.startMinute)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.button,
          (submitting || selectedMinute === null) && { opacity: 0.5 },
          pressed && { backgroundColor: colors.goldDark },
        ]}
        onPress={handleBook}
        disabled={submitting || selectedMinute === null}
      >
        {submitting ? (
          <ActivityIndicator color="#1F1808" />
        ) : (
          <Text style={styles.buttonText}>{selectedMinute === null ? "ELIGE UNA HORA" : "CONFIRMAR RESERVA"}</Text>
        )}
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" }}>
        <Ionicons name="pricetag-outline" size={14} color={colors.faint} />
        <Text style={{ color: colors.faint, fontSize: 12 }}>
          {selectedService ? `${selectedService.durationMinutes} min` : ""}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  label: { fontWeight: "700", fontSize: 11, marginTop: 10, color: colors.muted, letterSpacing: 1.2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  chipText: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  chipTextActive: { color: colors.gold },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slot: { width: 74, paddingVertical: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.surface, alignItems: "center" },
  slotSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  slotText: { fontSize: 13.5, fontWeight: "700", letterSpacing: 0.3, color: colors.gold },
  slotTextSelected: { color: "#1F1808" },
  button: { backgroundColor: colors.gold, borderRadius: radius.sm, padding: 16, alignItems: "center", marginTop: 14 },
  buttonText: { color: "#1F1808", fontWeight: "800", fontSize: 14, letterSpacing: 2 },
});
