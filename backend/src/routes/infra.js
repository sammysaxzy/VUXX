import express from "express";
import { z } from "zod";
import { pool, query } from "../config/db.js";
import { CORE_COLORS } from "../constants.js";

const router = express.Router();

const nodeSchema = z.object({
  type: z.enum(["mst", "closure", "distribution", "client", "splitter"]),
  name: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  status: z.enum(["planned", "installed", "active", "faulty", "maintenance"]),
  metadata: z.record(z.any()).optional()
});

const cableSchema = z.object({
  name: z.string().min(1),
  startNodeId: z.string().uuid(),
  endNodeId: z.string().uuid(),
  coreCount: z.number().int().positive(),
  status: z.enum(["planned", "installed", "active", "faulty", "maintenance"]),
  pathGeojson: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(2)
  })
});

const allocationSchema = z.object({
  coreNumber: z.number().int().positive(),
  toNodeId: z.string().uuid().optional(),
  purpose: z.string().min(1).default("distribution"),
  status: z.enum(["active", "reserved"]).default("active")
});

const splitterSchema = z.object({
  nodeId: z.string().uuid(),
  ratioOut: z.enum(["2", "4", "8", "16"]).transform((v) => Number(v))
});

const splitterResizeSchema = z.object({
  ratioOut: z.enum(["2", "4", "8", "16"]).transform((v) => Number(v))
});

const assignLegSchema = z.object({
  coreId: z.string().uuid(),
  status: z.enum(["used", "reserved"]).default("used")
});

const faultSchema = z.object({
  targetType: z.enum(["node", "cable", "core", "splitter", "customer"]),
  targetId: z.string().uuid(),
  description: z.string().min(4)
});

function getTenantId(req) {
  return req.user.tenantId;
}

function emitTenantEvent(req, event, payload) {
  const io = req.app.get("io");
  io.to(`tenant:${getTenantId(req)}`).emit(event, payload);
}

router.get("/nodes", async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await query(
    `SELECT id, type, name, latitude, longitude, status, metadata, area, olt_id,
            created_at, updated_at
     FROM infra_nodes WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  res.json(result.rows);
});

router.post("/nodes", async (req, res) => {
  const parsed = nodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tenantId = getTenantId(req);
  const data = parsed.data;

  const result = await query(
    `INSERT INTO infra_nodes (tenant_id, type, name, latitude, longitude, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, data.type, data.name, data.latitude, data.longitude, data.status, data.metadata || {}]
  );
  emitTenantEvent(req, "node.created", result.rows[0]);
  res.status(201).json(result.rows[0]);
});

router.put("/nodes/:id", async (req, res) => {
  const parsed = nodeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tenantId = getTenantId(req);
  const updates = parsed.data;
  const fields = [];
  const values = [];
  let index = 1;

  const map = {
    type: "type",
    name: "name",
    latitude: "latitude",
    longitude: "longitude",
    status: "status",
    metadata: "metadata"
  };

  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${map[key]} = $${index++}`);
    values.push(value);
  }
  fields.push(`updated_at = NOW()`);
  values.push(req.params.id, tenantId);

  const result = await query(
    `UPDATE infra_nodes SET ${fields.join(", ")}
     WHERE id = $${index++} AND tenant_id = $${index}
     RETURNING *`,
    values
  );

  if (!result.rows[0]) return res.status(404).json({ error: "Node not found" });
  emitTenantEvent(req, "node.updated", result.rows[0]);
  res.json(result.rows[0]);
});

router.delete("/nodes/:id", async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await query(
    "DELETE FROM infra_nodes WHERE id = $1 AND tenant_id = $2 RETURNING id",
    [req.params.id, tenantId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Node not found" });
  emitTenantEvent(req, "node.deleted", { id: req.params.id });
  res.status(204).send();
});

router.get("/cables", async (req, res) => {
  const tenantId = getTenantId(req);
  const cableResult = await query(
    `SELECT id, name, start_node_id, end_node_id, core_count, status, path_geojson, created_at, updated_at
     FROM cables WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  const coreResult = await query(
    `SELECT id, cable_id, core_number, color, status FROM cable_cores WHERE tenant_id = $1`,
    [tenantId]
  );
  const coresByCable = coreResult.rows.reduce((acc, core) => {
    acc[core.cable_id] ??= [];
    acc[core.cable_id].push(core);
    return acc;
  }, {});

  const payload = cableResult.rows.map((cable) => ({
    ...cable,
    cores: (coresByCable[cable.id] || []).sort((a, b) => a.core_number - b.core_number)
  }));
  res.json(payload);
});

router.post("/cables", async (req, res) => {
  const parsed = cableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const tenantId = getTenantId(req);
  const data = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const cableResult = await client.query(
      `INSERT INTO cables (tenant_id, name, start_node_id, end_node_id, core_count, status, path_geojson)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        data.name,
        data.startNodeId,
        data.endNodeId,
        data.coreCount,
        data.status,
        JSON.stringify(data.pathGeojson)
      ]
    );

    const cable = cableResult.rows[0];
    const coreInsertValues = [];
    const placeholders = [];
    let p = 1;
    for (let i = 1; i <= data.coreCount; i += 1) {
      const color = CORE_COLORS[(i - 1) % CORE_COLORS.length];
      placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      coreInsertValues.push(tenantId, cable.id, i, color, "free");
    }

    const coreResult = await client.query(
      `INSERT INTO cable_cores (tenant_id, cable_id, core_number, color, status)
       VALUES ${placeholders.join(",")}
       RETURNING id, core_number, color, status`,
      coreInsertValues
    );

    await client.query("COMMIT");

    const payload = { ...cable, cores: coreResult.rows };
    emitTenantEvent(req, "cable.created", payload);
    return res.status(201).json(payload);
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Cable creation failed", details: error.message });
  } finally {
    client.release();
  }
});

router.post("/cables/:id/allocate-core", async (req, res) => {
  const parsed = allocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tenantId = getTenantId(req);
  const cableId = req.params.id;
  const { coreNumber, toNodeId, purpose, status } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cableResult = await client.query(
      "SELECT id, start_node_id FROM cables WHERE id = $1 AND tenant_id = $2",
      [cableId, tenantId]
    );
    const cable = cableResult.rows[0];
    if (!cable) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cable not found" });
    }

    const coreResult = await client.query(
      `SELECT id, status FROM cable_cores
       WHERE cable_id = $1 AND core_number = $2 AND tenant_id = $3
       FOR UPDATE`,
      [cableId, coreNumber, tenantId]
    );
    const core = coreResult.rows[0];
    if (!core) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Core not found" });
    }
    if (core.status === "faulty") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Faulty core cannot be allocated" });
    }

    const existing = await client.query(
      `SELECT id FROM core_allocations
       WHERE core_id = $1 AND status IN ('active', 'reserved')
       FOR UPDATE`,
      [core.id]
    );
    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Core already allocated" });
    }

    const allocResult = await client.query(
      `INSERT INTO core_allocations (tenant_id, core_id, from_node_id, to_node_id, purpose, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, core.id, cable.start_node_id, toNodeId || null, purpose, status]
    );

    await client.query(
      `UPDATE cable_cores SET status = $1 WHERE id = $2`,
      [status === "reserved" ? "reserved" : "used", core.id]
    );

    await client.query("COMMIT");
    emitTenantEvent(req, "core.allocated", allocResult.rows[0]);
    return res.status(201).json(allocResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Allocation failed", details: error.message });
  } finally {
    client.release();
  }
});

router.put("/cables/:id", async (req, res) => {
  const parsed = cableSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tenantId = getTenantId(req);
  const updates = parsed.data;
  const fields = [];
  const values = [];
  let idx = 1;

  const allowed = {
    name: "name",
    startNodeId: "start_node_id",
    endNodeId: "end_node_id",
    status: "status",
    pathGeojson: "path_geojson"
  };

  for (const [key, value] of Object.entries(updates)) {
    if (key === "coreCount") continue;
    fields.push(`${allowed[key]} = $${idx++}`);
    values.push(key === "pathGeojson" ? JSON.stringify(value) : value);
  }

  if (updates.coreCount !== undefined) {
    return res.status(400).json({ error: "Core count cannot be edited after cable creation" });
  }

  fields.push("updated_at = NOW()");
  values.push(req.params.id, tenantId);

  const result = await query(
    `UPDATE cables SET ${fields.join(", ")}
     WHERE id = $${idx++} AND tenant_id = $${idx}
     RETURNING *`,
    values
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Cable not found" });
  emitTenantEvent(req, "cable.updated", result.rows[0]);
  res.json(result.rows[0]);
});

router.delete("/cables/:id", async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await query("DELETE FROM cables WHERE id = $1 AND tenant_id = $2 RETURNING id", [
    req.params.id,
    tenantId
  ]);
  if (!result.rows[0]) return res.status(404).json({ error: "Cable not found" });
  emitTenantEvent(req, "cable.deleted", { id: req.params.id });
  res.status(204).send();
});

router.get("/allocations", async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await query(
    `SELECT ca.id, ca.core_id, ca.from_node_id, ca.to_node_id, ca.purpose, ca.status, ca.assigned_at,
            cc.cable_id, cc.core_number, cc.color
     FROM core_allocations ca
     JOIN cable_cores cc ON cc.id = ca.core_id
     WHERE ca.tenant_id = $1
     ORDER BY ca.assigned_at DESC`,
    [tenantId]
  );
  res.json(result.rows);
});

router.post("/splitters", async (req, res) => {
  const parsed = splitterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tenantId = getTenantId(req);
  const { nodeId, ratioOut } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const splitterResult = await client.query(
      `INSERT INTO splitters (tenant_id, node_id, ratio_in, ratio_out)
       VALUES ($1, $2, 1, $3)
       RETURNING *`,
      [tenantId, nodeId, ratioOut]
    );
    const splitter = splitterResult.rows[0];

    const values = [];
    const placeholders = [];
    let i = 1;
    for (let leg = 1; leg <= ratioOut; leg += 1) {
      placeholders.push(`($${i++}, $${i++}, $${i++}, 'free')`);
      values.push(tenantId, splitter.id, leg);
    }
    const legsResult = await client.query(
      `INSERT INTO splitter_legs (tenant_id, splitter_id, leg_number, status)
       VALUES ${placeholders.join(",")}
       RETURNING *`,
      values
    );

    await client.query("COMMIT");
    const payload = { ...splitter, legs: legsResult.rows };
    emitTenantEvent(req, "splitter.created", payload);
    return res.status(201).json(payload);
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Splitter creation failed", details: error.message });
  } finally {
    client.release();
  }
});

router.get("/splitters", async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await query(
    `SELECT s.id, s.node_id, s.ratio_in, s.ratio_out, sl.id AS leg_id, sl.leg_number, sl.status, sl.assigned_core_id
     FROM splitters s
     LEFT JOIN splitter_legs sl ON s.id = sl.splitter_id
     WHERE s.tenant_id = $1
     ORDER BY s.created_at DESC, sl.leg_number ASC`,
    [tenantId]
  );

  const splitters = {};
  for (const row of result.rows) {
    splitters[row.id] ??= {
      id: row.id,
      node_id: row.node_id,
      ratio_in: row.ratio_in,
      ratio_out: row.ratio_out,
      legs: []
    };
    if (row.leg_id) {
      splitters[row.id].legs.push({
        id: row.leg_id,
        leg_number: row.leg_number,
        status: row.status,
        assigned_core_id: row.assigned_core_id
      });
    }
  }
  res.json(Object.values(splitters));
});

router.patch("/splitters/:id/ratio", async (req, res) => {
  const parsed = splitterResizeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tenantId = getTenantId(req);
  const splitterId = req.params.id;
  const { ratioOut } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const splitterResult = await client.query(
      "SELECT id, ratio_out FROM splitters WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [splitterId, tenantId]
    );
    const splitter = splitterResult.rows[0];
    if (!splitter) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Splitter not found" });
    }

    const current = splitter.ratio_out;
    if (ratioOut > current) {
      const values = [];
      const placeholders = [];
      let i = 1;
      for (let leg = current + 1; leg <= ratioOut; leg += 1) {
        placeholders.push(`($${i++}, $${i++}, $${i++}, 'free')`);
        values.push(tenantId, splitterId, leg);
      }
      await client.query(
        `INSERT INTO splitter_legs (tenant_id, splitter_id, leg_number, status)
         VALUES ${placeholders.join(",")}`,
        values
      );
    } else if (ratioOut < current) {
      const deleteResult = await client.query(
        `DELETE FROM splitter_legs
         WHERE splitter_id = $1 AND tenant_id = $2 AND leg_number > $3 AND status = 'free'
         RETURNING id`,
        [splitterId, tenantId, ratioOut]
      );
      const neededDeletion = current - ratioOut;
      if (deleteResult.rowCount !== neededDeletion) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Cannot shrink splitter ratio while higher legs are still in use/reserved"
        });
      }
    }

    const updated = await client.query(
      "UPDATE splitters SET ratio_out = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *",
      [ratioOut, splitterId, tenantId]
    );
    await client.query("COMMIT");
    emitTenantEvent(req, "splitter.updated", updated.rows[0]);
    res.json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Splitter update failed", details: error.message });
  } finally {
    client.release();
  }
});

router.patch("/splitter-legs/:id/assign-core", async (req, res) => {
  const parsed = assignLegSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tenantId = getTenantId(req);
  const legId = req.params.id;
  const { coreId, status } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const legResult = await client.query(
      "SELECT id, status, assigned_core_id FROM splitter_legs WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [legId, tenantId]
    );
    const leg = legResult.rows[0];
    if (!leg) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Splitter leg not found" });
    }

    const coreResult = await client.query(
      "SELECT id, status FROM cable_cores WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [coreId, tenantId]
    );
    const core = coreResult.rows[0];
    if (!core) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Core not found" });
    }
    if (core.status !== "free") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Core is not free for leg assignment" });
    }

    await client.query(
      "UPDATE cable_cores SET status = $1 WHERE id = $2",
      [status === "reserved" ? "reserved" : "used", coreId]
    );
    const updatedLeg = await client.query(
      "UPDATE splitter_legs SET assigned_core_id = $1, status = $2 WHERE id = $3 RETURNING *",
      [coreId, status, legId]
    );

    await client.query("COMMIT");
    emitTenantEvent(req, "splitter.leg.assigned", updatedLeg.rows[0]);
    res.json(updatedLeg.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Leg assignment failed", details: error.message });
  } finally {
    client.release();
  }
});

router.post("/faults", async (req, res) => {
  const parsed = faultSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tenantId = getTenantId(req);
  const data = parsed.data;
  const result = await query(
    `INSERT INTO fault_logs (tenant_id, target_type, target_id, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [tenantId, data.targetType, data.targetId, data.description]
  );
  emitTenantEvent(req, "fault.created", result.rows[0]);
  res.status(201).json(result.rows[0]);
});

router.get("/faults", async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await query(
    `SELECT * FROM fault_logs WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  res.json(result.rows);
});

export default router;
