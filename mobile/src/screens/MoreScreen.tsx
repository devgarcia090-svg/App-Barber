import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";

export function MoreScreen() {
  const navigation = useNavigation();
  const { barber, logout } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{barber?.businessName}</Text>

      <Pressable style={styles.item} onPress={() => navigation.navigate("Staff" as never)}>
        <Text style={styles.itemText}>Barberos</Text>
      </Pressable>
      <Pressable style={styles.item} onPress={() => navigation.navigate("Services" as never)}>
        <Text style={styles.itemText}>Servicios</Text>
      </Pressable>
      <Pressable style={styles.item} onPress={() => navigation.navigate("Settings" as never)}>
        <Text style={styles.itemText}>Ajustes</Text>
      </Pressable>

      <Pressable
        style={[styles.item, styles.logout]}
        onPress={() => Alert.alert("Cerrar sesión", "¿Seguro que quieres salir?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Cerrar sesión", style: "destructive", onPress: logout },
        ])}
      >
        <Text style={[styles.itemText, { color: "#dc2626" }]}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7fb", padding: 16 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  item: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 12, padding: 16, marginBottom: 10 },
  itemText: { fontSize: 15, fontWeight: "600" },
  logout: { marginTop: 20 },
});
