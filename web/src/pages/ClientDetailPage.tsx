import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Appointment, type Client } from "../api";
import { ReliabilityBadge } from "../components/ReliabilityBadge";
import { PrewarningBanner } from "../components/PrewarningBanner";
import { formatDateEs, formatMoney, formatTime, STATUS_LABELS } from "../utils";

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<(Client & { appointments: Appointment[] }) | null>(null);

  useEffect(() => {
    if (id) api.getClient(id).then((r) => setClient(r.client));
  }, [id]);

  if (!client) return <p className="muted">Cargando...</p>;

  return (
    <div>
      <Link to="/clientes" className="muted">
        ‹ Volver a clientes
      </Link>
      <div className="page-header">
        <h1>{client.name}</h1>
        <ReliabilityBadge status={client.reliabilityStatus} />
      </div>
      <p className="muted">
        {client.phone} {client.email ? `· ${client.email}` : ""}
      </p>

      <PrewarningBanner prewarning={client.prewarning} />

      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{client.totalAppointments}</span>
          <span className="muted">Citas totales</span>
        </div>
        <div className="stat">
          <span className="stat-value">{client.completedCount}</span>
          <span className="muted">Completadas</span>
        </div>
        <div className="stat">
          <span className="stat-value">{client.noShowCount}</span>
          <span className="muted">No presentado</span>
        </div>
        <div className="stat">
          <span className="stat-value">{client.lateCancelCount}</span>
          <span className="muted">Cancel. tarde</span>
        </div>
      </div>

      <h2>Historial</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Servicio</th>
            <th>Precio</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {client.appointments.map((a) => (
            <tr key={a.id}>
              <td>
                {formatDateEs(a.startTime)} {formatTime(a.startTime)}
              </td>
              <td>{a.service.name}</td>
              <td>{formatMoney(a.service.priceCents)}</td>
              <td>
                <span className={`status-pill status-${a.status.toLowerCase()}`}>{STATUS_LABELS[a.status]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {client.appointments.length === 0 && <p className="muted">Sin citas todavía.</p>}
    </div>
  );
}
