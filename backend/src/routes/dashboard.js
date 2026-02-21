import express from "express";
import { getDashboardMetrics } from "../controllers/dashboardController.js";
import { requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/metrics", requireRole("admin", "noc", "engineer"), getDashboardMetrics);

export default router;
