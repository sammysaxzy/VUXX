import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setAuthToken } from "../services/api.js";

const AuthContext = createContext(null);

const STORAGE_TOKEN = "fibernoc_token";
const STORAGE_USER = "fibernoc_user";

function parseStoredUser(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN));
  const [user, setUser] = useState(() => parseStoredUser(localStorage.getItem(STORAGE_USER)));

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  const persistCredentials = useCallback((tokenValue, userValue, remember) => {
    if (remember) {
      localStorage.setItem(STORAGE_TOKEN, tokenValue);
      localStorage.setItem(STORAGE_USER, JSON.stringify(userValue));
      return;
    }
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
  }, []);

  const login = useCallback(
    ({ token: newToken, user: newUser, remember = true }) => {
      setToken(newToken);
      setUser(newUser);
      persistCredentials(newToken, newUser, remember);
    },
    [persistCredentials]
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      login,
      logout
    }),
    [token, user, login, logout]
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
