import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, type Service } from "../api";
import { formatMoney, minutesToTimeLabel, todayStr } from "../utils";

interface PublicStaff {
  id: string;
  name: string;
  color: string;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });
const WEEKDAY_HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(d: Date): { from: string; to: string } {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
}

/** Availability level → CSS class. Mirrors Booksy's colored day indicators. */
function levelClass(freeCount: number): string {
  if (freeCount === 0) return "";
  if (freeCount <= 3) return "cal-level-low";
  if (freeCount <= 8) return "cal-level-mid";
  return "cal-level-high";
}

export function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();

  const [business, setBusiness] = useState<{ businessName: string; phone: string | null } | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<PublicStaff[]>([]);
  const [notFound, setNotFound] = useState(false);

  // Step 1: service. Step 2: staff + date + slot. Step 3: contact details. Step 4: done.
  const [service, setService] = useState<Service | null>(null);
  const [staffId, setStaffId] = useState<string>("any");
  const [month, setMonth] = useState(() => new Date());
  const [days, setDays] = useState<Map<string, number>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ startMinute: number; staffIds: string[] }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    if (!slug) return;
    api
      .publicGetBusiness(slug)
      .then((r) => {
        setBusiness(r.barber);
        setServices(r.services);
        setStaff(r.staff);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!slug || !service || step !== 2) return;
    const { from, to } = monthBounds(month);
    const fromClamped = from < todayStr() && monthKey(month) === monthKey(new Date()) ? todayStr() : from;
    api
      .publicGetAvailability(slug, {
        serviceId: service.id,
        from: fromClamped,
        to,
        ...(staffId !== "any" ? { staffId } : {}),
      })
      .then((r) => setDays(new Map(r.days.map((d) => [d.date, d.freeCount]))));
  }, [slug, service, staffId, month, step]);

  useEffect(() => {
    if (!slug || !service || !selectedDate) return;
    setSelectedSlot(null);
    api
      .publicGetDaySlots(slug, { serviceId: service.id, date: selectedDate, ...(staffId !== "any" ? { staffId } : {}) })
      .then((r) => setSlots(r.slots));
  }, [slug, service, selectedDate, staffId]);

  const calendarCells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    // getDay(): 0=Sunday; we render Monday-first.
    const leadingBlanks = (first.getDay() + 6) % 7;
    const cells: ({ day: number; dateStr: string } | null)[] = Array(leadingBlanks).fill(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ day, dateStr });
    }
    return cells;
  }, [month]);

  async function handleConfirm() {
    if (!slug || !service || !selectedDate || selectedSlot === null) return;
    const slot = slots.find((s) => s.startMinute === selectedSlot);
    if (!slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const startTime = new Date(`${selectedDate}T00:00:00`);
      startTime.setMinutes(selectedSlot);
      await api.publicBook(slug, {
        staffId: staffId !== "any" ? staffId : slot.staffIds[0],
        serviceId: service.id,
        startTime: startTime.toISOString(),
        clientName,
        clientPhone,
      });
      setConfirmation({ date: selectedDate, time: minutesToTimeLabel(selectedSlot) });
      setStep(4);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la reserva");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div className="public-page">
        <p className="muted">Negocio no encontrado.</p>
      </div>
    );
  }
  if (!business) {
    return (
      <div className="public-page">
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  const today = todayStr();
  const isCurrentMonth = monthKey(month) === monthKey(new Date());

  return (
    <div className="public-page">
      <header className="public-header">
        <div className="auth-logo" style={{ width: 56, height: 56, fontSize: "1.3rem", margin: 0 }}>
          ✂
        </div>
        <div>
          <h1 className="public-title">{business.businessName}</h1>
          <span className="muted">Llano de Brujas · Murcia</span>
        </div>
      </header>

      {step === 1 && (
        <section>
          <h2>Servicios</h2>
          <div className="service-list">
            {services.map((s) => (
              <div key={s.id} className="service-row">
                <div>
                  <div className="service-name">{s.name}</div>
                  <div className="muted">{s.durationMinutes} min</div>
                </div>
                <div className="service-book">
                  <span className="service-price">{formatMoney(s.priceCents)}</span>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setService(s);
                      setStep(2);
                      setSelectedDate(null);
                      setSelectedSlot(null);
                    }}
                  >
                    Reservar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {step === 2 && service && (
        <section>
          <button className="btn-ghost" onClick={() => setStep(1)}>
            ‹ Servicios
          </button>
          <h2 style={{ marginTop: "1rem" }}>Seleccionar fecha y hora</h2>

          <div className="staff-picker">
            <button className={`staff-avatar ${staffId === "any" ? "selected" : ""}`} onClick={() => setStaffId("any")}>
              <span className="staff-avatar-circle">👥</span>
              <span className="staff-avatar-name">Cualquiera</span>
            </button>
            {staff.map((s) => (
              <button key={s.id} className={`staff-avatar ${staffId === s.id ? "selected" : ""}`} onClick={() => setStaffId(s.id)}>
                <span className="staff-avatar-circle" style={{ borderColor: s.color, color: s.color }}>
                  {s.name.charAt(0)}
                </span>
                <span className="staff-avatar-name">{s.name}</span>
              </button>
            ))}
          </div>

          <div className="cal-header">
            <span className="cal-month">{MONTH_FORMATTER.format(month)}</span>
            <div className="cal-nav">
              <button
                disabled={isCurrentMonth}
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                ‹
              </button>
              <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
            </div>
          </div>

          <div className="cal-grid">
            {WEEKDAY_HEADERS.map((h) => (
              <span key={h} className="cal-weekday">
                {h}
              </span>
            ))}
            {calendarCells.map((cell, i) => {
              if (!cell) return <span key={`blank-${i}`} />;
              const freeCount = days.get(cell.dateStr) ?? 0;
              const isPast = cell.dateStr < today;
              const disabled = isPast || freeCount === 0;
              return (
                <button
                  key={cell.dateStr}
                  className={`cal-day ${selectedDate === cell.dateStr ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                  disabled={disabled}
                  onClick={() => setSelectedDate(cell.dateStr)}
                >
                  <span className={isPast ? "cal-day-past" : ""}>{cell.day}</span>
                  {!disabled && <span className={`cal-indicator ${levelClass(freeCount)}`} />}
                </button>
              );
            })}
          </div>

          {selectedDate && (
            <div className="slot-pills">
              {slots.length === 0 && <p className="muted">No quedan huecos ese día.</p>}
              {slots.map((slot) => (
                <button
                  key={slot.startMinute}
                  className={`slot-pill ${selectedSlot === slot.startMinute ? "selected" : ""}`}
                  onClick={() => setSelectedSlot(slot.startMinute)}
                >
                  {minutesToTimeLabel(slot.startMinute)}
                </button>
              ))}
            </div>
          )}

          <div className="public-footer">
            <div>
              <div className="muted">
                1 servicio · {service.durationMinutes} min
              </div>
              <div className="public-footer-price">{formatMoney(service.priceCents)}</div>
            </div>
            <button className="btn-primary" disabled={selectedSlot === null} onClick={() => setStep(3)}>
              Continuar
            </button>
          </div>
        </section>
      )}

      {step === 3 && service && selectedDate && selectedSlot !== null && (
        <section>
          <button className="btn-ghost" onClick={() => setStep(2)}>
            ‹ Fecha y hora
          </button>
          <h2 style={{ marginTop: "1rem" }}>Tus datos</h2>
          <div className="card-form">
            {error && <div className="alert-error">{error}</div>}
            <div className="notice">
              {service.name} · {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}{" "}
              a las {minutesToTimeLabel(selectedSlot)} · {formatMoney(service.priceCents)}
            </div>
            <label>
              Nombre
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
            </label>
            <label>
              Teléfono
              <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+34 600 000 000" required />
            </label>
            <button className="btn-primary" disabled={!clientName || !clientPhone || submitting} onClick={handleConfirm}>
              {submitting ? "Reservando..." : "Confirmar reserva"}
            </button>
            <p className="muted" style={{ fontSize: "0.78rem" }}>
              Tus datos serán tratados por {business.businessName} únicamente para gestionar tu cita y enviarte recordatorios.
            </p>
          </div>
        </section>
      )}

      {step === 4 && confirmation && service && (
        <section className="confirmation">
          <div className="confirmation-icon">✓</div>
          <h2 style={{ textTransform: "none", letterSpacing: 0, fontSize: "1.3rem", color: "var(--text)" }}>¡Cita confirmada!</h2>
          <p className="muted">
            {service.name} — {new Date(`${confirmation.date}T00:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}{" "}
            a las {confirmation.time}
          </p>
          <p className="muted">Te enviaremos un recordatorio antes de la cita. Si no puedes venir, avísanos cuanto antes.</p>
        </section>
      )}
    </div>
  );
}
