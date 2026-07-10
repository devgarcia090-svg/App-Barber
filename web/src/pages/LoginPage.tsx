import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-logo">✂</div>
        <h1 className="auth-title">OFICINA DEL BARBERO</h1>
        <div className="auth-divider" />
        <p className="auth-sub">Llano de Brujas · Murcia</p>
      </div>
      <form className="auth-card" onSubmit={handleSubmit}>
        {error && <div className="alert-error">{error}</div>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>
        <p className="muted">
          ¿No tienes cuenta? <Link to="/registro">Regístrate</Link>
        </p>
      </form>
    </div>
  );
}
