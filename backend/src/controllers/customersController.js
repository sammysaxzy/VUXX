import { z } from "zod";
import { pool, query } from "../config/db.js";
import { recordLog } from "../services/logService.js";

const accountStatuses = ["active", "suspended"];
const paymentStatuses = ["paid", "overdue"];

const createCustomerSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().optional(),
  email: z.string().email(),
  planId: z.string().min(1),
  mstId: z.string().uuid().optional(),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  accountStatus: z.enum(accountStatuses),
  paymentStatus: z.enum(paymentStatuses),
  installationDocs: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional()
});

const updateCustomerSchema = z
  .object({
    fullName: z.string().min(2).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    planId: z.string().min(1).optional(),
    mstId: z.string().uuid().optional(),
    latitude: z.number().finite().optional(),
    longitude: z.number().finite().optional(),
    accountStatus: z.enum(accountStatuses).optional(),
    paymentStatus: z.enum(paymentStatuses).optional(),
    installationDocs: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional()
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

function mapCustomer(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    planId: row.plan_id,
    mstId: row.mst_id,
    nodeId: row.node_id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accountStatus: row.account_status,
    paymentStatus: row.payment_status,
    installationDocs: row.installation_docs,
    metadata: row.metadata,
    nodeName: row.node_name,
    mstName: row.mst_name,
    createdAt: row.created_at
  };
}

async function fetchCustomersWithNodes(tenantId) {
  const result = await query(
    `SELECT c.*, n.name AS node_name, mstNode.name AS mst_name
     FROM customers c
     LEFT JOIN nodes n ON n.id = c.node_id
     LEFT JOIN mst m ON m.id = c.mst_id
     LEFT JOIN nodes mstNode ON mstNode.id = m.node_id
     WHERE c.tenant_id = $1
     ORDER BY c.created_at DESC`,
    [tenantId]
  );
  return result.rows.map(mapCustomer);
}

async function refreshNodeCoordinates(nodeId, latitude, longitude) {
  await query(
    `UPDATE nodes SET latitude = COALESCE($1, latitude),
                        longitude = COALESCE($2, longitude),
                        updated_at = NOW()
     WHERE id = $3`,
    [latitude, longitude, nodeId]
  );
}

export async function getCustomers(_req, res, next) {
  try {
    const tenantId = tenantIdOrThrow(_req);
    const payload = await fetchCustomersWithNodes(tenantId);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function createCustomer(req, res, next) {
  try {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      const error = new Error(parsed.error.flatten().message);
      error.status = 400;
      throw error;
    }
    const tenantId = tenantIdOrThrow(req);
    const {
      fullName,
      phone,
      email,
      planId,
      mstId,
      latitude,
      longitude,
      accountStatus,
      paymentStatus,
      installationDocs,
      metadata
    } = parsed.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const nodeResult = await client.query(
        `INSERT INTO nodes (tenant_id, type, name, latitude, longitude, status, metadata, olt_id)
         VALUES ($1, 'client', $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [tenantId, fullName, latitude, longitude, "active", metadata || {}, mstId ? mstId : null]
      );
      const nodeId = nodeResult.rows[0].id;

      const customerResult = await client.query(
        `INSERT INTO customers (
           tenant_id, full_name, phone, email, plan_id,
           mst_id, node_id, latitude, longitude, account_status,
           payment_status, installation_docs, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          tenantId,
          fullName,
          phone || null,
          email,
          planId,
          mstId || null,
          nodeId,
          latitude,
          longitude,
          accountStatus,
          paymentStatus,
          installationDocs || {},
          metadata || {}
        ]
      );
      const created = customerResult.rows[0];
      await recordLog({
        tenantId,
        userId: req.user?.id,
        level: "info",
        source: "customers",
        message: `Customer ${created.full_name} created`,
        metadata: { customerId: created.id, mstId, nodeId }
      });
      await client.query("COMMIT");
      const payload = await fetchCustomersWithNodes(tenantId);
      res.status(201).json(payload);
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
}

export async function updateCustomer(req, res, next) {
  try {
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      const error = new Error(parsed.error.flatten().message);
      error.status = 400;
      throw error;
    }
    const tenantId = tenantIdOrThrow(req);
    const updates = [];
    const values = [];
    let idx = 1;

    const assignField = (field, column, transform = (value) => value) => {
      if (parsed.data[field] !== undefined) {
        updates.push(`${column} = $${idx}`);
        values.push(transform(parsed.data[field]));
        idx += 1;
      }
    };

    assignField("fullName", "full_name");
    assignField("phone", "phone");
    assignField("email", "email");
    assignField("planId", "plan_id");
    assignField("mstId", "mst_id");
    assignField("accountStatus", "account_status");
    assignField("paymentStatus", "payment_status");
    assignField("installationDocs", "installation_docs", (value) => value || {});
    assignField("metadata", "metadata", (value) => value || {});

    if (updates.length === 0 && parsed.data.latitude === undefined && parsed.data.longitude === undefined) {
      const error = new Error("No update fields provided");
      error.status = 400;
      throw error;
    }

    const payload = [...values, req.params.id, tenantId];
    const setClause = updates.length ? `${updates.join(", ")},` : "";

    try {
      const result = await query(
        `UPDATE customers SET ${setClause} updated_at = NOW()
         WHERE id = $${idx} AND tenant_id = $${idx + 1}
         RETURNING *`,
        payload
      );
      if (!result.rows[0]) {
        const error = new Error("Customer not found");
        error.status = 404;
        throw error;
      }
      if (parsed.data.latitude !== undefined || parsed.data.longitude !== undefined) {
      await refreshNodeCoordinates(result.rows[0].node_id, parsed.data.latitude, parsed.data.longitude);
      }
      await recordLog({
        tenantId,
        userId: req.user?.id,
        level: "info",
        source: "customers",
        message: `Customer ${result.rows[0].id} updated`
      });
      const payloadList = await fetchCustomersWithNodes(tenantId);
      res.json(payloadList);
    } catch (error) {
      next(error);
    }
  } catch (error) {
    next(error);
  }
}
