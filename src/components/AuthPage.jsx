import { useMemo, useState } from "react";
import { api } from "../api/client";

const initialRegister = {
  companyName: "",
  companySlug: "",
  logoUrl: "",
  fullName: "",
  email: "",
  password: ""
};

const initialLogin = {
  email: "",
  password: ""
};

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [registerForm, setRegisterForm] = useState(initialRegister);
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(
    () => (mode === "login" ? "Sign in to ISP Map CRM" : "Create ISP account"),
    [mode]
  );

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? loginForm
          : {
              ...registerForm,
              companySlug: registerForm.companySlug.trim().toLowerCase().replace(/\s+/g, "-"),
              logoUrl: registerForm.logoUrl.trim() || undefined
            };
      const { data } = await api.post(endpoint, payload);
      onAuth(data);
    } catch (err) {
      const apiError = err.response?.data?.error;
      if (typeof apiError === "string") {
        setError(apiError);
      } else if (apiError?.fieldErrors) {
        setError("Please check your inputs. Some fields are invalid.");
      } else {
        setError("Authentication failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <h1>{title}</h1>
        <p className="muted">Multi-tenant fibre planning and operations platform.</p>

        {mode === "register" && (
          <>
            <label>
              Company Name
              <input
                value={registerForm.companyName}
                onChange={(e) => setRegisterForm({ ...registerForm, companyName: e.target.value })}
                required
              />
            </label>
            <label>
              Company Slug
              <input
                value={registerForm.companySlug}
                onChange={(e) => setRegisterForm({ ...registerForm, companySlug: e.target.value })}
                placeholder="my-isp"
                required
              />
            </label>
            <label>
              Logo URL (optional)
              <input
                value={registerForm.logoUrl}
                onChange={(e) => setRegisterForm({ ...registerForm, logoUrl: e.target.value })}
              />
            </label>
            <label>
              Full Name
              <input
                value={registerForm.fullName}
                onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })}
                required
              />
            </label>
          </>
        )}

        <label>
          Email
          <input
            type="email"
            value={mode === "login" ? loginForm.email : registerForm.email}
            onChange={(e) =>
              mode === "login"
                ? setLoginForm({ ...loginForm, email: e.target.value })
                : setRegisterForm({ ...registerForm, email: e.target.value })
            }
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={mode === "login" ? loginForm.password : registerForm.password}
            onChange={(e) =>
              mode === "login"
                ? setLoginForm({ ...loginForm, password: e.target.value })
                : setRegisterForm({ ...registerForm, password: e.target.value })
            }
            required
          />
        </label>

        {error && <p className="error">{error}</p>}
        <button disabled={loading} type="submit">
          {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Need an account?" : "Already have an account?"}
        </button>
      </form>
    </div>
  );
}
