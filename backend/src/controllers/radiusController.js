import { z } from "zod";
import { query } from "../config/db.js";

const STATUS_VALUES = ["inactive", "active", "suspended"];

const filterSchema = z.object({
  customerId: z.string().uuid().optional()
});

const statusSchema = z.object({
  status: z.enum(STATUS_VALUES)
});

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    status: row.status,
    customerId: row.customer_id,
    bandwidth: row.bandwidth,
    createdAt: row.created_at
  };
}

function tenantIdOrThrow(req) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw httpError(400, "Tenant context missing");
  }
  return tenantId;
}

export async function getRadiusSessions(req, res, next) {
  try {
    const parsed = filterSchema.safeParse(req.query);
    if (!parsed.success) {
      throw httpError(400, parsed.error.issues.map((issue) => issue.message).join(", "));
    }
    const tenantId = tenantIdOrThrow(req);
    const filters = parsed.data;
    const params = [tenantId];
    const whereClause = [];
    if (filters.customerId) {
      params.push(filters.customerId);
      whereClause.push(`customer_id = $${params.length}`);
    }
    const queryText = `
      SELECT id, username, status, bandwidth, customer_id, created_at
      FROM radius_sessions
      WHERE tenant_id = $1
      ${whereClause.length ? `AND ${whereClause.join(" AND ")}` : ""}
      ORDER BY created_at DESC
    `;
    const result = await query(queryText, params);
    res.json(result.rows.map(mapSession));
  } catch (error) {
    next(error);
  }
}

export async function updateRadiusStatus(req, res, next) {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, parsed.error.issues.map((issue) => issue.message).join(", "));
    }
    const tenantId = tenantIdOrThrow(req);
    const result = await query(
      `UPDATE radius_sessions SET status = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [parsed.data.status, req.params.id, tenantId]
    );
    if (!result.rows[0]) {
      throw httpError(404, "RADIUS session not found");
    }
    res.json(mapSession(result.rows[0]));
  } catch (error) {
    next(error);
  }
}
