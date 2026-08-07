import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { barber, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✂</span>
          <span className="brand-name">{barber?.businessName}</span>
        </div>
        <nav className="topnav">
          <NavLink to="/" end>
            Agenda
          </NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
          <NavLink to="/barberos">Barberos</NavLink>
          <NavLink to="/servicios">Servicios</NavLink>
          <NavLink to="/facturacion">Facturación</NavLink>
          <NavLink to="/fidelizacion">Fidelización</NavLink>
          <NavLink to="/ajustes">Ajustes</NavLink>
        </nav>
        <button className="btn-ghost btn-logout" onClick={logout}>
          Salir
        </button>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
