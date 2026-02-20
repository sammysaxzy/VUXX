import { api } from "../api/client.js";

export function fetchRadiusSessions(customerId) {
  const params = customerId ? { customerId } : {};
  return api.get("/api/radius", { params }).then((res) => res.data);
}

export function updateRadiusStatus(sessionId, status) {
  return api.patch(`/api/radius/${sessionId}/status`, { status }).then((res) => res.data);
}
