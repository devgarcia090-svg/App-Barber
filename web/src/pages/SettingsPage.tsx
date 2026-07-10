import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type NotificationSettings } from "../api";

export function SettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const { settings: updated } = await api.updateSettings(settings);
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <p className="muted">Cargando...</p>;

  return (
    <div className="page-narrow">
      <h1>Ajustes</h1>
      <form className="card-form" onSubmit={handleSubmit}>
        {error && <div className="alert-error">{error}</div>}
        {saved && <div className="notice">Guardado.</div>}

        <h2>Recordatorios al cliente</h2>
        <label>
          Horas antes de la cita (separadas por comas)
          <input
            value={settings.reminderHoursBefore}
            onChange={(e) => setSettings({ ...settings, reminderHoursBefore: e.target.value })}
            placeholder="24,2"
          />
        </label>
        <div className="form-row">
          <label className="checkbox-label">
            <input type="checkbox" checked={settings.emailEnabled} onChange={(e) => setSettings({ ...settings, emailEnabled: e.target.checked })} />
            Email
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.whatsappEnabled}
              onChange={(e) => setSettings({ ...settings, whatsappEnabled: e.target.checked })}
            />
            WhatsApp
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={settings.smsEnabled} onChange={(e) => setSettings({ ...settings, smsEnabled: e.target.checked })} />
            SMS
          </label>
        </div>

        <h2>Clientes que fallan citas</h2>
        <div className="form-row">
          <label>
            Cancelación tardía si faltan menos de (horas)
            <input
              type="number"
              min={1}
              value={settings.lateCancelThresholdHours}
              onChange={(e) => setSettings({ ...settings, lateCancelThresholdHours: Number(e.target.value) })}
            />
          </label>
          <label>
            Incidencias para marcar "Vigilar"
            <input
              type="number"
              min={1}
              value={settings.watchThreshold}
              onChange={(e) => setSettings({ ...settings, watchThreshold: Number(e.target.value) })}
            />
          </label>
          <label>
            Incidencias para marcar "Riesgo"
            <input
              type="number"
              min={1}
              value={settings.riskyThreshold}
              onChange={(e) => setSettings({ ...settings, riskyThreshold: Number(e.target.value) })}
            />
          </label>
        </div>

        <h2>Aviso al barbero sobre clientes con historial de faltas</h2>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.barberPrewarningEnabled}
            onChange={(e) => setSettings({ ...settings, barberPrewarningEnabled: e.target.checked })}
          />
          Avisarme antes de la cita
        </label>
        <label>
          Horas antes de la cita (separadas por comas, ej. "24,1" = un día antes y una hora antes)
          <input
            value={settings.barberPrewarningHoursBefore}
            onChange={(e) => setSettings({ ...settings, barberPrewarningHoursBefore: e.target.value })}
            placeholder="24,1"
          />
        </label>

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
