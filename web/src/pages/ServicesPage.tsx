import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Service } from "../api";
import { formatMoney } from "../utils";

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState(15);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getServices().then((r) => setServices(r.services));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { service } = await api.createService({
        name,
        durationMinutes: duration,
        priceCents: Math.round(price * 100),
      });
      setServices((prev) => [...prev, service]);
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el servicio");
    }
  }

  async function toggleActive(service: Service) {
    const { service: updated } = await api.updateService(service.id, { active: !service.active });
    setServices((prev) => prev.map((s) => (s.id === service.id ? updated : s)));
  }

  return (
    <div>
      <h1>Servicios</h1>
      <p className="muted">Define tus servicios con el precio y la duración que ocupan en la agenda.</p>

      <form className="card-form inline-form" onSubmit={handleCreate}>
        {error && <div className="alert-error">{error}</div>}
        <div className="form-row">
          <label>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Duración (min)
            <input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} required />
          </label>
          <label>
            Precio (€)
            <input type="number" min={0} step={0.5} value={price} onChange={(e) => setPrice(Number(e.target.value))} required />
          </label>
        </div>
        <button type="submit" className="btn-primary">
          + Añadir servicio
        </button>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>Servicio</th>
            <th>Duración</th>
            <th>Precio</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.durationMinutes} min</td>
              <td>{formatMoney(s.priceCents)}</td>
              <td>{s.active ? "Activo" : "Inactivo"}</td>
              <td>
                <button className="btn-ghost" onClick={() => toggleActive(s)}>
                  {s.active ? "Desactivar" : "Activar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
