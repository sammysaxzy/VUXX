import { z } from "zod";
import { query } from "../config/db.js";
import { recordLog } from "../services/logService.js";

const radiusFilter = z.object({
  status: z.enum(["inactive", "active", "suspended"]).optional(),
  customerId: z.string().uuid().optional()
});

const statusSchema = z.object({
  status: z.enum(["inactive", "active", "suspended"])
});

function tenantIdOrThrow(req) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    const error = new Error("Tenant context missing");
    error.status = 400;
    throw error;
  }
  return tenantId;
}

export async function getRadiusSessions(req, res, next) {
  try {
    const parsed = radiusFilter.safeParse(req.query);
    if (!parsed.success) {
      const error = new Error(parsed.error.flatten().message);
      error.status = 400;
      throw error;
    }
    const tenantId = tenantIdOrThrow(req);
    const params = [tenantId];
    let where = "tenant_id = $1";
    if (parsed.data.status) {
      params.push(parsed.data.status);
      where += ` AND status = $${params.length}`;
    }
    if (parsed.data.customerId) {
      params.push(parsed.data.customerId);
      where += ` AND customer_id = $${params.length}`;
    }
    const result = await query(
      `SELECT rs.*, c.full_name AS customer_name
       FROM radius_sessions rs
       LEFT JOIN customers c ON c.id = rs.customer_id
       WHERE ${where}
       ORDER BY last_seen DESC`,
      params
    );
    res.json(
      result.rows.map((row) => ({
        id: row.id,
        username: row.username,
        customerId: row.customer_id,
        customerName: row.customer_name,
        status: row.status,
        ipAddress: row.ip_address,
        bandwidthUp: row.bandwidth_up,
        bandwidthDown: row.bandwidth_down,
        lastSeen: row.last_seen,
        createdAt: row.created_at
      }))
    );
  } catch (error) {
    next(error);
  }
}

export async function updateRadiusStatus(req, res, next) {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      const error = new Error(parsed.error.flatten().message);
      error.status = 400;
      throw error;
    }
    const tenantId = tenantIdOrThrow(req);
    const result = await query(
      `UPDATE radius_sessions SET status = $1, last_seen = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [parsed.data.status, req.params.id, tenantId]
    );
    if (!result.rows[0]) {
      const error = new Error("Session not found");
      error.status = 404;
      throw error;
    }
    await recordLog({
      tenantId,
      level: "warning",
      source: "radius",
      message: `Session ${result.rows[0].username} marked ${parsed.data.status}`
    });
    res.json({
      id: result.rows[0].id,
      username: result.rows[0].username,
      status: result.rows[0].status,
      lastSeen: result.rows[0].last_seen
    });
  } catch (error) {
    next(error);
  }
}
