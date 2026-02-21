import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  fetchDashboardMetrics,
  fetchFiberRoutes,
  fetchLogs,
  fetchNodes,
  fetchCustomers,
  fetchRadiusSessions
} from "../services/api.js";

const NocContext = createContext(null);

export function NocProvider({ children }) {
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [fiberRoutes, setFiberRoutes] = useState([]);
  const [radiusSessions, setRadiusSessions] = useState([]);
  const [customers, setCustomers] = useState([]);

  const refreshMetrics = async () => {
    try {
      const payload = await fetchDashboardMetrics();
      setMetrics(payload);
    } catch (error) {
      console.error("Unable to load dashboard metrics", error);
    }
  };

  const refreshLogs = async () => {
    try {
      const payload = await fetchLogs();
      setLogs(payload);
    } catch (error) {
      console.error("Unable to load logs", error);
    }
  };

  const refreshNodes = async () => {
    try {
      const payload = await fetchNodes();
      setNodes(payload);
    } catch (error) {
      console.error("Unable to load nodes", error);
    }
  };

  const refreshFiber = async () => {
    try {
      const payload = await fetchFiberRoutes();
      setFiberRoutes(payload);
    } catch (error) {
      console.error("Unable to load fiber routes", error);
    }
  };

  const refreshRadiusSessions = async () => {
    try {
      const payload = await fetchRadiusSessions();
      setRadiusSessions(payload);
    } catch (error) {
      console.error("Unable to load radius sessions", error);
    }
  };

  const refreshCustomers = async () => {
    try {
      const payload = await fetchCustomers();
      setCustomers(payload);
    } catch (error) {
      console.error("Unable to load customers", error);
    }
  };

  useEffect(() => {
    refreshMetrics();
    refreshLogs();
    refreshNodes();
    refreshFiber();
    refreshRadiusSessions();
    refreshCustomers();
    const logInterval = setInterval(() => refreshLogs(), 10000);
    const metricsInterval = setInterval(() => refreshMetrics(), 25000);
    return () => {
      clearInterval(logInterval);
      clearInterval(metricsInterval);
    };
  }, []);

  const value = useMemo(
    () => ({
      metrics,
      logs,
      nodes,
      fiberRoutes,
      radiusSessions,
      customers,
      refreshMetrics,
      refreshLogs,
      refreshNodes,
      refreshFiber,
      refreshRadiusSessions,
      refreshCustomers
    }),
    [metrics, logs, nodes, fiberRoutes, radiusSessions, customers]
  );

  return <NocContext.Provider value={value}>{children}</NocContext.Provider>;
}

export function useNocState() {
  const context = useContext(NocContext);
  if (!context) {
    throw new Error("useNocState must be used within NocProvider");
  }
  return context;
}
