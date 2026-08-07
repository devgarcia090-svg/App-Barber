import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const SNAP = 15; // el arrastre encaja en tramos de 15 min
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

function localMinute(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
function isMovable(a: Appointment): boolean {
  return a.status === "PENDING" || a.status === "CONFIRMED";
}
function mondayOf(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
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
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    api.getStaff().then((r) => setStaff(r.staff.filter((s) => s.active)));
  }, []);

  const load = useCallback(() => {
    const { from, to } = dayBounds(date);
    return api
      .getAppointments({ from, to })
      .then((r) => setAppointments(r.appointments))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error cargando la agenda"));
  }, [date]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    load().finally(() => setLoading(false));
  }, [load]);

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

  // ---- Arrastrar para mover una cita -----------------------------------------
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRef = useRef<{ appt: Appointment; dur: number; offset: number; moved: boolean; x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{ id: string; minute: number; staffId: string } | null>(null);

  // Posición efectiva de una cita (la del arrastre en curso, si es la suya).
  const effective = (a: Appointment) =>
    preview && preview.id === a.id
      ? { staffId: preview.staffId, start: preview.minute }
      : { staffId: a.staff?.id ?? "", start: localMinute(a.startTime) };

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

  function minuteAt(clientY: number): number | null {
    const body = bodyRef.current;
    if (!body || !bounds) return null;
    return bounds.start + (clientY - body.getBoundingClientRect().top) / PX_PER_MIN;
  }
  function staffAt(clientX: number): string | null {
    for (const s of cols) {
      const el = colRefs.current[s.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return s.id;
    }
    return null;
  }

  function onApptPointerDown(e: React.PointerEvent, a: Appointment) {
    if (!isMovable(a) || moving) return;
    const m = minuteAt(e.clientY);
    if (m === null) return;
    const start = localMinute(a.startTime);
    dragRef.current = {
      appt: a,
      dur: localMinute(a.endTime) - start,
      offset: m - start,
      moved: false,
      x: e.clientX,
      y: e.clientY,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onApptPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !bounds) return;
    if (!d.moved && Math.abs(e.clientX - d.x) < 5 && Math.abs(e.clientY - d.y) < 5) return;
    d.moved = true;
    const m = minuteAt(e.clientY);
    if (m === null) return;
    let start = Math.round((m - d.offset) / SNAP) * SNAP;
    start = Math.max(bounds.start, Math.min(start, bounds.end - d.dur));
    setPreview({ id: d.appt.id, minute: start, staffId: staffAt(e.clientX) ?? d.appt.staff?.id ?? "" });
  }

  async function onApptPointerUp(a: Appointment) {
    const d = dragRef.current;
    const p = preview;
    dragRef.current = null;
    setPreview(null);
    if (!d) return;
    // Sin desplazamiento => ha sido un clic: abre la ficha.
    if (!d.moved) {
      setSelected(a);
      return;
    }
    if (!p) return;
    if (p.minute === localMinute(a.startTime) && p.staffId === a.staff?.id) return;

    const startTime = new Date(`${date}T00:00:00`);
    startTime.setMinutes(p.minute);
    setMoving(true);
    try {
      await api.rescheduleAppointment(a.id, {
        staffId: p.staffId,
        serviceId: a.service.id,
        startTime: startTime.toISOString(),
        notes: a.notes ?? undefined,
      });
      await load(); // recarga para traer el barbero/hora ya con sus datos
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo mover la cita");
    } finally {
      setMoving(false);
    }
  }

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
  const hourLabels = bounds ? Array.from({ length: (bounds.end - bounds.start) / 60 + 1 }, (_, i) => bounds.start / 60 + i) : [];

  function columnFor(s: Staff) {
    const shifts = shiftsOf(s);
    const live = appointments.filter(
      (a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW" && effective(a).staffId === s.id
    );
    const free: { minute: number; past: boolean }[] = [];
    for (const sh of shifts) {
      for (let t = sh.startMinute; t + SNAP <= sh.endMinute; t += SNAP) {
        const covered = live.some((a) => {
          const st = effective(a).start;
          const en = st + (localMinute(a.endTime) - localMinute(a.startTime));
          return st < t + SNAP && en > t;
        });
        if (covered) continue;
        const slot = new Date(`${date}T00:00:00`);
        slot.setMinutes(t);
        free.push({ minute: t, past: slot.getTime() < now });
      }
    }
    return { shifts, live, free };
  }

  const hasMovable = appointments.some(isMovable);

  return (
    <div>
      <div className="page-header">
        <h1>Agenda</h1>
        <Link className="btn-primary" to={`/nueva-cita?fecha=${date}${staffId !== "all" ? `&staffId=${staffId}` : ""}`}>
          + Nueva cita
        </Link>
      </div>

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
        <>
          {hasMovable && (
            <p className="muted agenda-hint">
              Arrastra una cita para cambiarla de hora o de barbero. Pulsa en un hueco libre para añadir una.
              {moving && <strong style={{ color: "var(--gold)" }}> Guardando...</strong>}
            </p>
          )}
          <div className={`cal-scroll ${preview ? "cal-dragging" : ""}`}>
            <div className="cal">
              <div className="cal-head">
                <div className="cal-corner" />
                {cols.map((s) => (
                  <div key={s.id} className={`cal-colhead ${preview?.staffId === s.id ? "target" : ""}`}>
                    <span className="dot" style={{ background: s.color }} /> {s.name}
                  </div>
                ))}
              </div>
              <div className="cal-body" style={{ height: gridHeight }} ref={bodyRef}>
                <div className="cal-axis">
                  {hourLabels.map((h) => (
                    <span key={h} className="cal-hour" style={{ top: (h * 60 - bounds.start) * PX_PER_MIN }}>
                      {String(h).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>

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
                    <div key={s.id} className={`cal-col ${preview?.staffId === s.id ? "target" : ""}`} ref={(el) => { colRefs.current[s.id] = el; }}>
                      {hourLabels.slice(1).map((h) => (
                        <div key={h} className="cal-line" style={{ top: (h * 60 - bounds.start) * PX_PER_MIN }} />
                      ))}
                      {shifts.map((sh, i) => (
                        <div
                          key={i}
                          className="cal-open"
                          style={{ top: (sh.startMinute - bounds.start) * PX_PER_MIN, height: (sh.endMinute - sh.startMinute) * PX_PER_MIN }}
                        />
                      ))}
                      {free.map((f) => (
                        <button
                          key={f.minute}
                          className="cal-free"
                          disabled={f.past || !!preview}
                          title={f.past ? "Ya ha pasado" : `Añadir cita a las ${minutesToTimeLabel(f.minute)}`}
                          style={{ top: (f.minute - bounds.start) * PX_PER_MIN, height: SNAP * PX_PER_MIN }}
                          onClick={() => quickAdd(f.minute, s.id)}
                        >
                          <span className="cal-free-plus">＋</span>
                        </button>
                      ))}
                      {live.map((a) => {
                        const dur = localMinute(a.endTime) - localMinute(a.startTime);
                        const start = effective(a).start;
                        const h = dur * PX_PER_MIN;
                        const dragging = preview?.id === a.id;
                        return (
                          <button
                            key={a.id}
                            className={`cal-appt appt-${a.status.toLowerCase()} ${isMovable(a) ? "movable" : ""} ${dragging ? "dragging" : ""}`}
                            style={{ top: (start - bounds.start) * PX_PER_MIN, height: Math.max(h - 2, 22) }}
                            onPointerDown={(e) => onApptPointerDown(e, a)}
                            onPointerMove={onApptPointerMove}
                            onPointerUp={() => onApptPointerUp(a)}
                            onClick={() => {
                              if (!isMovable(a)) setSelected(a);
                            }}
                          >
                            <span className="cal-appt-top">
                              <span className="cal-appt-time">
                                {dragging ? minutesToTimeLabel(start) : formatTime(a.startTime)}
                              </span>
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
        </>
      )}

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
              {isMovable(selected) && (
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
