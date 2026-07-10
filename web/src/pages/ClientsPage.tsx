import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Client } from "../api";
import { ReliabilityBadge } from "../components/ReliabilityBadge";

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getClients()
      .then((r) => setClients(r.clients))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [clients, query]);

  return (
    <div>
      <div className="page-header">
        <h1>Clientes</h1>
      </div>
      <input className="search-input" placeholder="Buscar por nombre o teléfono..." value={query} onChange={(e) => setQuery(e.target.value)} />

      {loading && <p className="muted">Cargando...</p>}

      <table className="data-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Fiabilidad</th>
            <th>Citas</th>
            <th>Faltas</th>
            <th>Cancel. tarde</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={`/clientes/${c.id}`}>{c.name}</Link>
              </td>
              <td>{c.phone}</td>
              <td>
                <ReliabilityBadge status={c.reliabilityStatus} />
              </td>
              <td>{c.totalAppointments}</td>
              <td>{c.noShowCount}</td>
              <td>{c.lateCancelCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && filtered.length === 0 && <p className="muted">No hay clientes.</p>}
    </div>
  );
}
