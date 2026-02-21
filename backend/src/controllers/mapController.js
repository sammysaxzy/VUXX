import { z } from "zod";
import { pool, query } from "../config/db.js";
import { recordLog } from "../services/logService.js";

const nodeSchema = z.object({
  type: z.enum(["olt", "mst", "client"]),
  name: z.string().min(2),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  area: z.string().min(1),
  oltId: z.string().uuid().optional(),
  status: z.enum(["planned", "installed", "active", "faulty", "maintenance"]).default("planned"),
  metadata: z.record(z.any()).optional()
});

const fiberSchema = z.object({
  name: z.string().min(2),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  status: z.enum(["planned", "active", "faulty"]).default("planned"),
  path: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(2)
  })
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

function formatNode(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    area: row.area,
    oltId: row.olt_id,
    status: row.status,
    metadata: row.metadata
  };
}

function formatRoute(row) {
  return {
    id: row.id,
    name: row.name,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    status: row.status,
    path: row.path_geojson
  };
}

export async function listNodes(req, res, next) {
  try {
    const tenantId = tenantIdOrThrow(req);
    const result = await query(
      `SELECT id, name, type, latitude, longitude, area, status, olt_id, metadata
       FROM nodes
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );
    res.json(result.rows.map(formatNode));
  } catch (error) {
    next(error);
  }
}

export async function createNode(req, res, next) {
  try {
    const parsed = nodeSchema.safeParse(req.body);
    if (!parsed.success) {
      const error = new Error(parsed.error.flatten().message);
      error.status = 400;
      throw error;
    }
    const tenantId = tenantIdOrThrow(req);
    const data = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const nodeResult = await client.query(
        `INSERT INTO nodes (tenant_id, type, name, latitude, longitude, area, status, olt_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [tenantId, data.type, data.name, data.latitude, data.longitude, data.area, data.status, data.oltId || null, data.metadata || {}]
      );
      const node = nodeResult.rows[0];
      if (data.type === "mst") {
        await client.query(
          `INSERT INTO mst (tenant_id, node_id, olt_id, status)
           VALUES ($1, $2, $3, $4)`,
          [tenantId, node.id, data.oltId || null, data.status]
        );
      }
      await recordLog({
        tenantId,
        userId: req.user?.id,
        level: "info",
        source: "map",
        message: `Node ${node.name} created`,
        metadata: { nodeId: node.id }
      });
      await client.query("COMMIT");
      res.status(201).json(formatNode(node));
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

export async function listFiberRoutes(req, res, next) {
  try {
    const tenantId = tenantIdOrThrow(req);
    const result = await query(
      `SELECT * FROM fiber_routes WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    res.json(result.rows.map(formatRoute));
  } catch (error) {
    next(error);
  }
}

export async function createFiberRoute(req, res, next) {
  try {
    const parsed = fiberSchema.safeParse(req.body);
    if (!parsed.success) {
      const error = new Error(parsed.error.flatten().message);
      error.status = 400;
      throw error;
    }
    const tenantId = tenantIdOrThrow(req);
    const { sourceNodeId, targetNodeId, name, status, path } = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const nodesCheck = await client.query(
        `SELECT id FROM nodes WHERE id IN ($1, $2) AND tenant_id = $3`,
        [sourceNodeId, targetNodeId, tenantId]
      );
      if (nodesCheck.rowCount < 2) {
        throw new Error("Invalid node selection");
      }
      const routeResult = await client.query(
        `INSERT INTO fiber_routes (tenant_id, source_node_id, target_node_id, name, status, path_geojson)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [tenantId, sourceNodeId, targetNodeId, name, status, path]
      );
      const route = routeResult.rows[0];
      await recordLog({
        tenantId,
        userId: req.user?.id,
        level: "info",
        source: "map",
        message: `Fiber route ${route.name} created`,
        metadata: { routeId: route.id }
      });
      await client.query("COMMIT");
      res.status(201).json(formatRoute(route));
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
