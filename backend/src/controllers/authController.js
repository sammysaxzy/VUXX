import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { query } from "../config/db.js";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = process.env.JWT_EXPIRES_IN || "1h";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured for the authentication service");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(httpError(400, "Email and password are required"));
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const userResult = await query(
      `SELECT id, email, password_hash, role, tenant_id
       FROM users
       WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    const user = userResult.rows[0];
    if (!user) {
      return next(httpError(401, "Invalid email or password"));
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return next(httpError(401, "Invalid email or password"));
    }

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        tenantId: user.tenant_id
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return next(error);
  }
}
