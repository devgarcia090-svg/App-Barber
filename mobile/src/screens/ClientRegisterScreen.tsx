import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api";
import { colors, radius, shadow } from "../theme";

export function ClientRegisterScreen() {
  const { registerClient } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !phone.trim() || !email.trim() || password.length < 8) {
      Alert.alert("Revisa los datos", "Indica tu nombre, teléfono, email y una contraseña de al menos 8 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      await registerClient({ name: name.trim(), phone: phone.trim(), email: email.trim(), password });
    } catch (err) {
      Alert.alert("Error", err instanceof ApiError ? err.message : "No se pudo crear la cuenta");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.card, shadow.card]} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>NOMBRE</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Tu nombre" placeholderTextColor={colors.faint} />

        <Text style={styles.label}>TELÉFONO</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+34 600 000 000"
          placeholderTextColor={colors.faint}
        />

        <Text style={styles.label}>EMAIL</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="tu@email.com"
          placeholderTextColor={colors.faint}
        />

        <Text style={styles.label}>CONTRASEÑA</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Mínimo 8 caracteres"
          placeholderTextColor={colors.faint}
        />

        <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#1F1808" /> : <Text style={styles.buttonText}>CREAR CUENTA</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: {
    margin: 20,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 8,
  },
  label: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 1.2, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 13,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    fontSize: 15,
  },
  button: { backgroundColor: colors.gold, borderRadius: radius.sm, padding: 15, alignItems: "center", marginTop: 16 },
  buttonPressed: { backgroundColor: colors.goldDark },
  buttonText: { color: "#1F1808", fontWeight: "800", fontSize: 14, letterSpacing: 2 },
});
