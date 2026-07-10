import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { api, ApiError, type NotificationSettings } from "../api";

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

  if (!settings) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={styles.title}>Ajustes</Text>

      <Text style={styles.section}>Recordatorios al cliente</Text>
      <Text style={styles.label}>Horas antes de la cita (ej. "24,2")</Text>
      <TextInput
        style={styles.input}
        value={settings.reminderHoursBefore}
        onChangeText={(v) => setSettings({ ...settings, reminderHoursBefore: v })}
      />
      <View style={styles.switchRow}>
        <Text>Email</Text>
        <Switch value={settings.emailEnabled} onValueChange={(v) => setSettings({ ...settings, emailEnabled: v })} />
      </View>
      <View style={styles.switchRow}>
        <Text>WhatsApp</Text>
        <Switch value={settings.whatsappEnabled} onValueChange={(v) => setSettings({ ...settings, whatsappEnabled: v })} />
      </View>
      <View style={styles.switchRow}>
        <Text>SMS</Text>
        <Switch value={settings.smsEnabled} onValueChange={(v) => setSettings({ ...settings, smsEnabled: v })} />
      </View>

      <Text style={styles.section}>Clientes que fallan citas</Text>
      <Text style={styles.label}>Cancelación tardía si faltan menos de (horas)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(settings.lateCancelThresholdHours)}
        onChangeText={(v) => setSettings({ ...settings, lateCancelThresholdHours: Number(v) || 0 })}
      />
      <Text style={styles.label}>Incidencias para "Vigilar"</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(settings.watchThreshold)}
        onChangeText={(v) => setSettings({ ...settings, watchThreshold: Number(v) || 0 })}
      />
      <Text style={styles.label}>Incidencias para "Riesgo"</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(settings.riskyThreshold)}
        onChangeText={(v) => setSettings({ ...settings, riskyThreshold: Number(v) || 0 })}
      />

      <Text style={styles.section}>Aviso al barbero sobre clientes con faltas</Text>
      <View style={styles.switchRow}>
        <Text>Avisarme antes de la cita</Text>
        <Switch
          value={settings.barberPrewarningEnabled}
          onValueChange={(v) => setSettings({ ...settings, barberPrewarningEnabled: v })}
        />
      </View>
      <Text style={styles.label}>Horas antes (ej. "24,1" = un día antes y una hora antes)</Text>
      <TextInput
        style={styles.input}
        value={settings.barberPrewarningHoursBefore}
        onChangeText={(v) => setSettings({ ...settings, barberPrewarningHoursBefore: v })}
      />

      <Pressable style={styles.button} onPress={save} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Guardando..." : "Guardar cambios"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7fb" },
  title: { fontSize: 24, fontWeight: "700" },
  section: { fontWeight: "700", fontSize: 15, marginTop: 12 },
  label: { fontSize: 13, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 10, padding: 10, backgroundColor: "#fff" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  button: { backgroundColor: "#2563eb", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 16 },
  buttonText: { color: "#fff", fontWeight: "700" },
});
