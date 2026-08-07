import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type Appointment, type AppointmentStatus, type PaymentMethod, type Staff } from "../api";
import { ReliabilityBadge } from "../components/ReliabilityBadge";
import { PrewarningBanner } from "../components/PrewarningBanner";
import { addDaysToDateStr, dayBounds, formatDateHuman, formatMoney, formatTime, minutesToTimeLabel, STATUS_LABELS, todayStr } from "../utils";

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

function localMinute(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

type Row = { kind: "appt"; appt: Appointment } | { kind: "free"; minute: number; past: boolean };

export function AgendaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const date = searchParams.get("fecha") ?? todayStr();
  const staffId = searchParams.get("staffId") ?? "all";

  const [staff, setStaff] = useState<Staff[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingFor, setPayingFor] = useState<Appointment | null>(null);

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
  async function complete(appointmentId: string, method: PaymentMethod | null) {
    try {
      const { appointment } = await api.completeAppointment(appointmentId, method);
      setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, ...appointment } : a)));
      setPayingFor(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo completar la cita");
    }
  }

  const selectedStaff = staff.find((s) => s.id === staffId);

  // Línea de tiempo del día para un barbero concreto: huecos libres + citas.
  const timeline: Row[] = useMemo(() => {
    if (!selectedStaff) return [];
    const dow = new Date(`${date}T00:00:00`).getDay();
    const shifts = selectedStaff.workingHours.filter((w) => w.dayOfWeek === dow).sort((a, b) => a.startMinute - b.startMinute);
    const live = appointments
      .filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW")
      .map((a) => ({ a, s: localMinute(a.startTime), e: localMinute(a.endTime) }))
      .sort((x, y) => x.s - y.s);
    const now = Date.now();
    const rows: Row[] = [];
    for (const shift of shifts) {
      let t = shift.startMinute;
      while (t < shift.endMinute) {
        const starting = live.find((x) => x.s >= t && x.s < t + 15);
        const covering = live.find((x) => x.s <= t && x.e > t);
        if (starting) {
          rows.push({ kind: "appt", appt: starting.a });
          t = Math.max(t + 15, starting.e);
        } else if (covering) {
          t += 15;
        } else {
          const slotStart = new Date(`${date}T00:00:00`);
          slotStart.setMinutes(t);
          rows.push({ kind: "free", minute: t, past: slotStart.getTime() < now });
          t += 15;
        }
      }
    }
    return rows;
  }, [selectedStaff, appointments, date]);

  const freeCount = timeline.filter((r) => r.kind === "free" && !r.past).length;
  const useTimeline = !!selectedStaff && timeline.length > 0;
  // Citas canceladas / no presentadas del día (no ocupan hueco, pero conviene verlas).
  const inactive = useTimeline ? appointments.filter((a) => a.status === "CANCELLED" || a.status === "NO_SHOW") : [];

  function quickAdd(minute: number) {
    navigate(`/nueva-cita?fecha=${date}&staffId=${staffId}&min=${minute}`);
  }

  function ApptCard({ appt }: { appt: Appointment }) {
    return (
      <div className={`appointment-card appt-${appt.status.toLowerCase()}`}>
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
          {(appt.status === "PENDING" || appt.status === "CONFIRMED") && (
            <Link className="btn-small" to={`/cita/${appt.id}/editar`}>
              Editar
            </Link>
          )}
          {(NEXT_STATUS[appt.status] ?? []).map((next) => (
            <button
              key={next.status}
              className="btn-small"
              onClick={() => (next.status === "COMPLETED" ? setPayingFor(appt) : updateStatus(appt.id, next.status))}
            >
              {next.label}
            </button>
          ))}
          {appt.status === "COMPLETED" && appt.paymentMethod && (
            <span className="pay-tag">{appt.paymentMethod === "CASH" ? "💶 Efectivo" : "💳 Tarjeta"}</span>
          )}
        </div>
      </div>
    );
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

      {!loading && !error && (
        <>
          {staffId === "all" && (
            <p className="muted agenda-hint">Elige un barbero para ver los huecos libres y añadir citas al momento.</p>
          )}

          {useTimeline ? (
            <>
              <div className="timeline-summary">
                <span className="dot" style={{ background: selectedStaff!.color }} /> {selectedStaff!.name} ·{" "}
                <strong>{freeCount}</strong> {freeCount === 1 ? "hueco libre" : "huecos libres"}
              </div>
              <div className="timeline">
                {timeline.map((row) =>
                  row.kind === "appt" ? (
                    <ApptCard key={row.appt.id} appt={row.appt} />
                  ) : (
                    <button
                      key={`free-${row.minute}`}
                      className="slot-free"
                      disabled={row.past}
                      onClick={() => quickAdd(row.minute)}
                      title={row.past ? "Ya ha pasado" : "Añadir cita a esta hora"}
                    >
                      <span className="slot-free-time">{minutesToTimeLabel(row.minute)}</span>
                      <span className="slot-free-label">{row.past ? "—" : "Libre"}</span>
                      <span className="slot-free-add">＋</span>
                    </button>
                  )
                )}
              </div>

              {inactive.length > 0 && (
                <>
                  <h2>Canceladas / no presentadas</h2>
                  <div className="appointment-list">
                    {inactive.map((appt) => (
                      <ApptCard key={appt.id} appt={appt} />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {selectedStaff && appointments.length === 0 && <p className="muted">Ese barbero no trabaja ese día.</p>}
              {appointments.length === 0 && !selectedStaff && <p className="muted">No hay citas ese día.</p>}
              <div className="appointment-list">
                {appointments.map((appt) => (
                  <ApptCard key={appt.id} appt={appt} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {payingFor && (
        <div className="modal-overlay" onClick={() => setPayingFor(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>¿Cómo ha pagado?</h2>
            <p className="muted">
              {payingFor.client.name} · {payingFor.service.name} · {formatMoney(payingFor.service.priceCents)}
            </p>
            <div className="pay-options">
              <button className="pay-btn" onClick={() => complete(payingFor.id, "CASH")}>
                <span className="pay-emoji">💶</span> Efectivo
              </button>
              <button className="pay-btn" onClick={() => complete(payingFor.id, "CARD")}>
                <span className="pay-emoji">💳</span> Tarjeta
              </button>
            </div>
            <button className="btn-ghost" onClick={() => complete(payingFor.id, null)}>
              Completar sin especificar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
