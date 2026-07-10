import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { api, ApiError, type NotificationSettings } from "../api";
import { colors, radius } from "../theme";

export function SettingsScreen() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings));
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const { settings: updated } = await api.updateSettings(settings);
      setSettings(updated);
      Alert.alert("Guardado", "Configuración actualizada");
    } catch (err) {
      Alert.alert("Error", err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={styles.section}>RECORDATORIOS AL CLIENTE</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Horas antes de la cita (ej. "24,2")</Text>
        <TextInput
          style={styles.input}
          value={settings.reminderHoursBefore}
          onChangeText={(v) => setSettings({ ...settings, reminderHoursBefore: v })}
        />
        <SwitchRow label="Email" value={settings.emailEnabled} onChange={(v) => setSettings({ ...settings, emailEnabled: v })} />
        <SwitchRow label="WhatsApp" value={settings.whatsappEnabled} onChange={(v) => setSettings({ ...settings, whatsappEnabled: v })} />
        <SwitchRow label="SMS" value={settings.smsEnabled} onChange={(v) => setSettings({ ...settings, smsEnabled: v })} />
      </View>

      <Text style={styles.section}>CLIENTES QUE FALLAN CITAS</Text>
      <View style={styles.card}>
        <NumberField
          label="Cancelación tardía si faltan menos de (horas)"
          value={settings.lateCancelThresholdHours}
          onChange={(n) => setSettings({ ...settings, lateCancelThresholdHours: n })}
        />
        <NumberField
          label='Incidencias para marcar "Vigilar"'
          value={settings.watchThreshold}
          onChange={(n) => setSettings({ ...settings, watchThreshold: n })}
        />
        <NumberField
          label='Incidencias para marcar "Riesgo"'
          value={settings.riskyThreshold}
          onChange={(n) => setSettings({ ...settings, riskyThreshold: n })}
        />
      </View>

      <Text style={styles.section}>AVISO AL BARBERO (CLIENTES CON FALTAS)</Text>
      <View style={styles.card}>
        <SwitchRow
          label="Avisarme antes de la cita"
          value={settings.barberPrewarningEnabled}
          onChange={(v) => setSettings({ ...settings, barberPrewarningEnabled: v })}
        />
        <Text style={styles.label}>Horas antes (ej. "24,1" = un día y una hora antes)</Text>
        <TextInput
          style={styles.input}
          value={settings.barberPrewarningHoursBefore}
          onChangeText={(v) => setSettings({ ...settings, barberPrewarningHoursBefore: v })}
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && { backgroundColor: colors.goldDark }]}
        onPress={save}
        disabled={saving}
      >
        <Text style={styles.buttonText}>{saving ? "GUARDANDO..." : "GUARDAR CAMBIOS"}</Text>
      </Pressable>
    </ScrollView>
  );

  function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
      <View style={styles.switchRow}>
        <Text style={{ color: colors.text, fontSize: 14.5 }}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: colors.goldDark, false: colors.border }}
          thumbColor={value ? colors.gold : colors.muted}
        />
      </View>
    );
  }

  function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={styles.label}>{label}</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={String(value)} onChangeText={(v) => onChange(Number(v) || 0)} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  section: { fontWeight: "700", fontSize: 11, color: colors.muted, letterSpacing: 1.2, marginTop: 10 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  label: { fontSize: 13, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
  },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  button: { backgroundColor: colors.gold, borderRadius: radius.sm, padding: 15, alignItems: "center", marginTop: 14, marginBottom: 24 },
  buttonText: { color: "#1F1808", fontWeight: "800", fontSize: 13, letterSpacing: 1.5 },
});
