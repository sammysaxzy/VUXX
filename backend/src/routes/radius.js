import express from "express";
import { getRadiusSessions, updateRadiusStatus } from "../controllers/radiusController.js";
import { requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireRole("admin", "noc", "engineer"), getRadiusSessions);
router.patch("/:id/status", requireRole("admin", "noc"), updateRadiusStatus);

export default router;
