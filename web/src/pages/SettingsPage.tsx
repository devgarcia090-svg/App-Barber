import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type NotificationSettings } from "../api";
import { useAuth } from "../context/AuthContext";

export function SettingsPage() {
  const { logout } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteAccount() {
    if (!deletePassword) return;
    if (!window.confirm("Se borrará permanentemente tu negocio con todos sus barberos, clientes y citas. ¿Continuar?")) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAccount(deletePassword);
      logout();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar la cuenta");
    } finally {
      setDeleting(false);
    }
  }

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

        <h2>Cancelaciones de última hora</h2>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.sameDayCancelAlertEnabled}
            onChange={(e) => setSettings({ ...settings, sameDayCancelAlertEnabled: e.target.checked })}
          />
          Avisarme por notificación push si cancelan una cita de hoy
        </label>
        <p className="muted" style={{ fontSize: "0.8rem", marginTop: "-0.4rem" }}>
          Para recibirlo, activa las notificaciones en la app móvil (Ajustes → Avisos en tu móvil). Así puedes
          rellenar el hueco al momento.
        </p>

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

      <div className="danger-zone">
        <h2>Eliminar cuenta</h2>
        <p className="muted">
          Se borrará permanentemente tu negocio con todos sus barberos, clientes, citas y recordatorios. Esta acción no se puede
          deshacer.
        </p>
        {deleteError && <div className="alert-error">{deleteError}</div>}
        <div className="form-row">
          <input
            type="password"
            placeholder="Tu contraseña"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
          <button type="button" className="btn-danger" onClick={handleDeleteAccount} disabled={!deletePassword || deleting}>
            {deleting ? "Eliminando..." : "Eliminar cuenta"}
          </button>
        </div>
      </div>
    </div>
  );
}
