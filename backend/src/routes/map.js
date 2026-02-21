import express from "express";
import { listNodes, createNode, listFiberRoutes, createFiberRoute } from "../controllers/mapController.js";
import { requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/nodes", listNodes);
router.post("/nodes", requireRole("admin", "engineer"), createNode);

router.get("/fiber-routes", listFiberRoutes);
router.post("/fiber-routes", requireRole("admin", "engineer"), createFiberRoute);
export default router;
