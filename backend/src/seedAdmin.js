import bcrypt from "bcryptjs";
import { query } from "./config/db.js";

const ADMIN_EMAIL = "admin@fibernoc.local";
const ADMIN_PASSWORD = "Admin123!";
const ADMIN_ROLE = "admin";
const ADMIN_FULL_NAME = "FIBRE NOC Admin";
const TENANT_SLUG = "fibernoc";
const TENANT_NAME = "FIBRE NOC Operations";

export async function seedAdminUser() {
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const tenantResult = await query(
    `INSERT INTO tenants (company_name, company_slug)
     VALUES ($1, $2)
     ON CONFLICT (company_slug) DO NOTHING
     RETURNING id`,
    [TENANT_NAME, TENANT_SLUG]
  );

  const tenantId =
    tenantResult.rows[0]?.id ??
    (
      await query("SELECT id FROM tenants WHERE company_slug = $1", [TENANT_SLUG])
    ).rows[0]?.id;

  if (!tenantId) {
    throw new Error("Unable to resolve tenant for the admin user");
  }

  await query(
    `INSERT INTO users (tenant_id, full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       tenant_id = EXCLUDED.tenant_id,
       role = EXCLUDED.role`,
    [tenantId, ADMIN_FULL_NAME, ADMIN_EMAIL, hashedPassword, ADMIN_ROLE]
  );

  console.log("Seeded admin user:", ADMIN_EMAIL);
}
