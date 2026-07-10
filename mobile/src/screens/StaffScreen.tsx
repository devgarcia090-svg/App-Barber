import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { api, ApiError, type Staff, type WorkingHourRow } from "../api";
import { colors, radius } from "../theme";
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
    <View style={{ gap: 10, marginTop: 12 }}>
      {schedule.map((day, i) => (
        <View key={i} style={styles.dayRow}>
          <View style={styles.dayToggle}>
            <Switch
              value={day.open}
              onValueChange={(v) => updateDay(i, { open: v })}
              trackColor={{ true: colors.goldDark, false: colors.border }}
              thumbColor={day.open ? colors.gold : colors.muted}
            />
            <Text style={[styles.dayName, day.open && { color: colors.text }]}>{DAY_NAMES[i]}</Text>
          </View>
          {day.open && (
            <View style={styles.timeRow}>
              <TextInput style={styles.timeInput} value={day.start} onChangeText={(t) => updateDay(i, { start: t })} placeholder="09:00" placeholderTextColor={colors.faint} />
              <Text style={{ color: colors.muted }}>–</Text>
              <TextInput style={styles.timeInput} value={day.end} onChangeText={(t) => updateDay(i, { end: t })} placeholder="20:00" placeholderTextColor={colors.faint} />
            </View>
          )}
        </View>
      ))}
      <Pressable style={({ pressed }) => [styles.saveBtn, pressed && { backgroundColor: colors.goldDark }]} onPress={save} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? "GUARDANDO..." : "GUARDAR HORARIO"}</Text>
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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={styles.subtitle}>Cada barbero tiene su propia agenda. Su horario define qué huecos se pueden reservar.</Text>

      <View style={styles.form}>
        <Text style={styles.label}>NOMBRE</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.faint} />
        <Text style={styles.label}>TELÉFONO (OPCIONAL)</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={colors.faint} />
        <Pressable style={({ pressed }) => [styles.saveBtn, pressed && { backgroundColor: colors.goldDark }]} onPress={handleCreate}>
          <Text style={styles.saveBtnText}>+ AÑADIR BARBERO</Text>
        </Pressable>
      </View>

      {staff.map((s) => (
        <View key={s.id} style={styles.staffCard}>
          <View style={styles.staffHeader}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.staffName}>{s.name}</Text>
            {!s.active && <Text style={styles.inactive}>INACTIVO</Text>}
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
  container: { flex: 1, backgroundColor: colors.bg },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  label: { fontWeight: "700", fontSize: 11, color: colors.muted, letterSpacing: 1.1, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  saveBtn: { backgroundColor: colors.gold, borderRadius: radius.sm, padding: 13, alignItems: "center", marginTop: 10 },
  saveBtnText: { color: "#1F1808", fontWeight: "800", fontSize: 12.5, letterSpacing: 1.5 },
  staffCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
  },
  staffHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  staffName: { fontWeight: "700", fontSize: 16, color: colors.text },
  inactive: { color: colors.faint, fontSize: 10, letterSpacing: 1 },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  staffActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  linkBtn: {
    borderWidth: 1,
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  linkBtnText: { fontSize: 12.5, color: colors.gold, fontWeight: "700" },
  dayRow: { gap: 6 },
  dayToggle: { flexDirection: "row", alignItems: "center", gap: 10 },
  dayName: { fontSize: 14, color: colors.muted },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 56 },
  timeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 9,
    width: 72,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    textAlign: "center",
  },
});
