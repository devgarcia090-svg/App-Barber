import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { formatDateEs, formatTime } from "../utils";

interface TokenAppointment {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  serviceName: string;
  staffName: string;
  businessName: string;
  clientName: string;
}

// Gestionar (y cancelar) una reserva hecha sin cuenta, mediante el enlace que
// se muestra al reservar. No requiere sesión: el token identifica solo esa
// cita, no da acceso a nada más del cliente.
export function CancelAppointmentPage() {
  const { token } = useParams<{ token: string }>();
  const [appt, setAppt] = useState<TokenAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .publicGetAppointmentByToken(token)
      .then((a) => setAppt(a as TokenAppointment))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleCancel() {
    if (!token) return;
    setCancelling(true);
    setError(null);
    try {
      await api.publicCancelByToken(token);
      setCancelled(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar la cita");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="public-page">
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  if (notFound || !appt) {
    return (
      <div className="public-page">
        <p className="muted">No se encontró esta reserva. El enlace puede ser incorrecto.</p>
      </div>
    );
  }

  const dateLabel = formatDateEs(appt.startTime, { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = formatTime(appt.startTime);

  const alreadyInactive = appt.status === "CANCELLED" || appt.status === "COMPLETED" || appt.status === "NO_SHOW";

  return (
    <div className="public-page">
      <header className="public-header">
        <div className="auth-logo" style={{ width: 56, height: 56, fontSize: "1.3rem", margin: 0 }}>
          ✂
        </div>
        <div>
          <h1 className="public-title">{appt.businessName}</h1>
          <span className="muted">Gestionar reserva</span>
        </div>
      </header>

      {cancelled ? (
        <section className="confirmation">
          <div className="confirmation-icon">✓</div>
          <h2 style={{ textTransform: "none", letterSpacing: 0, fontSize: "1.3rem", color: "var(--text)" }}>Cita cancelada</h2>
          <p className="muted">Ya hemos avisado al negocio. ¡Gracias por decírnoslo!</p>
        </section>
      ) : (
        <section>
          <div className="notice">
            {appt.clientName} · {appt.serviceName} · {appt.staffName}
          </div>
          <p style={{ fontSize: "1.05rem", margin: "1rem 0" }}>
            Tu cita es el <b>{dateLabel}</b> a las <b>{timeLabel}</b>.
          </p>

          {error && <div className="alert-error">{error}</div>}

          {alreadyInactive ? (
            <p className="muted">
              Esta cita ya está {appt.status === "CANCELLED" ? "cancelada" : appt.status === "COMPLETED" ? "completada" : "marcada como no presentada"}
              , no se puede modificar.
            </p>
          ) : (
            <button className="btn-danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "Cancelando..." : "Cancelar mi cita"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
