import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow } from "../theme";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<AuthStackParamList, "RoleSelect">;

export function RoleSelectScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <View style={styles.logoRing}>
          <Ionicons name="cut" size={34} color={colors.gold} />
        </View>
        <Text style={styles.title}>OFICINA DEL{"\n"}BARBERO</Text>
        <View style={styles.divider} />
        <Text style={styles.subtitle}>Llano de Brujas · Murcia</Text>
      </View>

      <Pressable style={[styles.card, shadow.card]} onPress={() => navigation.navigate("ClientLogin")}>
        <Ionicons name="calendar-outline" size={26} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Soy cliente</Text>
          <Text style={styles.cardText}>Reserva tu cita cuando quieras</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.faint} />
      </Pressable>

      <Pressable style={[styles.card, shadow.card]} onPress={() => navigation.navigate("Login")}>
        <Ionicons name="briefcase-outline" size={26} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Soy profesional</Text>
          <Text style={styles.cardText}>Gestiona tu agenda y tu equipo</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.faint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.bg, gap: 14 },
  brand: { alignItems: "center", marginBottom: 32 },
  logoRing: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: 5, textAlign: "center", lineHeight: 34 },
  divider: { width: 48, height: 2, backgroundColor: colors.gold, marginVertical: 12, borderRadius: 2 },
  subtitle: { fontSize: 13, color: colors.muted, letterSpacing: 0.4 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  cardText: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
});
