import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Staff, type WorkingHourRow } from "../api";
import { DAY_NAMES } from "../utils";

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

interface DaySchedule {
  open: boolean;
  start: string;
  end: string;
}

function scheduleFromWorkingHours(workingHours: WorkingHourRow[]): DaySchedule[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = workingHours.find((w) => w.dayOfWeek === dayOfWeek);
    return row
      ? { open: true, start: minutesToTime(row.startMinute), end: minutesToTime(row.endMinute) }
      : { open: false, start: "09:00", end: "20:00" };
  });
}

function WorkingHoursEditor({ staff, onSaved }: { staff: Staff; onSaved: (staff: Staff) => void }) {
  const [schedule, setSchedule] = useState<DaySchedule[]>(() => scheduleFromWorkingHours(staff.workingHours));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDay(index: number, patch: Partial<DaySchedule>) {
    setSchedule((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const rows = schedule
        .map((day, dayOfWeek) => ({ day, dayOfWeek }))
        .filter(({ day }) => day.open)
        .map(({ day, dayOfWeek }) => ({
          dayOfWeek,
          startMinute: timeToMinutes(day.start),
          endMinute: timeToMinutes(day.end),
        }));
      await api.setWorkingHours(staff.id, rows);
      onSaved({ ...staff, workingHours: rows });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el horario");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="working-hours">
      {error && <div className="alert-error">{error}</div>}
      {schedule.map((day, i) => (
        <div key={i} className="working-hours-row">
          <label className="checkbox-label">
            <input type="checkbox" checked={day.open} onChange={(e) => updateDay(i, { open: e.target.checked })} />
            {DAY_NAMES[i]}
          </label>
          {day.open && (
            <>
              <input type="time" value={day.start} onChange={(e) => updateDay(i, { start: e.target.value })} />
              <span>-</span>
              <input type="time" value={day.end} onChange={(e) => updateDay(i, { end: e.target.value })} />
            </>
          )}
        </div>
      ))}
      <button className="btn-small" onClick={save} disabled={saving}>
        {saving ? "Guardando..." : "Guardar horario"}
      </button>
    </div>
  );
}

export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api.getStaff().then((r) => setStaff(r.staff));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { staff: created } = await api.createStaff({ name, phone: phone || undefined, color });
      setStaff((prev) => [...prev, { ...created, workingHours: [] }]);
      setName("");
      setPhone("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el barbero");
    }
  }

  async function toggleActive(s: Staff) {
    const { staff: updated } = await api.updateStaff(s.id, { active: !s.active });
    setStaff((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...updated } : x)));
  }

  return (
    <div>
      <h1>Barberos</h1>
      <p className="muted">Cada barbero tiene su propia agenda y horario. El horario controla en qué franjas se pueden reservar citas.</p>

      <form className="card-form inline-form" onSubmit={handleCreate}>
        {error && <div className="alert-error">{error}</div>}
        <div className="form-row">
          <label>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Teléfono (opcional)
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label>
            Color
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
        </div>
        <button type="submit" className="btn-primary">
          + Añadir barbero
        </button>
      </form>

      <div className="staff-list">
        {staff.map((s) => (
          <div key={s.id} className="staff-card">
            <div className="staff-card-header">
              <span className="dot" style={{ background: s.color }} />
              <strong>{s.name}</strong>
              {!s.active && <span className="muted">(inactivo)</span>}
              <button className="btn-ghost" onClick={() => toggleActive(s)}>
                {s.active ? "Desactivar" : "Activar"}
              </button>
              <button className="btn-ghost" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                {expandedId === s.id ? "Ocultar horario" : "Editar horario"}
              </button>
            </div>
            {expandedId === s.id && (
              <WorkingHoursEditor staff={s} onSaved={(updated) => setStaff((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...updated } : x)))} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
