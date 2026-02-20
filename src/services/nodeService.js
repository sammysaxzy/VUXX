import { api } from "../api/client.js";

export function fetchNodes() {
  return api.get("/api/nodes").then((res) => res.data);
}
