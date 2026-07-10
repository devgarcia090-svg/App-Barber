import { useState } from "react";
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
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api";
import { colors, radius } from "../theme";

export function RegisterScreen() {
  const { register } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await register({ businessName, ownerName, email: email.trim(), password, phone: phone || undefined });
    } catch (err) {
      Alert.alert("Error", err instanceof ApiError ? err.message : "No se pudo crear la cuenta");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Crear negocio</Text>
        <Text style={styles.subtitle}>Configura tu barbería en un minuto</Text>

        <View style={styles.card}>
          <Field label="NOMBRE DEL NEGOCIO" value={businessName} onChangeText={setBusinessName} />
          <Field label="TU NOMBRE" value={ownerName} onChangeText={setOwnerName} />
          <Field label="EMAIL" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Field label="TELÉFONO (OPCIONAL)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="CONTRASEÑA (MÍN. 8 CARACTERES)" value={password} onChangeText={setPassword} secureTextEntry />

          <Pressable
            style={({ pressed }) => [styles.button, pressed && { backgroundColor: colors.goldDark }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#1F1808" /> : <Text style={styles.buttonText}>CREAR CUENTA</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.faint} {...inputProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 1.1,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 13,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    padding: 15,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#1F1808", fontWeight: "800", fontSize: 14, letterSpacing: 2 },
});
