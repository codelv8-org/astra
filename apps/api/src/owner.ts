import { randomUUID } from "node:crypto";
import { database } from "./db.js";
import { users } from "./schema.js";
import { passwordHash } from "./auth.js";
const name = process.env.CREWNEST_OWNER_NAME;
const password = process.env.CREWNEST_OWNER_PASSWORD;
if (!name || !password)
  throw Error("Set CREWNEST_OWNER_NAME and CREWNEST_OWNER_PASSWORD locally");
const { pool, db } = database(process.env.DATABASE_URL ?? "");
try {
  await db
    .insert(users)
    .values({ id: randomUUID(), name, password: passwordHash(password) })
    .onConflictDoNothing();
  console.log("Owner created; no password printed");
} finally {
  await pool.end();
}
