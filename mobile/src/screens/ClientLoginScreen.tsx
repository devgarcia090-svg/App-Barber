import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api";
import { colors, radius, shadow } from "../theme";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<AuthStackParamList, "ClientLogin">;

export function ClientLoginScreen({ navigation }: Props) {
  const { clientLogin } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    try {
      await clientLogin(phone.trim(), password);
    } catch (err) {
      Alert.alert("Error", err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.brand}>
        <View style={styles.logoRing}>
          <Ionicons name="calendar" size={30} color={colors.gold} />
        </View>
        <Text style={styles.title}>RESERVA TU CITA</Text>
      </View>

      <View style={[styles.card, shadow.card]}>
        <Text style={styles.label}>TELÉFONO</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="call-outline" size={18} color={colors.faint} />
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+34 600 000 000"
            placeholderTextColor={colors.faint}
          />
        </View>

        <Text style={styles.label}>CONTRASEÑA</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.faint} />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.faint}
          />
        </View>

        <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={handleLogin} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#1F1808" /> : <Text style={styles.buttonText}>ENTRAR</Text>}
        </Pressable>
      </View>

      <Pressable onPress={() => navigation.navigate("ClientRegister")}>
        <Text style={styles.link}>
          ¿Primera vez? <Text style={styles.linkAccent}>Crea tu cuenta</Text>
        </Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate("RoleSelect")}>
        <Text style={styles.back}>← Volver</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.bg },
  brand: { alignItems: "center", marginBottom: 32 },
  logoRing: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 19, fontWeight: "800", color: colors.text, letterSpacing: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 22, gap: 8 },
  label: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 1.2, marginTop: 6 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 12,
  },
  input: { flex: 1, paddingVertical: 13, color: colors.text, fontSize: 15 },
  button: { backgroundColor: colors.gold, borderRadius: radius.sm, padding: 15, alignItems: "center", marginTop: 16 },
  buttonPressed: { backgroundColor: colors.goldDark },
  buttonText: { color: "#1F1808", fontWeight: "800", fontSize: 14, letterSpacing: 2 },
  link: { color: colors.muted, textAlign: "center", marginTop: 22, fontSize: 13.5 },
  linkAccent: { color: colors.gold, fontWeight: "700" },
  back: { color: colors.faint, textAlign: "center", marginTop: 16, fontSize: 13 },
});
