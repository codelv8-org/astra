import { readFile } from "node:fs/promises";
import { database } from "./db.js";
export async function migrate(url: string) {
  const { pool } = database(url);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(734021)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY)",
    );
    const done = await c.query(
      "SELECT version FROM schema_migrations WHERE version=1",
    );
    if (!done.rowCount) {
      await c.query(
        await readFile(
          new URL("../migrations/001_remote.sql", import.meta.url),
          "utf8",
        ),
      );
      await c.query("INSERT INTO schema_migrations VALUES(1)");
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}
if (
  process.argv[1]?.endsWith("migrate.ts") ||
  process.argv[1]?.endsWith("migrate.js")
)
  await migrate(process.env.DATABASE_URL ?? "");
