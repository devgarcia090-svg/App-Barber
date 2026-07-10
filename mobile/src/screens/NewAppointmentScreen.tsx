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
import { api, ApiError, type Client, type Service, type Staff } from "../api";
import { DateStrip } from "../components/DateStrip";
import { PrewarningBanner } from "../components/PrewarningBanner";
import { formatMoney, generateDaySlots, todayStr, type Slot } from "../utils";

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
    const from = new Date(`${date}T00:00:00`).toISOString();
    const to = new Date(`${date}T23:59:59`).toISOString();
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
      const startTime = new Date(`${date}T00:00:00`);
      startTime.setMinutes(selectedSlot);
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
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={styles.title}>Nueva cita</Text>
        <Text style={styles.muted}>Ideal para reservar por teléfono: elige un hueco libre y solo hace falta el nombre y el número.</Text>

        <Text style={styles.label}>Barbero</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {staff.map((s) => (
            <Pressable key={s.id} style={[styles.chip, staffId === s.id && styles.chipActive]} onPress={() => setStaffId(s.id)}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={[styles.chipText, staffId === s.id && styles.chipTextActive]}>{s.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Servicio</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {services.map((s) => (
            <Pressable key={s.id} style={[styles.chip, serviceId === s.id && styles.chipActive]} onPress={() => setServiceId(s.id)}>
              <Text style={[styles.chipText, serviceId === s.id && styles.chipTextActive]}>
                {s.name} · {formatMoney(s.priceCents)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Fecha</Text>
        <DateStrip selected={date} onSelect={setDate} />

        <Text style={styles.label}>Huecos disponibles</Text>
        {loadingSlots && <ActivityIndicator />}
        {!loadingSlots && slots.length === 0 && <Text style={styles.muted}>Ese barbero no trabaja ese día.</Text>}
        <View style={styles.slotGrid}>
          {slots.map((slot) => (
            <Pressable
              key={slot.startMinute}
              disabled={!slot.available}
              onPress={() => setSelectedSlot(slot.startMinute)}
              style={[
                styles.slot,
                slot.available ? styles.slotAvailable : styles.slotBusy,
                selectedSlot === slot.startMinute && styles.slotSelected,
              ]}
            >
              <Text
                style={[
                  styles.slotText,
                  slot.available ? styles.slotTextAvailable : styles.slotTextBusy,
                  selectedSlot === slot.startMinute && styles.slotTextSelected,
                ]}
              >
                {slot.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Teléfono del cliente</Text>
        <TextInput style={styles.input} value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" placeholder="+34 600 000 000" />

        <Text style={styles.label}>Nombre del cliente</Text>
        <TextInput style={styles.input} value={clientName} onChangeText={setClientName} />

        <Text style={styles.label}>Email del cliente (opcional)</Text>
        <TextInput style={styles.input} value={clientEmail} onChangeText={setClientEmail} autoCapitalize="none" keyboardType="email-address" />

        {matchedClient && (
          <View style={styles.notice}>
            <Text>
              Cliente existente: <Text style={{ fontWeight: "700" }}>{matchedClient.name}</Text>
            </Text>
            <PrewarningBanner prewarning={matchedClient.prewarning} />
          </View>
        )}

        <Text style={styles.label}>Notas (opcional)</Text>
        <TextInput style={[styles.input, { height: 70 }]} value={notes} onChangeText={setNotes} multiline />

        <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{selectedSlot === null ? "Elige un hueco" : "Crear cita"}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7fb" },
  title: { fontSize: 24, fontWeight: "700" },
  muted: { color: "#6b6b78", fontSize: 13 },
  label: { fontWeight: "600", fontSize: 13, marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 10, padding: 12, backgroundColor: "#fff" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#e3e3ea",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  chipActive: { borderColor: "#2563eb" },
  chipText: { fontSize: 13, color: "#1c1c26" },
  chipTextActive: { color: "#2563eb", fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: 999 },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slot: { width: 72, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  slotAvailable: { borderColor: "#93c5fd", backgroundColor: "#fff" },
  slotBusy: { borderColor: "#e3e3ea", backgroundColor: "#f1f1f4" },
  slotSelected: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  slotText: { fontSize: 13, fontWeight: "600" },
  slotTextAvailable: { color: "#2563eb" },
  slotTextBusy: { color: "#6b6b78", textDecorationLine: "line-through" },
  slotTextSelected: { color: "#fff" },
  notice: { backgroundColor: "#eff6ff", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#bfdbfe" },
  button: { backgroundColor: "#2563eb", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
