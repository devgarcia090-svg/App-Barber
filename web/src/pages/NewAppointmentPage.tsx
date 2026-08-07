import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type Appointment, type Client, type Service, type Staff } from "../api";
import { PrewarningBanner } from "../components/PrewarningBanner";
import { formatMoney, generateDaySlots, todayStr, type Slot } from "../utils";

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "");
}

export function NewAppointmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dayAppointments, setDayAppointments] = useState<Appointment[]>([]);

  const [staffId, setStaffId] = useState(searchParams.get("staffId") ?? "");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(searchParams.get("fecha") ?? todayStr());
  const minParam = searchParams.get("min");
  const [selectedSlot, setSelectedSlot] = useState<number | null>(minParam ? Number(minParam) : null);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    api.getStaff().then((r) => {
      const active = r.staff.filter((s) => s.active);
      setStaff(active);
      if (!staffId && active[0]) setStaffId(active[0].id);
    });
    api.getServices().then((r) => {
      const active = r.services.filter((s) => s.active);
      setServices(active);
      if (active[0]) setServiceId((prev) => prev || active[0].id);
    });
    api.getClients().then((r) => setClients(r.clients));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedStaff = staff.find((s) => s.id === staffId);
  const selectedService = services.find((s) => s.id === serviceId);

  const skipReset = useRef(true);
  useEffect(() => {
    if (!staffId || !date) return;
    setLoadingSlots(true);
    // No borrar la hora preseleccionada (venida por URL) en la primera carga.
    if (skipReset.current) skipReset.current = false;
    else setSelectedSlot(null);
    const from = new Date(`${date}T00:00:00`).toISOString();
    const to = new Date(`${date}T23:59:59`).toISOString();
    api
      .getAppointments({ staffId, from, to })
      .then((r) => setDayAppointments(r.appointments.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW")))
      .finally(() => setLoadingSlots(false));
  }, [staffId, date]);

  const slots: Slot[] = useMemo(() => {
    if (!selectedStaff || !selectedService) return [];
    return generateDaySlots(
      date,
      selectedService.durationMinutes,
      selectedStaff.workingHours,
      dayAppointments.map((a) => ({ startTime: a.startTime, endTime: a.endTime, clientName: a.client.name }))
    );
  }, [date, selectedStaff, selectedService, dayAppointments]);

  const matchedClient = useMemo(() => {
    const phone = normalizePhone(clientPhone);
    if (phone.length < 6) return null;
    return clients.find((c) => normalizePhone(c.phone) === phone) ?? null;
  }, [clientPhone, clients]);

  useEffect(() => {
    if (matchedClient) setClientName(matchedClient.name);
  }, [matchedClient]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!staffId || !serviceId || selectedSlot === null) {
      setError("Selecciona barbero, servicio y un hueco disponible");
      return;
    }
    setSubmitting(true);
    try {
      let clientId = matchedClient?.id;
      if (!clientId) {
        const { client } = await api.createClient({
          name: clientName,
          phone: clientPhone,
          email: clientEmail || undefined,
        });
        clientId = client.id;
      }

      const startTime = new Date(`${date}T00:00:00`);
      startTime.setMinutes(selectedSlot);
      await api.createAppointment({ staffId, clientId, serviceId, startTime: startTime.toISOString(), notes: notes || undefined });
      navigate(`/?fecha=${date}&staffId=${staffId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la cita");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-narrow">
      <h1>Nueva cita</h1>
      <p className="muted">Ideal para reservar por teléfono: elige un hueco libre y solo hace falta el nombre y el número del cliente.</p>
      <form className="card-form" onSubmit={handleSubmit}>
        {error && <div className="alert-error">{error}</div>}

        <div className="form-row">
          <label>
            Barbero
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} required>
              <option value="" disabled>
                Selecciona un barbero
              </option>
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
              <option value="" disabled>
                Selecciona un servicio
              </option>
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
          <input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <div>
          <span className="slot-grid-label">Huecos disponibles</span>
          {loadingSlots && <p className="muted">Cargando huecos...</p>}
          {!loadingSlots && slots.length === 0 && <p className="muted">Ese barbero no trabaja ese día.</p>}
          <div className="slot-grid">
            {slots.map((slot) => (
              <button
                key={slot.startMinute}
                type="button"
                className={`slot ${slot.available ? "slot-available" : "slot-busy"} ${selectedSlot === slot.startMinute ? "slot-selected" : ""}`}
                disabled={!slot.available}
                title={slot.available ? "Libre" : slot.past ? "Ya ha pasado" : `Ocupado: ${slot.busyClientName}`}
                onClick={() => setSelectedSlot(slot.startMinute)}
              >
                {slot.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <label>
            Teléfono del cliente
            <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+34 600 000 000" required />
          </label>
          <label>
            Nombre del cliente
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
          </label>
        </div>
        <label>
          Email del cliente (opcional)
          <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
        </label>

        {matchedClient && (
          <div className="notice">
            Cliente existente encontrado: <strong>{matchedClient.name}</strong>
            <PrewarningBanner prewarning={matchedClient.prewarning} />
          </div>
        )}

        <label>
          Notas (opcional)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>

        <button type="submit" className="btn-primary" disabled={submitting || selectedSlot === null}>
          {submitting ? "Guardando..." : selectedSlot === null ? "Elige un hueco" : "Crear cita"}
        </button>
      </form>
    </div>
  );
}
