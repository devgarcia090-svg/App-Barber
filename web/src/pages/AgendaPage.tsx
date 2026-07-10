import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, type Appointment, type AppointmentStatus, type Staff } from "../api";
import { ReliabilityBadge } from "../components/ReliabilityBadge";
import { PrewarningBanner } from "../components/PrewarningBanner";
import { addDaysToDateStr, dayBounds, formatDateHuman, formatMoney, formatTime, STATUS_LABELS, todayStr } from "../utils";

const NEXT_STATUS: Partial<Record<AppointmentStatus, { label: string; status: AppointmentStatus }[]>> = {
  PENDING: [
    { label: "Confirmar", status: "CONFIRMED" },
    { label: "Cancelar", status: "CANCELLED" },
  ],
  CONFIRMED: [
    { label: "Completada", status: "COMPLETED" },
    { label: "No presentado", status: "NO_SHOW" },
    { label: "Cancelar", status: "CANCELLED" },
  ],
};

export function AgendaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const date = searchParams.get("fecha") ?? todayStr();
  const staffId = searchParams.get("staffId") ?? "all";

  const [staff, setStaff] = useState<Staff[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getStaff().then((r) => setStaff(r.staff.filter((s) => s.active)));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const { from, to } = dayBounds(date);
    api
      .getAppointments({ from, to, ...(staffId !== "all" ? { staffId } : {}) })
      .then((r) => setAppointments(r.appointments))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error cargando la agenda"))
      .finally(() => setLoading(false));
  }, [date, staffId]);

  function setDate(newDate: string) {
    setSearchParams((prev) => {
      prev.set("fecha", newDate);
      return prev;
    });
  }

  function setStaffFilter(id: string) {
    setSearchParams((prev) => {
      prev.set("staffId", id);
      return prev;
    });
  }

  async function updateStatus(appointmentId: string, status: AppointmentStatus) {
    try {
      const { appointment } = await api.setAppointmentStatus(appointmentId, status);
      setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, ...appointment } : a)));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo actualizar la cita");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Agenda</h1>
        <Link className="btn-primary" to={`/nueva-cita?fecha=${date}${staffId !== "all" ? `&staffId=${staffId}` : ""}`}>
          + Nueva cita
        </Link>
      </div>

      <div className="date-nav">
        <button onClick={() => setDate(addDaysToDateStr(date, -1))}>‹</button>
        <div className="date-nav-current">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <span className="muted">{formatDateHuman(date)}</span>
        </div>
        <button onClick={() => setDate(addDaysToDateStr(date, 1))}>›</button>
        <button className="btn-ghost" onClick={() => setDate(todayStr())}>
          Hoy
        </button>
      </div>

      <div className="staff-tabs">
        <button className={staffId === "all" ? "active" : ""} onClick={() => setStaffFilter("all")}>
          Todos
        </button>
        {staff.map((s) => (
          <button key={s.id} className={staffId === s.id ? "active" : ""} onClick={() => setStaffFilter(s.id)}>
            <span className="dot" style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Cargando...</p>}
      {error && <div className="alert-error">{error}</div>}

      {!loading && appointments.length === 0 && <p className="muted">No hay citas ese día.</p>}

      <div className="appointment-list">
        {appointments.map((appt) => (
          <div key={appt.id} className="appointment-card">
            <div className="appointment-time">
              <strong>{formatTime(appt.startTime)}</strong>
              <span className="muted"> - {formatTime(appt.endTime)}</span>
            </div>
            <div className="appointment-body">
              <div className="appointment-main">
                <span className="client-name">{appt.client.name}</span>
                <ReliabilityBadge status={appt.client.reliabilityStatus} />
                <span className={`status-pill status-${appt.status.toLowerCase()}`}>{STATUS_LABELS[appt.status]}</span>
              </div>
              <div className="muted">
                {appt.service.name} · {formatMoney(appt.service.priceCents)}
                {staffId === "all" && appt.staff ? ` · ${appt.staff.name}` : ""}
              </div>
              <PrewarningBanner prewarning={appt.prewarning} />
            </div>
            <div className="appointment-actions">
              {(NEXT_STATUS[appt.status] ?? []).map((next) => (
                <button key={next.status} className="btn-small" onClick={() => updateStatus(appt.id, next.status)}>
                  {next.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
