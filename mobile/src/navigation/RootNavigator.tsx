import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { AgendaScreen } from "../screens/AgendaScreen";
import { NewAppointmentScreen } from "../screens/NewAppointmentScreen";
import { ClientsScreen } from "../screens/ClientsScreen";
import { ClientDetailScreen } from "../screens/ClientDetailScreen";
import { MoreScreen } from "../screens/MoreScreen";
import { StaffScreen } from "../screens/StaffScreen";
import { ServicesScreen } from "../screens/ServicesScreen";
import { SettingsScreen } from "../screens/SettingsScreen";

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  ClientDetail: { id: string };
  Staff: undefined;
  Services: undefined;
  Settings: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} options={{ headerShown: true, title: "Crear negocio" }} />
    </AuthStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Agenda" component={AgendaScreen} />
      <Tab.Screen name="NuevaCita" component={NewAppointmentScreen} options={{ title: "Nueva cita" }} />
      <Tab.Screen name="Clientes" component={ClientsScreen} />
      <Tab.Screen name="Mas" component={MoreScreen} options={{ title: "Más" }} />
    </Tab.Navigator>
  );
}

function MainNavigator() {
  return (
    <RootStack.Navigator>
      <RootStack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <RootStack.Screen name="ClientDetail" component={ClientDetailScreen} options={{ title: "Cliente" }} />
      <RootStack.Screen name="Staff" component={StaffScreen} options={{ title: "Barberos" }} />
      <RootStack.Screen name="Services" component={ServicesScreen} options={{ title: "Servicios" }} />
      <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: "Ajustes" }} />
    </RootStack.Navigator>
  );
}

export function RootNavigator() {
  const { barber, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <NavigationContainer>{barber ? <MainNavigator /> : <AuthNavigator />}</NavigationContainer>;
}
