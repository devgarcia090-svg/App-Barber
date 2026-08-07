import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { api, ApiError, type LoyaltyOverview } from "../api";
import { useAuth } from "../context/AuthContext";

export function FidelizacionPage() {
  const { barber, refresh } = useAuth();
  const [loyalty, setLoyalty] = useState<LoyaltyOverview | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Perfil / fidelización (formulario)
  const [form, setForm] = useState({
    businessName: barber?.businessName ?? "",
    phone: barber?.phone ?? "",
    address: barber?.address ?? "",
    instagram: barber?.instagram ?? "",
    bio: barber?.bio ?? "",
    loyaltyEnabled: barber?.loyaltyEnabled ?? true,
    loyaltyThreshold: barber?.loyaltyThreshold ?? 10,
    loyaltyReward: barber?.loyaltyReward ?? "Un servicio gratis",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const bookingUrl = barber ? `${window.location.origin}/reserva/${barber.slug}` : "";

  useEffect(() => {
    api.getLoyalty().then(setLoyalty).catch((e) => setError(e instanceof ApiError ? e.message : "Error"));
  }, []);

  useEffect(() => {
    if (!bookingUrl) return;
    QRCode.toDataURL(bookingUrl, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [bookingUrl]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.updateProfile({
        businessName: form.businessName,
        phone: form.phone || null,
        address: form.address || null,
        instagram: form.instagram || null,
        bio: form.bio || null,
        loyaltyEnabled: form.loyaltyEnabled,
        loyaltyThreshold: Number(form.loyaltyThreshold) || 1,
        loyaltyReward: form.loyaltyReward,
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  function downloadQr() {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = `qr-reservas-${barber?.slug}.png`;
    a.click();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Fidelización y perfil</h1>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="two-col">
        <section className="panel">
          <h2>Tu código QR de reservas</h2>
          <p className="muted">Imprímelo en el local o compártelo: al escanearlo, el cliente entra directo a reservar.</p>
          {qr && (
            <div className="qr-box">
              <img src={qr} alt="Código QR de reservas" width={240} height={240} />
              <code className="qr-url">{bookingUrl}</code>
              <div className="qr-actions">
                <button className="btn-small" onClick={downloadQr}>
                  Descargar PNG
                </button>
                <button className="btn-small" onClick={() => navigator.clipboard?.writeText(bookingUrl)}>
                  Copiar enlace
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Perfil público</h2>
          <form className="card-form" onSubmit={handleSave}>
            {saved && <div className="notice">Guardado.</div>}
            <label>
              Nombre del negocio
              <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            </label>
            <label>
              Teléfono
              <input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>
              Dirección
              <input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Llano de Brujas, Murcia" />
            </label>
            <label>
              Instagram
              <input value={form.instagram ?? ""} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@oficinadelbarbero" />
            </label>
            <label>
              Descripción
              <textarea rows={3} value={form.bio ?? ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Cuéntale a tus clientes qué te hace especial." />
            </label>

            <h2>Tarjeta de fidelización</h2>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.loyaltyEnabled} onChange={(e) => setForm({ ...form, loyaltyEnabled: e.target.checked })} />
              Activar tarjeta de puntos
            </label>
            <div className="form-row">
              <label>
                Visitas para premio
                <input type="number" min={1} value={form.loyaltyThreshold} onChange={(e) => setForm({ ...form, loyaltyThreshold: Number(e.target.value) })} />
              </label>
              <label>
                Premio
                <input value={form.loyaltyReward} onChange={(e) => setForm({ ...form, loyaltyReward: e.target.value })} />
              </label>
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>
        </section>
      </div>

      <section className="panel">
        <h2>Clientes fieles</h2>
        <p className="muted">
          Premio cada {loyalty?.threshold ?? form.loyaltyThreshold} visitas completadas: <b>{form.loyaltyReward}</b>.
        </p>
        {!loyalty ? (
          <p className="muted">Cargando...</p>
        ) : loyalty.clients.length === 0 ? (
          <p className="muted">Todavía no hay visitas completadas.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Visitas</th>
                <th>Progreso</th>
                <th>Premios ganados</th>
              </tr>
            </thead>
            <tbody>
              {loyalty.clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.completedCount}</td>
                  <td>
                    <div className="loyalty-bar" title={`${c.progress}/${loyalty.threshold}`}>
                      <div className="loyalty-fill" style={{ width: `${(c.progress / loyalty.threshold) * 100}%` }} />
                    </div>
                    <small className="muted">
                      {c.progress}/{loyalty.threshold} · faltan {c.toNext}
                    </small>
                  </td>
                  <td>{c.rewardsEarned > 0 ? <span className="badge badge-reliable">🎁 {c.rewardsEarned}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
