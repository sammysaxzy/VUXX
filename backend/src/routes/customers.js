import express from "express";
import { getCustomers, createCustomer, updateCustomer } from "../controllers/customersController.js";
import { requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireRole("admin", "noc", "engineer"), getCustomers);
router.post("/", requireRole("admin", "noc"), createCustomer);
router.patch("/:id", requireRole("admin", "noc"), updateCustomer);

export default router;
