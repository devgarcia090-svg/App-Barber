import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type Appointment, type AppointmentStatus, type PaymentMethod, type Staff } from "../api";
import { ReliabilityBadge } from "../components/ReliabilityBadge";
import { PrewarningBanner } from "../components/PrewarningBanner";
import { addDaysToDateStr, dayBounds, formatMoney, formatTime, minutesToTimeLabel, STATUS_LABELS, todayStr } from "../utils";

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

const PX_PER_MIN = 1.5; // altura del calendario: 1 hora = 90px
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

function localMinute(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// Lunes de la semana que contiene dateStr.
function mondayOf(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return d;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  const [selected, setSelected] = useState<Appointment | null>(null);

  useEffect(() => {
    api.getStaff().then((r) => setStaff(r.staff.filter((s) => s.active)));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const { from, to } = dayBounds(date);
    api
      .getAppointments({ from, to })
      .then((r) => setAppointments(r.appointments))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error cargando la agenda"))
      .finally(() => setLoading(false));
  }, [date]);

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

  async function updateStatus(id: string, status: AppointmentStatus) {
    try {
      const { appointment } = await api.setAppointmentStatus(id, status);
      setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, ...appointment } : a)));
      setSelected(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo actualizar la cita");
    }
  }
  async function complete(id: string, method: PaymentMethod | null) {
    try {
      const { appointment } = await api.completeAppointment(id, method);
      setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, ...appointment } : a)));
      setPayingFor(null);
      setSelected(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo completar la cita");
    }
  }

  const cols = staffId === "all" ? staff : staff.filter((s) => s.id === staffId);
  const dow = new Date(`${date}T00:00:00`).getDay();
  const shiftsOf = (s: Staff) => s.workingHours.filter((w) => w.dayOfWeek === dow).sort((a, b) => a.startMinute - b.startMinute);

  // Rango horario de la rejilla: turnos de los barberos mostrados, ampliado si
  // alguna cita cae fuera del horario (así nunca se sale de la rejilla).
  const bounds = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of cols) for (const sh of shiftsOf(s)) {
      lo = Math.min(lo, sh.startMinute);
      hi = Math.max(hi, sh.endMinute);
    }
    for (const a of appointments) {
      if (a.status === "CANCELLED" || a.status === "NO_SHOW") continue;
      if (!cols.some((c) => c.id === a.staff?.id)) continue;
      lo = Math.min(lo, localMinute(a.startTime));
      hi = Math.max(hi, localMinute(a.endTime));
    }
    if (!isFinite(lo)) return null;
    return { start: Math.floor(lo / 60) * 60, end: Math.ceil(hi / 60) * 60 };
  }, [cols, date, appointments]);

  const now = Date.now();
  const weekDays = useMemo(() => {
    const mon = mondayOf(date);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
  }, [date]);

  function quickAdd(minute: number, sid: string) {
    navigate(`/nueva-cita?fecha=${date}&staffId=${sid}&min=${minute}`);
  }

  const gridHeight = bounds ? (bounds.end - bounds.start) * PX_PER_MIN : 0;
  const hourLabels = bounds
    ? Array.from({ length: (bounds.end - bounds.start) / 60 + 1 }, (_, i) => bounds.start / 60 + i)
    : [];

  function columnFor(s: Staff) {
    const shifts = shiftsOf(s);
    const live = appointments.filter((a) => a.staff?.id === s.id && a.status !== "CANCELLED" && a.status !== "NO_SHOW");
    // Huecos libres de 15 min dentro de los turnos.
    const free: { minute: number; past: boolean }[] = [];
    for (const sh of shifts) {
      for (let t = sh.startMinute; t + 15 <= sh.endMinute; t += 15) {
        const covered = live.some((a) => localMinute(a.startTime) < t + 15 && localMinute(a.endTime) > t);
        if (covered) continue;
        const slot = new Date(`${date}T00:00:00`);
        slot.setMinutes(t);
        free.push({ minute: t, past: slot.getTime() < now });
      }
    }
    return { shifts, live, free };
  }

  return (
    <div>
      <div className="page-header">
        <h1>Agenda</h1>
        <Link className="btn-primary" to={`/nueva-cita?fecha=${date}${staffId !== "all" ? `&staffId=${staffId}` : ""}`}>
          + Nueva cita
        </Link>
      </div>

      {/* Tira de semana */}
      <div className="weekstrip">
        <button className="week-nav" onClick={() => setDate(addDaysToDateStr(date, -7))} title="Semana anterior">
          ‹
        </button>
        {weekDays.map((d) => {
          const ds = ymd(d);
          return (
            <button key={ds} className={`weekday ${ds === date ? "active" : ""} ${ds === todayStr() ? "today" : ""}`} onClick={() => setDate(ds)}>
              <span className="weekday-name">{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
              <span className="weekday-num">{d.getDate()}</span>
            </button>
          );
        })}
        <button className="week-nav" onClick={() => setDate(addDaysToDateStr(date, 7))} title="Semana siguiente">
          ›
        </button>
      </div>

      <div className="agenda-toolbar">
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
        <input className="agenda-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {loading && <p className="muted">Cargando...</p>}
      {error && <div className="alert-error">{error}</div>}

      {!loading && !error && !bounds && <p className="muted">Nadie trabaja ese día.</p>}

      {!loading && !error && bounds && (
        <div className="cal-scroll">
          <div className="cal">
            <div className="cal-head">
              <div className="cal-corner" />
              {cols.map((s) => (
                <div key={s.id} className="cal-colhead">
                  <span className="dot" style={{ background: s.color }} /> {s.name}
                </div>
              ))}
            </div>
            <div className="cal-body" style={{ height: gridHeight }}>
              <div className="cal-axis">
                {hourLabels.map((h) => (
                  <span key={h} className="cal-hour" style={{ top: (h * 60 - bounds.start) * PX_PER_MIN }}>
                    {String(h).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
              {/* línea de la hora actual (solo si estás viendo hoy) */}
              {date === todayStr() &&
                (() => {
                  const d = new Date();
                  const m = d.getHours() * 60 + d.getMinutes();
                  if (m < bounds.start || m > bounds.end) return null;
                  return <div className="cal-now" style={{ top: (m - bounds.start) * PX_PER_MIN }} />;
                })()}
              {cols.map((s) => {
                const { shifts, live, free } = columnFor(s);
                return (
                  <div key={s.id} className="cal-col">
                    {/* líneas de hora */}
                    {hourLabels.slice(1).map((h) => (
                      <div key={h} className="cal-line" style={{ top: (h * 60 - bounds.start) * PX_PER_MIN }} />
                    ))}
                    {/* turnos (zona abierta) */}
                    {shifts.map((sh, i) => (
                      <div
                        key={i}
                        className="cal-open"
                        style={{ top: (sh.startMinute - bounds.start) * PX_PER_MIN, height: (sh.endMinute - sh.startMinute) * PX_PER_MIN }}
                      />
                    ))}
                    {/* huecos libres */}
                    {free.map((f) => (
                      <button
                        key={f.minute}
                        className="cal-free"
                        disabled={f.past}
                        title={f.past ? "Ya ha pasado" : `Añadir cita a las ${minutesToTimeLabel(f.minute)}`}
                        style={{ top: (f.minute - bounds.start) * PX_PER_MIN, height: 15 * PX_PER_MIN }}
                        onClick={() => quickAdd(f.minute, s.id)}
                      >
                        <span className="cal-free-plus">＋</span>
                      </button>
                    ))}
                    {/* citas */}
                    {live.map((a) => {
                      const start = localMinute(a.startTime);
                      const end = localMinute(a.endTime);
                      const h = (end - start) * PX_PER_MIN;
                      return (
                        <button
                          key={a.id}
                          className={`cal-appt appt-${a.status.toLowerCase()}`}
                          style={{ top: (start - bounds.start) * PX_PER_MIN, height: Math.max(h - 2, 22) }}
                          onClick={() => setSelected(a)}
                        >
                          <span className="cal-appt-top">
                            <span className="cal-appt-time">{formatTime(a.startTime)}</span>
                            <span className={`status-dot status-${a.status.toLowerCase()}`} />
                          </span>
                          <span className="cal-appt-name">{a.client.name}</span>
                          {h > 46 && <span className="cal-appt-svc">{a.service.name}</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Detalle de cita con acciones */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-card modal-appt" onClick={(e) => e.stopPropagation()}>
            <div className="appointment-main" style={{ justifyContent: "center" }}>
              <span className="client-name">{selected.client.name}</span>
              <ReliabilityBadge status={selected.client.reliabilityStatus} />
            </div>
            <p className="muted" style={{ textAlign: "center" }}>
              {formatTime(selected.startTime)}–{formatTime(selected.endTime)} · {selected.service.name} · {formatMoney(selected.service.priceCents)}
              {selected.staff ? ` · ${selected.staff.name}` : ""}
            </p>
            <p style={{ textAlign: "center" }}>
              <span className={`status-pill status-${selected.status.toLowerCase()}`}>{STATUS_LABELS[selected.status]}</span>
              {selected.status === "COMPLETED" && selected.paymentMethod && (
                <span className="pay-tag"> · {selected.paymentMethod === "CASH" ? "💶 Efectivo" : "💳 Tarjeta"}</span>
              )}
            </p>
            <PrewarningBanner prewarning={selected.prewarning} />
            <div className="modal-actions">
              {(selected.status === "PENDING" || selected.status === "CONFIRMED") && (
                <Link className="btn-small" to={`/cita/${selected.id}/editar`}>
                  Editar / mover
                </Link>
              )}
              {(NEXT_STATUS[selected.status] ?? []).map((next) => (
                <button
                  key={next.status}
                  className="btn-small"
                  onClick={() => (next.status === "COMPLETED" ? setPayingFor(selected) : updateStatus(selected.id, next.status))}
                >
                  {next.label}
                </button>
              ))}
            </div>
            <button className="btn-ghost" onClick={() => setSelected(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Método de pago al completar */}
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
