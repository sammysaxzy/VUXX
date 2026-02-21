import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setAuthToken } from "../services/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("authToken"));
  const [user, setUser] = useState(() => {
    const serialized = localStorage.getItem("authUser");
    if (!serialized) return null;
    try {
      return JSON.parse(serialized);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    setAuthToken(token);
    if (token) {
      localStorage.setItem("authToken", token);
    } else {
      localStorage.removeItem("authToken");
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("authUser", JSON.stringify(user));
    } else {
      localStorage.removeItem("authUser");
    }
  }, [user]);

  const value = useMemo(
    () => ({
      token,
      user,
      login(payload) {
        setToken(payload?.token ?? null);
        setUser(payload?.user ?? null);
      },
      logout() {
        setToken(null);
        setUser(null);
      }
    }),
    [token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
