import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { api, ApiError, type Staff, type WorkingHourRow } from "../api";
import { DAY_NAMES, minutesToTimeLabel } from "../utils";

function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

interface DaySchedule {
  open: boolean;
  start: string;
  end: string;
}

function scheduleFromWorkingHours(workingHours: WorkingHourRow[]): DaySchedule[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = workingHours.find((w) => w.dayOfWeek === dayOfWeek);
    return row
      ? { open: true, start: minutesToTimeLabel(row.startMinute), end: minutesToTimeLabel(row.endMinute) }
      : { open: false, start: "09:00", end: "20:00" };
  });
}

function WorkingHoursEditor({ staffMember }: { staffMember: Staff }) {
  const [schedule, setSchedule] = useState<DaySchedule[]>(() => scheduleFromWorkingHours(staffMember.workingHours));
  const [saving, setSaving] = useState(false);

  function updateDay(i: number, patch: Partial<DaySchedule>) {
    setSchedule((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function save() {
    setSaving(true);
    try {
      const rows: WorkingHourRow[] = [];
      for (let i = 0; i < schedule.length; i++) {
        const day = schedule[i];
        if (!day.open) continue;
        const startMinute = timeToMinutes(day.start);
        const endMinute = timeToMinutes(day.end);
        if (startMinute === null || endMinute === null || endMinute <= startMinute) {
          Alert.alert("Horario inválido", `Revisa el horario de ${DAY_NAMES[i]} (formato HH:MM, hora fin tras hora inicio)`);
          setSaving(false);
          return;
        }
        rows.push({ dayOfWeek: i, startMinute, endMinute });
      }
      await api.setWorkingHours(staffMember.id, rows);
      Alert.alert("Guardado", "Horario actualizado");
    } catch (err) {
      Alert.alert("Error", err instanceof ApiError ? err.message : "No se pudo guardar el horario");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      {schedule.map((day, i) => (
        <View key={i} style={styles.dayRow}>
          <View style={styles.dayToggle}>
            <Switch value={day.open} onValueChange={(v) => updateDay(i, { open: v })} />
            <Text style={styles.dayName}>{DAY_NAMES[i]}</Text>
          </View>
          {day.open && (
            <View style={styles.timeRow}>
              <TextInput style={styles.timeInput} value={day.start} onChangeText={(t) => updateDay(i, { start: t })} placeholder="09:00" />
              <Text>-</Text>
              <TextInput style={styles.timeInput} value={day.end} onChangeText={(t) => updateDay(i, { end: t })} placeholder="20:00" />
            </View>
          )}
        </View>
      ))}
      <Pressable style={styles.saveBtn} onPress={save} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? "Guardando..." : "Guardar horario"}</Text>
      </Pressable>
    </View>
  );
}

export function StaffScreen() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api.getStaff().then((r) => setStaff(r.staff));
  }, []);

  async function handleCreate() {
    if (!name) return;
    try {
      const { staff: created } = await api.createStaff({ name, phone: phone || undefined });
      setStaff((prev) => [...prev, { ...created, workingHours: [] }]);
      setName("");
      setPhone("");
    } catch (err) {
      Alert.alert("Error", err instanceof ApiError ? err.message : "No se pudo crear el barbero");
    }
  }

  async function toggleActive(s: Staff) {
    const { staff: updated } = await api.updateStaff(s.id, { active: !s.active });
    setStaff((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...updated } : x)));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={styles.title}>Barberos</Text>
      <Text style={styles.muted}>Cada barbero tiene su propia agenda y horario.</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Nombre</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />
        <Text style={styles.label}>Teléfono (opcional)</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Pressable style={styles.saveBtn} onPress={handleCreate}>
          <Text style={styles.saveBtnText}>+ Añadir barbero</Text>
        </Pressable>
      </View>

      {staff.map((s) => (
        <View key={s.id} style={styles.staffCard}>
          <View style={styles.staffHeader}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.staffName}>{s.name}</Text>
            {!s.active && <Text style={styles.muted}>(inactivo)</Text>}
          </View>
          <View style={styles.staffActions}>
            <Pressable style={styles.linkBtn} onPress={() => toggleActive(s)}>
              <Text style={styles.linkBtnText}>{s.active ? "Desactivar" : "Activar"}</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={() => setExpandedId(expandedId === s.id ? null : s.id)}>
              <Text style={styles.linkBtnText}>{expandedId === s.id ? "Ocultar horario" : "Editar horario"}</Text>
            </Pressable>
          </View>
          {expandedId === s.id && <WorkingHoursEditor staffMember={s} />}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7fb" },
  title: { fontSize: 24, fontWeight: "700" },
  muted: { color: "#6b6b78", fontSize: 12 },
  label: { fontWeight: "600", fontSize: 13, marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 10, padding: 10, backgroundColor: "#fff" },
  form: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e3e3ea", padding: 12, gap: 4 },
  saveBtn: { backgroundColor: "#2563eb", borderRadius: 10, padding: 12, alignItems: "center", marginTop: 10 },
  saveBtnText: { color: "#fff", fontWeight: "700" },
  staffCard: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e3e3ea", padding: 12 },
  staffHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  staffName: { fontWeight: "700", fontSize: 15 },
  dot: { width: 10, height: 10, borderRadius: 999 },
  staffActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  linkBtn: { borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  linkBtnText: { fontSize: 12, color: "#2563eb", fontWeight: "600" },
  dayRow: { gap: 4 },
  dayToggle: { flexDirection: "row", alignItems: "center", gap: 8 },
  dayName: { fontSize: 13 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 52 },
  timeInput: { borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 8, padding: 8, width: 70, backgroundColor: "#fff" },
});
