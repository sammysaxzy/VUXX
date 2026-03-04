import { useState } from "react";

export default function LoginScreen({ onLogin, loading, error }) {
  const [email, setEmail] = useState("admin@isp.local");
  const [password, setPassword] = useState("Admin123!");

  function handleSubmit(event) {
    event.preventDefault();
    onLogin({ email, password });
  }

  return (
    <main className="login-layout">
      <section className="login-intro">
        <p className="eyebrow">ISP Operations Platform</p>
        <h1>Unified Fibre Map + CRM Control</h1>
        <p>
          Single source of truth for field engineering, CRM, router-level visibility, fibre cores, MST capacity, and
          real-time audit logs.
        </p>
      </section>

      <section className="login-card">
        <h2>Sign In</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Open Platform"}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}

