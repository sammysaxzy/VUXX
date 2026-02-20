import { z } from "zod";
import { pool, query } from "../config/db.js";

const VALID_PLANS = ["Home 40Mbps", "Biz 60Mbps", "Biz 100Mbps", "Enterprise 200Mbps"];
const VALID_ACCOUNT_STATUSES = ["active", "suspended"];
const VALID_PAYMENT_STATUSES = ["paid", "overdue"];

const createCustomerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  area: z.string().min(1),
  oltId: z.string().uuid(),
  mstId: z.string().uuid(),
  plan: z.enum(VALID_PLANS),
  accountStatus: z.enum(VALID_ACCOUNT_STATUSES),
  paymentStatus: z.enum(VALID_PAYMENT_STATUSES),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  cpePhoto: z.string().optional(),
  mstPhoto: z.string().optional()
});

const updateCustomerSchema = z
  .object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    plan: z.enum(VALID_PLANS).optional(),
    accountStatus: z.enum(VALID_ACCOUNT_STATUSES).optional(),
    paymentStatus: z.enum(VALID_PAYMENT_STATUSES).optional(),
    mstId: z.string().uuid().optional(),
    cpePhoto: z.string().optional(),
    mstPhoto: z.string().optional(),
    latitude: z.number().finite().optional(),
    longitude: z.number().finite().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided to update"
  });

const statusSchema = z.object({
  accountStatus: z.enum(VALID_ACCOUNT_STATUSES)
});

const planSchema = z.object({
  plan: z.enum(VALID_PLANS)
});

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function mapCustomer(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    plan: row.plan,
    accountStatus: row.account_status,
    paymentStatus: row.payment_status,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    nodeId: row.node_id,
    mstId: row.mst_id,
    area: row.area,
    oltId: row.olt_id,
    cpePhoto: row.cpe_photo,
    mstPhoto: row.mst_photo,
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

async function fetchCustomerWithJoins(customerId, tenantId) {
  const result = await query(
    `SELECT c.*, clientNode.area, clientNode.olt_id
     FROM customers c
     LEFT JOIN infra_nodes clientNode ON clientNode.id = c.node_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [customerId, tenantId]
  );
  return result.rows[0];
}

async function signalRadiusChange(customer) {
  console.log(`RADIUS sync pending for ${customer.email} (${customer.accountStatus})`);
}

export async function getCustomers(req, res, next) {
  try {
    const tenantId = tenantIdOrThrow(req);
    const result = await query(
      `SELECT c.*, clientNode.area, clientNode.olt_id
       FROM customers c
       LEFT JOIN infra_nodes clientNode ON clientNode.id = c.node_id
       WHERE c.tenant_id = $1
       ORDER BY c.created_at DESC`,
      [tenantId]
    );
    res.json(result.rows.map(mapCustomer));
  } catch (error) {
    next(error);
  }
}

export async function getCustomerById(req, res, next) {
  try {
    const tenantId = tenantIdOrThrow(req);
    const row = await fetchCustomerWithJoins(req.params.id, tenantId);
    if (!row) {
      throw httpError(404, "Customer not found");
    }
    res.json(mapCustomer(row));
  } catch (error) {
    next(error);
  }
}

export async function createCustomer(req, res, next) {
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(httpError(400, parsed.error.issues.map((issue) => issue.message).join(", ")));
  }

  const tenantId = tenantIdOrThrow(req);
  const { name, email, phone, address, area, oltId, mstId, plan, accountStatus, paymentStatus, latitude, longitude, cpePhoto, mstPhoto } =
    parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const nodeResult = await client.query(
      `INSERT INTO infra_nodes (
         tenant_id, type, name, latitude, longitude, area, olt_id, status, metadata
       ) VALUES ($1, 'client', $2, $3, $4, $5, $6, 'active', $7)
       RETURNING id`,
      [tenantId, name, latitude, longitude, area, oltId, JSON.stringify({ assignedMstId: mstId })]
    );
    const nodeId = nodeResult.rows[0].id;

    const customerResult = await client.query(
      `INSERT INTO customers (
         tenant_id, name, email, phone, address, plan,
         account_status, payment_status, mst_id, node_id,
         latitude, longitude, cpe_photo, mst_photo
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, name`,
      [
        tenantId,
        name,
        email,
        phone || null,
        address || null,
        plan,
        accountStatus,
        paymentStatus,
        mstId,
        nodeId,
        latitude,
        longitude,
        cpePhoto || null,
        mstPhoto || null
      ]
    );
    const createdCustomer = customerResult.rows[0];

    await client.query(
      `INSERT INTO activity_logs (tenant_id, type, message, metadata)
       VALUES ($1, 'customer.created', $2, $3)`,
      [
        tenantId,
        `Customer ${createdCustomer.name} onboarded`,
        JSON.stringify({ customerId: createdCustomer.id, nodeId, mstId, area, oltId })
      ]
    );

    await client.query("COMMIT");
    const row = await fetchCustomerWithJoins(createdCustomer.id, tenantId);
    res.status(201).json(mapCustomer(row));
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}

export async function updateCustomer(req, res, next) {
  try {
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, parsed.error.issues.map((issue) => issue.message).join(", "));
    }

    const tenantId = tenantIdOrThrow(req);
    const current = await fetchCustomerWithJoins(req.params.id, tenantId);
    if (!current) {
      throw httpError(404, "Customer not found");
    }

    const updates = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(parsed.data)) {
      let column;
      if (key === "accountStatus") column = "account_status";
      else if (key === "paymentStatus") column = "payment_status";
      else if (key === "mstId") column = "mst_id";
      else if (key === "cpePhoto") column = "cpe_photo";
      else if (key === "mstPhoto") column = "mst_photo";
      else column = key.toLowerCase();
      updates.push(`${column} = $${idx++}`);
      values.push(value);
    }

    if (!updates.length) {
      throw httpError(400, "No fields supplied for update");
    }

    values.push(req.params.id, tenantId);
    const result = await query(
      `UPDATE customers SET ${updates.join(", ")}
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING id`,
      values
    );

    if (!result.rows[0]) {
      throw httpError(404, "Customer not found");
    }

    if (parsed.data.latitude || parsed.data.longitude) {
      await query(
        `UPDATE infra_nodes SET latitude = COALESCE($1, latitude),
                               longitude = COALESCE($2, longitude)
         WHERE id = $3 AND tenant_id = $4`,
        [
          parsed.data.latitude ?? current.latitude,
          parsed.data.longitude ?? current.longitude,
          current.nodeId,
          tenantId
        ]
      );
    }

    const updated = await fetchCustomerWithJoins(req.params.id, tenantId);
    res.json(mapCustomer(updated));
  } catch (error) {
    next(error);
  }
}

export async function updateCustomerStatus(req, res, next) {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, parsed.error.issues.map((issue) => issue.message).join(", "));
    }

    const tenantId = tenantIdOrThrow(req);
    const result = await query(
      `UPDATE customers SET account_status = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING id`,
      [parsed.data.accountStatus, req.params.id, tenantId]
    );

    if (!result.rows[0]) {
      throw httpError(404, "Customer not found");
    }

    const updated = await fetchCustomerWithJoins(req.params.id, tenantId);
    await signalRadiusChange(updated);
    res.json(mapCustomer(updated));
  } catch (error) {
    next(error);
  }
}

export async function updateCustomerPlan(req, res, next) {
  try {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, parsed.error.issues.map((issue) => issue.message).join(", "));
    }

    const tenantId = tenantIdOrThrow(req);
    const result = await query(
      `UPDATE customers SET plan = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING id`,
      [parsed.data.plan, req.params.id, tenantId]
    );

    if (!result.rows[0]) {
      throw httpError(404, "Customer not found");
    }

    const updated = await fetchCustomerWithJoins(req.params.id, tenantId);
    res.json(mapCustomer(updated));
  } catch (error) {
    next(error);
  }
}

export async function deleteCustomer(req, res, next) {
  try {
    const tenantId = tenantIdOrThrow(req);
    const result = await query(
      `DELETE FROM customers WHERE id = $1 AND tenant_id = $2 RETURNING node_id`,
      [req.params.id, tenantId]
    );

    if (!result.rows[0]) {
      throw httpError(404, "Customer not found");
    }

    const nodeId = result.rows[0].node_id;
    if (nodeId) {
      await query("DELETE FROM infra_nodes WHERE id = $1 AND tenant_id = $2", [nodeId, tenantId]);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
