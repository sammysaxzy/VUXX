import { query } from "../config/db.js";

function tenantIdOrThrow(req) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    const error = new Error("Tenant context missing");
    error.status = 400;
    throw error;
  }
  return tenantId;
}

export async function getLogs(req, res, next) {
  try {
    const tenantId = tenantIdOrThrow(req);
    const result = await query(
      `SELECT id, level, source, message, metadata, created_at
       FROM logs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 40`,
      [tenantId]
    );
    res.json(
      result.rows.map((row) => ({
        id: row.id,
        level: row.level,
        source: row.source,
        message: row.message,
        metadata: row.metadata,
        timestamp: row.created_at
      }))
    );
  } catch (error) {
    next(error);
  }
}
