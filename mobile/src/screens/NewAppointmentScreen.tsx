import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError, type Client, type Service, type Staff } from "../api";
import { DateStrip } from "../components/DateStrip";
import { PrewarningBanner } from "../components/PrewarningBanner";
import { colors, radius } from "../theme";
import { dayBounds, formatMoney, generateDaySlots, todayStr, zonedWallTimeToDate, type Slot } from "../utils";

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "");
}

export function NewAppointmentScreen() {
  const navigation = useNavigation();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [dayAppointments, setDayAppointments] = useState<{ startTime: string; endTime: string; clientName?: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [clientPhone, setClientPhone] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getStaff().then((r) => {
      const active = r.staff.filter((s) => s.active);
      setStaff(active);
      if (active[0]) setStaffId((prev) => prev || active[0].id);
    });
    api.getServices().then((r) => {
      const active = r.services.filter((s) => s.active);
      setServices(active);
      if (active[0]) setServiceId((prev) => prev || active[0].id);
    });
    api.getClients().then((r) => setClients(r.clients));
  }, []);

  const selectedStaff = staff.find((s) => s.id === staffId);
  const selectedService = services.find((s) => s.id === serviceId);

  useEffect(() => {
    if (!staffId) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    const { from, to } = dayBounds(date);
    api
      .getAppointments({ staffId, from, to })
      .then((r) =>
        setDayAppointments(
          r.appointments
            .filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW")
            .map((a) => ({ startTime: a.startTime, endTime: a.endTime, clientName: a.client.name }))
        )
      )
      .finally(() => setLoadingSlots(false));
  }, [staffId, date]);

  const slots: Slot[] = useMemo(() => {
    if (!selectedStaff || !selectedService) return [];
    return generateDaySlots(date, selectedService.durationMinutes, selectedStaff.workingHours, dayAppointments);
  }, [date, selectedStaff, selectedService, dayAppointments]);

  const matchedClient = useMemo(() => {
    const phone = normalizePhone(clientPhone);
    if (phone.length < 6) return null;
    return clients.find((c) => normalizePhone(c.phone) === phone) ?? null;
  }, [clientPhone, clients]);

  useEffect(() => {
    if (matchedClient) setClientName(matchedClient.name);
  }, [matchedClient]);

  async function handleSubmit() {
    if (!staffId || !serviceId || selectedSlot === null) {
      Alert.alert("Falta información", "Selecciona barbero, servicio y un hueco disponible");
      return;
    }
    if (!clientPhone || !clientName) {
      Alert.alert("Falta información", "Indica el teléfono y el nombre del cliente");
      return;
    }
    setSubmitting(true);
    try {
      let clientId = matchedClient?.id;
      if (!clientId) {
        const { client } = await api.createClient({ name: clientName, phone: clientPhone, email: clientEmail || undefined });
        clientId = client.id;
      }
      const startTime = zonedWallTimeToDate(date, selectedSlot);
      await api.createAppointment({ staffId, clientId, serviceId, startTime: startTime.toISOString(), notes: notes || undefined });

      setClientPhone("");
      setClientName("");
      setClientEmail("");
      setNotes("");
      setSelectedSlot(null);
      Alert.alert("Cita creada", "La cita se ha reservado correctamente.", [
        { text: "OK", onPress: () => navigation.navigate("Agenda" as never) },
      ]);
    } catch (err) {
      Alert.alert("Error", err instanceof ApiError ? err.message : "No se pudo crear la cita");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}>
        <Text style={styles.title}>Nueva cita</Text>
        <Text style={styles.subtitle}>Elige un hueco libre — solo hace falta el nombre y el número del cliente.</Text>

        <Text style={styles.label}>BARBERO</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {staff.map((s) => (
            <Pressable key={s.id} style={[styles.chip, staffId === s.id && styles.chipActive]} onPress={() => setStaffId(s.id)}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={[styles.chipText, staffId === s.id && styles.chipTextActive]}>{s.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>SERVICIO</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {services.map((s) => (
            <Pressable key={s.id} style={[styles.chip, serviceId === s.id && styles.chipActive]} onPress={() => setServiceId(s.id)}>
              <Text style={[styles.chipText, serviceId === s.id && styles.chipTextActive]}>
                {s.name} · {formatMoney(s.priceCents)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>FECHA</Text>
        <DateStrip selected={date} onSelect={setDate} />

        <Text style={styles.label}>HUECOS DISPONIBLES</Text>
        {loadingSlots && <ActivityIndicator color={colors.gold} />}
        {!loadingSlots && slots.length === 0 && <Text style={styles.subtitle}>Ese barbero no trabaja ese día.</Text>}
        <View style={styles.slotGrid}>
          {slots.map((slot) => {
            const isSelected = selectedSlot === slot.startMinute;
            return (
              <Pressable
                key={slot.startMinute}
                disabled={!slot.available}
                onPress={() => setSelectedSlot(slot.startMinute)}
                style={[styles.slot, slot.available ? styles.slotAvailable : styles.slotBusy, isSelected && styles.slotSelected]}
              >
                <Text
                  style={[
                    styles.slotText,
                    slot.available ? styles.slotTextAvailable : styles.slotTextBusy,
                    isSelected && styles.slotTextSelected,
                  ]}
                >
                  {slot.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>TELÉFONO DEL CLIENTE</Text>
        <TextInput
          style={styles.input}
          value={clientPhone}
          onChangeText={setClientPhone}
          keyboardType="phone-pad"
          placeholder="+34 600 000 000"
          placeholderTextColor={colors.faint}
        />

        <Text style={styles.label}>NOMBRE DEL CLIENTE</Text>
        <TextInput style={styles.input} value={clientName} onChangeText={setClientName} placeholderTextColor={colors.faint} />

        <Text style={styles.label}>EMAIL (OPCIONAL)</Text>
        <TextInput
          style={styles.input}
          value={clientEmail}
          onChangeText={setClientEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor={colors.faint}
        />

        {matchedClient && (
          <View style={styles.notice}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="person-circle-outline" size={18} color={colors.blue} />
              <Text style={{ color: colors.text, fontSize: 13.5 }}>
                Cliente existente: <Text style={{ fontWeight: "800" }}>{matchedClient.name}</Text>
              </Text>
            </View>
            <PrewarningBanner prewarning={matchedClient.prewarning} />
          </View>
        )}

        <Text style={styles.label}>NOTAS (OPCIONAL)</Text>
        <TextInput
          style={[styles.input, { height: 70, textAlignVertical: "top" }]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholderTextColor={colors.faint}
        />

        <Pressable
          style={({ pressed }) => [styles.button, (submitting || selectedSlot === null) && { opacity: 0.5 }, pressed && { backgroundColor: colors.goldDark }]}
          onPress={handleSubmit}
          disabled={submitting || selectedSlot === null}
        >
          {submitting ? (
            <ActivityIndicator color="#1F1808" />
          ) : (
            <Text style={styles.buttonText}>{selectedSlot === null ? "ELIGE UN HUECO" : "CREAR CITA"}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  label: {
    fontWeight: "700",
    fontSize: 11,
    marginTop: 10,
    color: colors.muted,
    letterSpacing: 1.2,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 13,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
  },
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
  slot: {
    width: 74,
    paddingVertical: 11,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  slotAvailable: { borderColor: colors.goldBorder, backgroundColor: colors.surface },
  slotBusy: { borderColor: colors.border, backgroundColor: "#111117" },
  slotSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  slotText: { fontSize: 13.5, fontWeight: "700", letterSpacing: 0.3 },
  slotTextAvailable: { color: colors.gold },
  slotTextBusy: { color: colors.faint, textDecorationLine: "line-through" },
  slotTextSelected: { color: "#1F1808" },
  notice: {
    backgroundColor: colors.blueSoft,
    borderRadius: radius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.blue + "44",
    marginTop: 8,
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    padding: 16,
    alignItems: "center",
    marginTop: 14,
  },
  buttonText: { color: "#1F1808", fontWeight: "800", fontSize: 14, letterSpacing: 2 },
});
