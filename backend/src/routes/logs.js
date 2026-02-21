import express from "express";
import { getLogs } from "../controllers/logsController.js";
import { requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireRole("admin", "noc", "engineer"), getLogs);

export default router;
