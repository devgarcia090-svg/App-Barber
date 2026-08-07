import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Appointment, type Service, type Staff } from "../api";
import { dayBounds, formatMoney, generateDaySlots, minutesToTimeLabel, zonedDateParts, zonedWallTimeToDate, type Slot } from "../utils";

export function EditAppointmentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [appt, setAppt] = useState<Appointment | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [dayAppointments, setDayAppointments] = useState<Appointment[]>([]);

  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getAppointment(id), api.getStaff(), api.getServices()])
      .then(([a, s, sv]) => {
        const ap = a.appointment;
        setAppt(ap);
        setStaff(s.staff.filter((x) => x.active));
        setServices(sv.services.filter((x) => x.active));
        setStaffId(ap.staff?.id ?? "");
        setServiceId(ap.service.id);
        const parts = zonedDateParts(ap.startTime);
        setDate(parts.dateStr);
        setSelectedSlot(parts.minutes);
        setNotes(ap.notes ?? "");
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar la cita"))
      .finally(() => setLoading(false));
  }, [id]);

  const selectedStaff = staff.find((s) => s.id === staffId);
  const selectedService = services.find((s) => s.id === serviceId);

  useEffect(() => {
    if (!staffId || !date) return;
    setSelectedSlot((prev) => prev); // keep current selection across staff/date changes
    const { from, to } = dayBounds(date);
    api
      .getAppointments({ staffId, from, to })
      .then((r) =>
        // Excluir la propia cita: su hueco actual debe salir como libre/seleccionable.
        setDayAppointments(r.appointments.filter((a) => a.id !== id && a.status !== "CANCELLED" && a.status !== "NO_SHOW"))
      )
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar los huecos ocupados"));
  }, [staffId, date, id]);

  const slots: Slot[] = useMemo(() => {
    if (!selectedStaff || !selectedService) return [];
    return generateDaySlots(
      date,
      selectedService.durationMinutes,
      selectedStaff.workingHours,
      dayAppointments.map((a) => ({ startTime: a.startTime, endTime: a.endTime, clientName: a.client.name }))
    );
  }, [date, selectedStaff, selectedService, dayAppointments]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id || !staffId || !serviceId || selectedSlot === null) {
      setError("Selecciona barbero, servicio y un hueco");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const startTime = zonedWallTimeToDate(date, selectedSlot);
      await api.rescheduleAppointment(id, { staffId, serviceId, startTime: startTime.toISOString(), notes: notes || undefined });
      navigate(`/?fecha=${date}&staffId=${staffId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la cita");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Cargando...</p>;
  if (!appt) return <p className="alert-error">{error ?? "Cita no encontrada"}</p>;

  return (
    <div className="page-narrow">
      <button className="btn-ghost" onClick={() => navigate(-1)}>
        ‹ Volver
      </button>
      <h1 style={{ marginTop: "1rem" }}>Editar cita</h1>
      <p className="muted">
        Cliente: <strong style={{ color: "var(--text)" }}>{appt.client.name}</strong> · {appt.client.phone}
      </p>

      <form className="card-form" onSubmit={handleSubmit}>
        {error && <div className="alert-error">{error}</div>}

        <div className="form-row">
          <label>
            Barbero
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} required>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Servicio
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {formatMoney(s.priceCents)} · {s.durationMinutes} min
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <div>
          <span className="slot-grid-label">Elige el nuevo hueco</span>
          {slots.length === 0 && <p className="muted">Ese barbero no trabaja ese día.</p>}
          <div className="slot-grid">
            {slots.map((slot) => (
              <button
                key={slot.startMinute}
                type="button"
                className={`slot ${slot.available ? "slot-available" : "slot-busy"} ${selectedSlot === slot.startMinute ? "slot-selected" : ""}`}
                disabled={!slot.available && selectedSlot !== slot.startMinute}
                title={slot.available ? "Libre" : slot.past ? "Ya ha pasado" : `Ocupado: ${slot.busyClientName}`}
                onClick={() => setSelectedSlot(slot.startMinute)}
              >
                {slot.label}
              </button>
            ))}
          </div>
        </div>

        <label>
          Notas (opcional)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>

        <button type="submit" className="btn-primary" disabled={saving || selectedSlot === null}>
          {saving ? "Guardando..." : `Guardar cambios${selectedSlot !== null ? ` · ${minutesToTimeLabel(selectedSlot)}` : ""}`}
        </button>
      </form>
    </div>
  );
}
