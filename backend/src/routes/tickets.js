import express from "express";
import { getTickets, createTicket, updateTicket } from "../controllers/ticketsController.js";
import { requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireRole("admin", "engineer", "noc"), getTickets);
router.post("/", requireRole("admin", "engineer", "noc"), createTicket);
router.patch("/:id", requireRole("admin", "engineer", "noc"), updateTicket);

export default router;
