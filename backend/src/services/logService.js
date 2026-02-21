import { query } from "../config/db.js";

const LOG_INSERT = `
  INSERT INTO logs (tenant_id, user_id, level, source, message, metadata)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *`;

export async function recordLog({
  tenantId,
  level = "info",
  source = "system",
  message,
  metadata = {},
  userId = null,
  client = null
}) {
  const values = [tenantId, userId, level, source, message, JSON.stringify(metadata)];
  if (client) {
    return client.query(LOG_INSERT, values);
  }
  return query(LOG_INSERT, values);
}
