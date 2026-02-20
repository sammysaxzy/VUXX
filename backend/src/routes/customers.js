import express from "express";
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  updateCustomerStatus,
  updateCustomerPlan,
  deleteCustomer
} from "../controllers/customersController.js";
import { requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/", getCustomers);
router.get("/:id", getCustomerById);

router.post("/", requireRole("admin", "noc"), createCustomer);
router.put("/:id", requireRole("admin", "noc"), updateCustomer);
router.patch("/:id/status", requireRole("admin", "noc", "engineer"), updateCustomerStatus);
router.patch("/:id/plan", requireRole("admin", "noc"), updateCustomerPlan);
router.delete("/:id", requireRole("admin"), deleteCustomer);

export default router;
