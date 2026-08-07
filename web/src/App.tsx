import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { AgendaPage } from "./pages/AgendaPage";
import { NewAppointmentPage } from "./pages/NewAppointmentPage";
import { EditAppointmentPage } from "./pages/EditAppointmentPage";
import { ClientsPage } from "./pages/ClientsPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { StaffPage } from "./pages/StaffPage";
import { ServicesPage } from "./pages/ServicesPage";
import { IngresosPage } from "./pages/IngresosPage";
import { FidelizacionPage } from "./pages/FidelizacionPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PublicBookingPage } from "./pages/PublicBookingPage";
import { PrivacyPage, TermsPage } from "./pages/LegalPages";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { barber, loading } = useAuth();
  if (loading) return <p className="muted">Cargando...</p>;
  if (!barber) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route path="/reserva/:slug" element={<PublicBookingPage />} />
      <Route path="/privacidad" element={<PrivacyPage />} />
      <Route path="/terminos" element={<TermsPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<AgendaPage />} />
        <Route path="/nueva-cita" element={<NewAppointmentPage />} />
        <Route path="/cita/:id/editar" element={<EditAppointmentPage />} />
        <Route path="/clientes" element={<ClientsPage />} />
        <Route path="/clientes/:id" element={<ClientDetailPage />} />
        <Route path="/barberos" element={<StaffPage />} />
        <Route path="/servicios" element={<ServicesPage />} />
        <Route path="/facturacion" element={<IngresosPage />} />
        <Route path="/fidelizacion" element={<FidelizacionPage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
