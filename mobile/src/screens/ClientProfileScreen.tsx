import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api";
import { colors, radius } from "../theme";

export function ClientProfileScreen() {
  const { client, logout } = useAuth();
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    Notifications.getPermissionsAsync().then((r) => setPushEnabled(r.granted));
  }, []);

  async function togglePush(value: boolean) {
    setPushBusy(true);
    try {
      if (value) {
        const perm = await Notifications.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permiso denegado", "Activa las notificaciones desde los ajustes del teléfono.");
          return;
        }
        // In native builds Expo requires the EAS projectId to mint a push token
        // (it's injected into expoConfig.extra.eas.projectId after `eas init`).
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
        const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
        await api.registerPushToken(token);
        setPushEnabled(true);
      } else {
        await api.registerPushToken(null);
        setPushEnabled(false);
      }
    } catch {
      Alert.alert("Aviso", "No se pudo activar las notificaciones push en este dispositivo todavía.");
    } finally {
      setPushBusy(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api.deleteClientAccount();
      setDeleteVisible(false);
      await logout();
    } catch (err) {
      Alert.alert("Error", err instanceof ApiError ? err.message : "No se pudo eliminar la cuenta");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoRing}>
          <Ionicons name="person" size={22} color={colors.gold} />
        </View>
        <View>
          <Text style={styles.name}>{client?.name}</Text>
          <Text style={styles.muted}>{client?.phone}</Text>
        </View>
      </View>

      <View style={styles.item}>
        <Ionicons name="notifications-outline" size={20} color={colors.gold} />
        <Text style={styles.itemText}>Avisos de recordatorio</Text>
        <Switch
          value={pushEnabled}
          onValueChange={togglePush}
          disabled={pushBusy}
          trackColor={{ true: colors.gold }}
          thumbColor={colors.text}
        />
      </View>

      <View style={styles.spacer} />

      <MenuItem
        icon="log-out-outline"
        label="Cerrar sesión"
        onPress={() =>
          Alert.alert("Cerrar sesión", "¿Seguro que quieres salir?", [
            { text: "Cancelar", style: "cancel" },
            { text: "Cerrar sesión", style: "destructive", onPress: logout },
          ])
        }
      />
      <MenuItem icon="trash-outline" label="Eliminar cuenta" danger onPress={() => setDeleteVisible(true)} />

      <Modal visible={deleteVisible} transparent animationType="fade" onRequestClose={() => setDeleteVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Ionicons name="warning" size={30} color={colors.red} style={{ alignSelf: "center" }} />
            <Text style={styles.modalTitle}>Eliminar cuenta</Text>
            <Text style={styles.modalText}>
              Se borrará tu cuenta y el historial de tus citas de forma permanente. Esta acción no se puede
              deshacer.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setDeleteVisible(false)}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalDelete, deleting && { opacity: 0.5 }]}
                disabled={deleting}
                onPress={confirmDelete}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>{deleting ? "Eliminando..." : "Eliminar cuenta"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surfaceElevated }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? colors.red : colors.gold} />
      <Text style={[styles.itemText, danger && { color: colors.red }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16, paddingTop: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 22, marginTop: 6 },
  logoRing: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 17, fontWeight: "800", color: colors.text },
  muted: { color: colors.muted, fontSize: 12.5 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 10,
  },
  itemText: { fontSize: 15, fontWeight: "600", color: colors.text, flex: 1 },
  spacer: { height: 18 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 22, gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
  modalText: { color: colors.muted, fontSize: 13.5, lineHeight: 19 },
  modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 12, backgroundColor: colors.surfaceElevated, color: colors.text },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalCancel: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 13, alignItems: "center" },
  modalDelete: { flex: 1, backgroundColor: colors.red, borderRadius: radius.sm, padding: 13, alignItems: "center" },
});
