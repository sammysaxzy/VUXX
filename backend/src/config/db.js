import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const {
  DATABASE_URL,
  DB_HOST,
  DB_PORT = "5432",
  DB_USER,
  DB_PASS,
  DB_NAME
} = process.env;

const connectionString =
  DATABASE_URL ||
  (DB_HOST && DB_USER && DB_PASS && DB_NAME
    ? `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASS)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`
    : undefined);

if (!connectionString) {
  throw new Error("Database configuration is incomplete");
}

export const pool = new Pool({
  connectionString
});

export async function query(text, params = []) {
  return pool.query(text, params);
}
