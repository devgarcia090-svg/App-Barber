import { Component, ReactNode } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  stack: string | null;
}

// Sin esto, un error de JS en producción cierra la app sin mostrar nada (no
// hay forma de ver el motivo sin conectar el teléfono a un ordenador). Muestra
// el error en pantalla para poder diagnosticar builds fuera de Expo Go.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, stack: error.stack ?? null };
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.title}>Error al arrancar la app</Text>
          <Text style={styles.message}>{String(this.state.error.message ?? this.state.error)}</Text>
          {this.state.stack ? <Text style={styles.stack}>{this.state.stack}</Text> : null}
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0C0C10" },
  content: { padding: 20, paddingTop: 60 },
  title: { color: "#E9573F", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  message: { color: "#F2F2F2", fontSize: 14, marginBottom: 16 },
  stack: { color: "#9A9A9A", fontSize: 11, fontFamily: "monospace" },
});
