import { ActivityIndicator, View } from "react-native";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";
import { RoleSelectScreen } from "../screens/RoleSelectScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { ClientLoginScreen } from "../screens/ClientLoginScreen";
import { ClientRegisterScreen } from "../screens/ClientRegisterScreen";
import { BookScreen } from "../screens/BookScreen";
import { MyAppointmentsScreen } from "../screens/MyAppointmentsScreen";
import { ClientProfileScreen } from "../screens/ClientProfileScreen";
import { AgendaScreen } from "../screens/AgendaScreen";
import { NewAppointmentScreen } from "../screens/NewAppointmentScreen";
import { ClientsScreen } from "../screens/ClientsScreen";
import { ClientDetailScreen } from "../screens/ClientDetailScreen";
import { MoreScreen } from "../screens/MoreScreen";
import { StaffScreen } from "../screens/StaffScreen";
import { ServicesScreen } from "../screens/ServicesScreen";
import { SettingsScreen } from "../screens/SettingsScreen";

export type AuthStackParamList = {
  RoleSelect: undefined;
  Login: undefined;
  Register: undefined;
  ClientLogin: undefined;
  ClientRegister: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  ClientDetail: { id: string };
  Staff: undefined;
  Services: undefined;
  Settings: undefined;
};

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.gold,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.gold,
  },
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator();
const ClientTab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator<RootStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="RoleSelect" component={RoleSelectScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ headerShown: true, title: "Crear negocio", headerTintColor: colors.gold, headerTitleStyle: { color: colors.text } }}
      />
      <AuthStack.Screen name="ClientLogin" component={ClientLoginScreen} />
      <AuthStack.Screen
        name="ClientRegister"
        component={ClientRegisterScreen}
        options={{ headerShown: true, title: "Crear cuenta", headerTintColor: colors.gold, headerTitleStyle: { color: colors.text } }}
      />
    </AuthStack.Navigator>
  );
}

const CLIENT_TAB_ICONS: Record<string, { active: React.ComponentProps<typeof Ionicons>["name"]; inactive: React.ComponentProps<typeof Ionicons>["name"] }> = {
  Reservar: { active: "calendar", inactive: "calendar-outline" },
  MisCitas: { active: "list", inactive: "list-outline" },
  Perfil: { active: "person", inactive: "person-outline" },
};

function ClientNavigator() {
  return (
    <ClientTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: "600" },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = CLIENT_TAB_ICONS[route.name] ?? CLIENT_TAB_ICONS.Reservar;
          return <Ionicons name={focused ? icons.active : icons.inactive} size={size} color={color} />;
        },
      })}
    >
      <ClientTab.Screen name="Reservar" component={BookScreen} />
      <ClientTab.Screen name="MisCitas" component={MyAppointmentsScreen} options={{ title: "Mis citas" }} />
      <ClientTab.Screen name="Perfil" component={ClientProfileScreen} />
    </ClientTab.Navigator>
  );
}

const TAB_ICONS: Record<string, { active: React.ComponentProps<typeof Ionicons>["name"]; inactive: React.ComponentProps<typeof Ionicons>["name"] }> = {
  Agenda: { active: "calendar", inactive: "calendar-outline" },
  NuevaCita: { active: "add-circle", inactive: "add-circle-outline" },
  Clientes: { active: "people", inactive: "people-outline" },
  Mas: { active: "menu", inactive: "menu-outline" },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: "600" },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name] ?? TAB_ICONS.Agenda;
          return <Ionicons name={focused ? icons.active : icons.inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Agenda" component={AgendaScreen} />
      <Tab.Screen name="NuevaCita" component={NewAppointmentScreen} options={{ title: "Nueva cita" }} />
      <Tab.Screen name="Clientes" component={ClientsScreen} />
      <Tab.Screen name="Mas" component={MoreScreen} options={{ title: "Más" }} />
    </Tab.Navigator>
  );
}

function MainNavigator() {
  return (
    <RootStack.Navigator
      screenOptions={{
        headerTintColor: colors.gold,
        headerTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.surface },
      }}
    >
      <RootStack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <RootStack.Screen name="ClientDetail" component={ClientDetailScreen} options={{ title: "Cliente" }} />
      <RootStack.Screen name="Staff" component={StaffScreen} options={{ title: "Barberos" }} />
      <RootStack.Screen name="Services" component={ServicesScreen} options={{ title: "Servicios" }} />
      <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: "Recordatorios y avisos" }} />
    </RootStack.Navigator>
  );
}

export function RootNavigator() {
  const { barber, client, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {barber ? <MainNavigator /> : client ? <ClientNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
