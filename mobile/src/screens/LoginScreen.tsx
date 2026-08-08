import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api";
import { colors, radius, shadow } from "../theme";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    try {
      await login(email.trim(), password.trim());
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
          <Ionicons name="cut" size={34} color={colors.gold} />
        </View>
        <Text style={styles.title}>OFICINA DEL{"\n"}BARBERO</Text>
        <View style={styles.divider} />
        <Text style={styles.subtitle}>Llano de Brujas · Murcia</Text>
      </View>

      <View style={[styles.card, shadow.card]}>
        <Text style={styles.label}>EMAIL</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="mail-outline" size={18} color={colors.faint} />
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="tu@email.com"
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
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            placeholder="••••••••"
            placeholderTextColor={colors.faint}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.faint} />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={handleLogin}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#1F1808" /> : <Text style={styles.buttonText}>ENTRAR</Text>}
        </Pressable>
      </View>

      <Pressable onPress={() => navigation.navigate("ClientRegister")}>
        <Text style={styles.link}>
          ¿Primera vez? <Text style={styles.linkAccent}>Crea tu cuenta de cliente</Text>
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bg,
  },
  brand: {
    alignItems: "center",
    marginBottom: 32,
  },
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
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 5,
    textAlign: "center",
    lineHeight: 34,
  },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: colors.gold,
    marginVertical: 12,
    borderRadius: 2,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 1.2,
    marginTop: 6,
  },
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
  input: {
    flex: 1,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    padding: 15,
    alignItems: "center",
    marginTop: 16,
  },
  buttonPressed: {
    backgroundColor: colors.goldDark,
  },
  buttonText: {
    color: "#1F1808",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 2,
  },
  link: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 22,
    fontSize: 13.5,
  },
  linkAccent: {
    color: colors.gold,
    fontWeight: "700",
  },
});
