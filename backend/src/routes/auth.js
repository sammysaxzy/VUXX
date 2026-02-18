import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool, query } from "../db.js";

const router = express.Router();

const registerSchema = z.object({
  companyName: z.string().min(2),
  companySlug: z
    .string()
    .min(2)
    .transform((v) => v.trim().toLowerCase().replace(/\s+/g, "-"))
    .pipe(z.string().regex(/^[a-z0-9-]+$/)),
  logoUrl: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().url().optional()),
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { companyName, companySlug, logoUrl, fullName, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tenantResult = await client.query(
      `INSERT INTO tenants (company_name, company_slug, logo_url)
       VALUES ($1, $2, $3)
       RETURNING id, company_name, company_slug, logo_url`,
      [companyName, companySlug, logoUrl || null]
    );

    const tenant = tenantResult.rows[0];

    const userResult = await client.query(
      `INSERT INTO users (tenant_id, full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'isp_admin')
       RETURNING id, tenant_id, full_name, email, role`,
      [tenant.id, fullName, email, passwordHash]
    );

    await client.query("COMMIT");

    const user = userResult.rows[0];
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.status(201).json({ token, user, tenant });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email or company slug already exists" });
    }
    return res.status(500).json({ error: "Registration failed", details: error.message });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  try {
    const userResult = await query(
      `SELECT u.id, u.tenant_id, u.full_name, u.email, u.password_hash, u.role,
              t.company_name, t.company_slug, t.logo_url
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.email = $1`,
      [email]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      },
      tenant: {
        company_name: user.company_name,
        company_slug: user.company_slug,
        logo_url: user.logo_url
      }
    });
  } catch (error) {
    return res.status(500).json({ error: "Login failed", details: error.message });
  }
});

export default router;
