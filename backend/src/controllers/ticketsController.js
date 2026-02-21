import { z } from "zod";
import { query } from "../config/db.js";
import { recordLog } from "../services/logService.js";

const ticketSchema = z.object({
  nodeId: z.string().uuid().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().min(5),
  assignedTo: z.string().uuid().optional()
});

const ticketUpdateSchema = z
  .object({
    status: z.enum(["open", "in_progress", "escalated", "resolved"]).optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    description: z.string().min(5).optional(),
    assignedTo: z.string().uuid().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
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

function mapTicket(row) {
  return {
    id: row.id,
    nodeId: row.node_id,
    severity: row.severity,
    status: row.status,
    description: row.description,
    assignedTo: row.assigned_to,
    assignedName: row.engineer_name,
    nodeName: row.node_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getTickets(req, res, next) {
  try {
    const tenantId = tenantIdOrThrow(req);
    const result = await query(
      `SELECT t.*, u.full_name AS engineer_name, n.name AS node_name
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       LEFT JOIN nodes n ON n.id = t.node_id
       WHERE t.tenant_id = $1
       ORDER BY t.created_at DESC`,
      [tenantId]
    );
    res.json(result.rows.map(mapTicket));
  } catch (error) {
    next(error);
  }
}

export async function createTicket(req, res, next) {
  try {
    const parsed = ticketSchema.safeParse(req.body);
    if (!parsed.success) {
      const error = new Error(parsed.error.flatten().message);
      error.status = 400;
      throw error;
    }
    const tenantId = tenantIdOrThrow(req);
    const { nodeId, severity, description, assignedTo } = parsed.data;
    const result = await query(
      `INSERT INTO tickets (tenant_id, node_id, severity, description, assigned_to)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, nodeId || null, severity, description, assignedTo || null]
    );
    await recordLog({
      tenantId,
      userId: req.user?.id,
      level: "warning",
      source: "tickets",
      message: `Ticket ${result.rows[0].id} created`,
      metadata: { severity, nodeId }
    });
    res.status(201).json(mapTicket(result.rows[0]));
  } catch (error) {
    next(error);
  }
}

export async function updateTicket(req, res, next) {
  try {
    const parsed = ticketUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      const error = new Error(parsed.error.flatten().message);
      error.status = 400;
      throw error;
    }
    const tenantId = tenantIdOrThrow(req);
    const updates = [];
    const values = [];
    let idx = 1;
    if (parsed.data.status) {
      updates.push(`status = $${idx++}`);
      values.push(parsed.data.status);
    }
    if (parsed.data.severity) {
      updates.push(`severity = $${idx++}`);
      values.push(parsed.data.severity);
    }
    if (parsed.data.description) {
      updates.push(`description = $${idx++}`);
      values.push(parsed.data.description);
    }
    if (parsed.data.assignedTo) {
      updates.push(`assigned_to = $${idx++}`);
      values.push(parsed.data.assignedTo);
    }
    if (!updates.length) {
      const error = new Error("No changes provided");
      error.status = 400;
      throw error;
    }
    updates.push("updated_at = NOW()");
    const payload = [...values, req.params.id, tenantId];
    const result = await query(
      `UPDATE tickets SET ${updates.join(", ")}
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING *`,
      payload
    );
    if (!result.rows[0]) {
      const error = new Error("Ticket not found");
      error.status = 404;
      throw error;
    }
    await recordLog({
      tenantId,
      userId: req.user?.id,
      level: "info",
      source: "tickets",
      message: `Ticket ${req.params.id} updated`
    });
    res.json(mapTicket(result.rows[0]));
  } catch (error) {
    next(error);
  }
}
