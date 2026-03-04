import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginToPlatform } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";

const emailIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6h18v12H3z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 6l9 6 9-6" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const lockIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 11V7a4 4 0 1 1 8 0v4" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "", remember: true });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const destination = location.state?.from?.pathname || "/dashboard";

  useEffect(() => {
    if (user) {
      navigate(destination, { replace: true });
    }
  }, [user, navigate, destination]);

  const handleChange = (field) => (event) => {
    const value = field === "remember" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    const fieldErrors = {};
    if (!form.email.trim()) {
      fieldErrors.email = "Email or username is required";
    }
    if (!form.password) {
      fieldErrors.password = "Password is required";
    }
    setErrors(fieldErrors);
    return Object.keys(fieldErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setServerError("");
    if (!validate()) {
      return;
    }
    setLoading(true);
    try {
      const payload = await loginToPlatform({
        email: form.email.trim(),
        password: form.password
      });
      login({ token: payload.token, user: payload.user, remember: form.remember });
      navigate(destination, { replace: true });
    } catch (error) {
      if (error.response?.status === 401) {
        setServerError("Invalid credentials. Please verify your email and password.");
      } else {
        setServerError("Unable to reach the platform. Try again in a moment.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    setServerError("");
    login({
      token: "demo-token",
      user: {
        id: "demo-user",
        email: "demo@local",
        role: "admin"
      },
      remember: form.remember
    });
    navigate(destination, { replace: true });
  };

  return (
    <div className="login-page">
      <section className="login-panel login-panel--brand">
        <div className="login-logo">FIBRE NOC</div>
        <h1>Unified Fiber Operations Platform</h1>
        <p className="login-subtitle">SECURE ACCESS PORTAL</p>
        <p className="login-description">
          Internal operational control for engineers, tier-1 analysts, and network reliability staff.
        </p>
        <div className="login-footer-text">
          <span>NETWORK INTEGRITY: ACTIVE</span>
          <span>TIER 1 SECURITY PROTOCOL</span>
        </div>
      </section>

      <section className="login-panel login-panel--form">
        <div className="login-card">
          <p className="login-card__eyebrow">Secure Sign In</p>
          <p className="login-card__lead">Access FibreOS Control Panel</p>
          <form onSubmit={handleSubmit} className="login-form">
            {serverError && (
              <p className="form-error" role="alert">
                {serverError}
              </p>
            )}

            <label className={`field ${errors.email ? "field--error" : ""}`}>
              <span className="field__label">Email / Username</span>
              <div className="field__input-wrapper">
                <span className="field__icon">{emailIcon}</span>
                <input
                  type="text"
                  name="email"
                  value={form.email}
                  onChange={handleChange("email")}
                  placeholder="operator@fibernoc.local"
                  autoComplete="username"
                />
              </div>
              {errors.email && <span className="field__error">{errors.email}</span>}
            </label>

            <label className={`field ${errors.password ? "field--error" : ""}`}>
              <span className="field__label">Password</span>
              <div className="field__input-wrapper">
                <span className="field__icon">{lockIcon}</span>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange("password")}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              {errors.password && <span className="field__error">{errors.password}</span>}
            </label>

            <div className="login-helpers">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={handleChange("remember")}
                />
                <span>Remember session</span>
              </label>
              <a href="#" onClick={(event) => event.preventDefault()}>
                Forgot password?
              </a>
            </div>

            <button type="submit" className="primary-btn login-btn" disabled={loading}>
              <span className="login-btn__text">
                {loading ? "Signing in..." : "SIGN IN TO PLATFORM"}
              </span>
              {loading && <span className="login-spinner" aria-hidden="true"></span>}
            </button>

            <button type="button" className="login-demo-btn" onClick={handleDemoLogin} disabled={loading}>
              USE DEMO LOGIN (NO BACKEND)
            </button>
          </form>
        </div>
        <div className="login-meta">
          <span>Internal System Use Only</span>
          <span>v1.0.0-PROD</span>
          <span>Security Policy</span>
        </div>
      </section>
    </div>
  );
}
