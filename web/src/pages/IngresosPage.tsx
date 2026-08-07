import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type Invoice, type OwnerStats } from "../api";

function euros(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Presets de rango: este mes, mes pasado, este año.
function monthRange(offset = 0): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: isoDate(first), to: isoDate(last) };
}

function formatDay(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export function IngresosPage() {
  const [range, setRange] = useState(monthRange(0));
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.getStats(range.from, range.to), api.getInvoices(range.from, range.to)])
      .then(([s, inv]) => {
        if (cancelled) return;
        setStats(s);
        setInvoices(inv);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "No se pudieron cargar los datos"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const maxDay = useMemo(() => Math.max(1, ...(stats?.byDay ?? []).map((d) => d.revenueCents)), [stats]);

  function exportCsv() {
    const header = ["Fecha", "Cliente", "Teléfono", "Servicio", "Barbero", "Importe (€)"];
    const rows = invoices.map((i) => [
      new Date(i.date).toLocaleString("es-ES"),
      i.clientName,
      i.clientPhone,
      i.serviceName,
      i.staffName,
      (i.priceCents / 100).toFixed(2).replace(".", ","),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturacion_${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Facturación y estadísticas</h1>
        <button className="btn-ghost" onClick={exportCsv} disabled={invoices.length === 0}>
          Exportar CSV
        </button>
      </div>

      <div className="range-bar">
        <div className="range-presets">
          <button className="btn-small" onClick={() => setRange(monthRange(0))}>
            Este mes
          </button>
          <button className="btn-small" onClick={() => setRange(monthRange(-1))}>
            Mes pasado
          </button>
          <button
            className="btn-small"
            onClick={() => setRange({ from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` })}
          >
            Este año
          </button>
        </div>
        <div className="range-inputs">
          <label>
            Desde
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </label>
          <label>
            Hasta
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </label>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {loading && <p className="muted">Cargando...</p>}

      {stats && !loading && (
        <>
          <div className="kpi-grid">
            <div className="kpi kpi-strong">
              <span className="kpi-label">Ingresos</span>
              <span className="kpi-value">{euros(stats.totals.revenueCents)}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Citas completadas</span>
              <span className="kpi-value">{stats.totals.completed}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Ticket medio</span>
              <span className="kpi-value">
                {euros(stats.totals.completed ? Math.round(stats.totals.revenueCents / stats.totals.completed) : 0)}
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Ausencias (no-show)</span>
              <span className="kpi-value">
                {stats.totals.noShow}
                {stats.totals.total > 0 && (
                  <small> · {Math.round((stats.totals.noShow / stats.totals.total) * 100)}%</small>
                )}
              </span>
            </div>
          </div>

          <section className="panel">
            <h2>Ingresos por día</h2>
            {stats.byDay.length === 0 ? (
              <p className="muted">Sin ingresos en este periodo.</p>
            ) : (
              <div className="bar-chart">
                {stats.byDay.map((d) => (
                  <div className="bar-col" key={d.date} title={`${formatDay(d.date)}: ${euros(d.revenueCents)}`}>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ height: `${(d.revenueCents / maxDay) * 100}%` }} />
                    </div>
                    <span className="bar-label">{formatDay(d.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="two-col">
            <section className="panel">
              <h2>Servicios más pedidos</h2>
              {stats.topServices.length === 0 ? (
                <p className="muted">Sin datos.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Servicio</th>
                      <th>Citas</th>
                      <th>Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topServices.map((s) => (
                      <tr key={s.serviceId}>
                        <td>{s.name}</td>
                        <td>{s.completed}</td>
                        <td>{euros(s.revenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="panel">
              <h2>Ingresos por barbero</h2>
              {stats.byStaff.length === 0 ? (
                <p className="muted">Sin datos.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Barbero</th>
                      <th>Citas</th>
                      <th>Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byStaff.map((s) => (
                      <tr key={s.staffId}>
                        <td>
                          <span className="dot" style={{ background: s.color }} /> {s.name}
                        </td>
                        <td>{s.completed}</td>
                        <td>{euros(s.revenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="panel">
            <h2>Facturas ({invoices.length})</h2>
            {invoices.length === 0 ? (
              <p className="muted">No hay citas completadas en este periodo.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Servicio</th>
                    <th>Barbero</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td>{new Date(i.date).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" })}</td>
                      <td>{i.clientName}</td>
                      <td>{i.serviceName}</td>
                      <td>{i.staffName}</td>
                      <td>{euros(i.priceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
