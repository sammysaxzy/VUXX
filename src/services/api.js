import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000
});

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export async function fetchDashboardMetrics() {
  const response = await api.get("/api/dashboard/metrics");
  return response.data;
}

export async function fetchCustomers() {
  const response = await api.get("/api/customers");
  return response.data;
}

export async function createCustomer(payload) {
  const response = await api.post("/api/customers", payload);
  return response.data;
}

export async function updateCustomer(id, payload) {
  const response = await api.patch(`/api/customers/${id}`, payload);
  return response.data;
}

export async function fetchRadiusSessions() {
  const response = await api.get("/api/radius");
  return response.data;
}

export async function updateRadiusStatus(id, status) {
  const response = await api.patch(`/api/radius/${id}/status`, { status });
  return response.data;
}

export async function fetchNodes() {
  const response = await api.get("/api/map/nodes");
  return response.data;
}

export async function createNode(payload) {
  const response = await api.post("/api/map/nodes", payload);
  return response.data;
}

export async function fetchFiberRoutes() {
  const response = await api.get("/api/map/fiber-routes");
  return response.data;
}

export async function createFiberRoute(payload) {
  const response = await api.post("/api/map/fiber-routes", payload);
  return response.data;
}

export async function fetchTickets() {
  const response = await api.get("/api/tickets");
  return response.data;
}

export async function createTicket(payload) {
  const response = await api.post("/api/tickets", payload);
  return response.data;
}

export async function updateTicket(id, payload) {
  const response = await api.patch(`/api/tickets/${id}`, payload);
  return response.data;
}

export async function fetchLogs() {
  const response = await api.get("/api/logs");
  return response.data;
}
