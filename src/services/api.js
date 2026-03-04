import axios from "axios";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

export const WS_BASE = API_BASE.replace(/^http/i, "ws");

const http = axios.create({
  baseURL: API_BASE,
  timeout: 15000
});

export function setAuthToken(token) {
  if (token) {
    http.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }
  delete http.defaults.headers.common.Authorization;
}

function unwrapError(error, fallback) {
  const detail = error?.response?.data?.detail;
  const message = error?.response?.data?.message;
  if (typeof detail === "string" && detail.trim()) return new Error(detail);
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    if (typeof first === "string") return new Error(first);
    if (first?.msg) return new Error(first.msg);
    return new Error(JSON.stringify(first));
  }
  if (detail && typeof detail === "object") {
    if (detail.msg) return new Error(detail.msg);
    return new Error(JSON.stringify(detail));
  }
  if (typeof message === "string" && message.trim()) return new Error(message);
  if (typeof error?.message === "string" && error.message.trim()) return new Error(error.message);
  return new Error(fallback);
}

export async function login(payload) {
  try {
    const response = await http.post("/api/auth/login", payload);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Login failed");
  }
}

export async function fetchBootstrap() {
  try {
    const response = await http.get("/api/bootstrap");
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to load platform data");
  }
}

export async function createAsset(payload) {
  try {
    const response = await http.post("/api/map/assets", payload);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to create asset");
  }
}

export async function updateAssetPosition(assetId, payload) {
  try {
    const response = await http.patch(`/api/map/assets/${assetId}/position`, payload);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to move asset");
  }
}

export async function createCable(payload) {
  try {
    const response = await http.post("/api/map/cables", payload);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to create fibre cable");
  }
}

export async function fetchCableCores(cableId) {
  try {
    const response = await http.get(`/api/map/cables/${cableId}/cores`);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to fetch cable cores");
  }
}

export async function fetchCableUsage(cableId) {
  try {
    const response = await http.get(`/api/map/cables/${cableId}/usage`);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to fetch cable usage");
  }
}

export async function updateCoreStatus(coreId, payload) {
  try {
    const response = await http.patch(`/api/map/cores/${coreId}`, payload);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to update core status");
  }
}

export async function createSplice(payload) {
  try {
    const response = await http.post("/api/map/splices", payload);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to create splice record");
  }
}

export async function fetchMstCapacity(mstId) {
  try {
    const response = await http.get(`/api/map/mst/${mstId}/capacity`);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to fetch MST capacity");
  }
}

export async function fetchOltPorts(oltAssetId) {
  try {
    const response = await http.get(`/api/map/olt/${oltAssetId}/ports`);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to fetch OLT ports");
  }
}

export async function assignOltPort(oltAssetId, portNumber, payload) {
  try {
    const response = await http.post(`/api/map/olt/${oltAssetId}/ports/${portNumber}/assign`, payload);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to assign OLT port");
  }
}

export async function fetchAssetColorFlow(assetId) {
  try {
    const response = await http.get(`/api/map/assets/${assetId}/color-flow`);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to fetch color flow");
  }
}

export async function fetchMapObjectLink(assetId) {
  try {
    const response = await http.get(`/api/map/object/${assetId}/link`);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to fetch map object details");
  }
}

export async function createClient(payload) {
  try {
    const response = await http.post("/api/crm/clients", payload);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to create client");
  }
}

export async function activateClient(clientId, mstAssetId = null, splitterPortNumber = null) {
  try {
    const response = await http.post(`/api/crm/clients/${clientId}/activate`, {
      mst_asset_id: mstAssetId,
      splitter_port_number: splitterPortNumber
    });
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to activate client");
  }
}

export async function suspendClient(clientId) {
  try {
    const response = await http.post(`/api/crm/clients/${clientId}/suspend`);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to suspend client");
  }
}

export async function deleteClient(clientId) {
  try {
    const response = await http.delete(`/api/crm/clients/${clientId}`);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to delete client");
  }
}

export async function fetchClientMapPath(clientId) {
  try {
    const response = await http.get(`/api/crm/clients/${clientId}/map-path`);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to fetch client map path");
  }
}

export async function updateMonitoring(clientId, payload) {
  try {
    const response = await http.post(`/api/monitoring/clients/${clientId}`, payload);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to update monitoring");
  }
}

export async function fetchActivityLogs() {
  try {
    const response = await http.get("/api/activity/logs?limit=150");
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to fetch activity logs");
  }
}

export async function fetchSplices() {
  try {
    const response = await http.get("/api/activity/splices?limit=100");
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to fetch splice logs");
  }
}

export async function createFieldEvent(payload) {
  try {
    const response = await http.post("/api/activity/field-events", payload);
    return response.data;
  } catch (error) {
    throw unwrapError(error, "Unable to record field activity");
  }
}
