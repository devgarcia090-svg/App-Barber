import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api";
import { colors, radius } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

export function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { barber, logout } = useAuth();
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deletePassword) return;
    setDeleting(true);
    try {
      await api.deleteAccount(deletePassword);
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
          <Ionicons name="cut" size={22} color={colors.gold} />
        </View>
        <View>
          <Text style={styles.business}>{barber?.businessName}</Text>
          <Text style={styles.muted}>{barber?.email}</Text>
        </View>
      </View>

      <MenuItem icon="people-outline" label="Barberos" onPress={() => navigation.navigate("Staff")} />
      <MenuItem icon="cut-outline" label="Servicios" onPress={() => navigation.navigate("Services")} />
      <MenuItem icon="notifications-outline" label="Recordatorios y avisos" onPress={() => navigation.navigate("Settings")} />

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
              Se borrará permanentemente tu negocio con todos sus barberos, clientes, citas y recordatorios. Esta acción no se
              puede deshacer.
            </Text>
            <Text style={styles.modalText}>Escribe tu contraseña para confirmar:</Text>
            <TextInput
              style={styles.modalInput}
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              placeholder="Contraseña"
              placeholderTextColor={colors.faint}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setDeleteVisible(false)}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalDelete, (!deletePassword || deleting) && { opacity: 0.5 }]}
                disabled={!deletePassword || deleting}
                onPress={confirmDelete}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>{deleting ? "Eliminando..." : "Eliminar todo"}</Text>
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
  business: { fontSize: 17, fontWeight: "800", color: colors.text },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
  modalText: { color: colors.muted, fontSize: 13.5, lineHeight: 19 },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 13,
    alignItems: "center",
  },
  modalDelete: {
    flex: 1,
    backgroundColor: colors.red,
    borderRadius: radius.sm,
    padding: 13,
    alignItems: "center",
  },
});
