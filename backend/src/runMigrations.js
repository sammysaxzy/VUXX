import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");

async function run() {
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  await pool.end();
  console.log("Migrations completed.");
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
