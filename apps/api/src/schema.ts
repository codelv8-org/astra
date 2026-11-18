import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: uuid().primaryKey(),
  name: text().notNull().unique(),
  password: text().notNull(),
});
export const sessions = pgTable("sessions", {
  hash: text().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  csrf: text().notNull(),
  expires: timestamp({ withTimezone: true }).notNull(),
});
export const devices = pgTable("devices", {
  id: uuid().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  name: text().notNull(),
  credentialHash: text("credential_hash").notNull(),
  revoked: boolean().notNull().default(false),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  snapshot: jsonb().notNull().default({}),
});
export const pairings = pgTable("pairings", {
  hash: text().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  expires: timestamp({ withTimezone: true }).notNull(),
});
export const connections = pgTable("device_connections", {
  id: uuid().primaryKey(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id),
  connected: timestamp({ withTimezone: true }).notNull(),
  disconnected: timestamp({ withTimezone: true }),
});
export const projects = pgTable(
  "projects",
  {
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id),
    id: uuid().notNull(),
    name: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.id] })],
);
export const commands = pgTable("commands", {
  id: uuid().primaryKey(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  key: text().notNull(),
  envelope: jsonb().notNull(),
  state: text().notNull(),
  result: jsonb(),
  expires: timestamp({ withTimezone: true }).notNull(),
});
export const events = pgTable(
  "execution_events",
  {
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id),
    id: text().notNull(),
    executionId: uuid("execution_id").notNull(),
    kind: text().notNull(),
    text: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.id] })],
);
export const audit = pgTable("audit_logs", {
  id: uuid().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id),
  deviceId: uuid("device_id").references(() => devices.id),
  action: text().notNull(),
  created: timestamp({ withTimezone: true }).notNull(),
});
