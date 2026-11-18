import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { randomUUID } from "node:crypto";
import { and, eq, gt, lt, desc, sql } from "drizzle-orm";
import { z } from "zod";
import type { WebSocket } from "ws";
import { database } from "./db.js";
import * as t from "./schema.js";
import { hash, secret, verify } from "./auth.js";
import {
  remoteCommand,
  remoteSnapshot,
  commandRequest,
} from "../../../packages/protocol/src/index.js";

export interface Config {
  databaseUrl: string;
  origin: string;
  tls: { key: Buffer; cert: Buffer };
}
export async function createServer(config: Config) {
  const { pool, db } = database(config.databaseUrl);
  const app = Fastify({
    https: config.tls,
    bodyLimit: 256 * 1024,
    logger: false,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(websocket, { options: { maxPayload: 256 * 1024 } });
  const live = new Map<
    string,
    { socket: WebSocket; seen: number; connection: string }
  >();
  const record = async (
    action: string,
    ownerId?: string,
    deviceId?: string,
  ) => {
    await db.insert(t.audit).values({
      id: randomUUID(),
      action,
      ownerId,
      deviceId,
      created: new Date(),
    });
  };
  app.addHook("onSend", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
    reply.header("strict-transport-security", "max-age=31536000");
  });
  app.setErrorHandler((error, _req, reply) => {
    const status =
      error instanceof z.ZodError
        ? 400
        : ((error as { statusCode?: number }).statusCode ?? 500);
    reply.code(status).send({
      error:
        status >= 500
          ? "Internal server error"
          : error instanceof Error
            ? error.message
            : "Invalid request",
    });
  });
  const denied = (code: number, message: string): never => {
    throw Object.assign(Error(message), { statusCode: code });
  };
  const owner = async (req: import("fastify").FastifyRequest) => {
    const token = req.cookies.crewnest_session;
    if (!token) denied(401, "Login required");
    const [s] = await db
      .select()
      .from(t.sessions)
      .where(
        and(
          eq(t.sessions.hash, hash(token!)),
          gt(t.sessions.expires, new Date()),
        ),
      );
    if (!s) denied(401, "Session expired");
    if (
      req.method !== "GET" &&
      (req.headers.origin !== config.origin ||
        req.headers["x-csrf-token"] !== s.csrf)
    )
      denied(403, "CSRF validation failed");
    return s;
  };
  const owned = async (req: import("fastify").FastifyRequest, id: string) => {
    const s = await owner(req);
    const [d] = await db
      .select()
      .from(t.devices)
      .where(
        and(
          eq(t.devices.id, z.uuid().parse(id)),
          eq(t.devices.ownerId, s.userId),
        ),
      );
    if (!d) denied(404, "Device not found");
    return { s, d };
  };
  const deviceAuth = async (req: import("fastify").FastifyRequest) => {
    if (req.headers.origin) denied(403, "Browser device connection denied");
    const auth = req.headers.authorization ?? "";
    const match = /^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(auth);
    if (!match) denied(401, "Invalid device credential");
    const [d] = await db
      .select()
      .from(t.devices)
      .where(
        and(
          eq(t.devices.credentialHash, hash(match![1])),
          eq(t.devices.revoked, false),
        ),
      );
    if (!d) denied(401, "Device revoked or unknown");
    return d;
  };
  const send = (id: string, message: unknown) => {
    const l = live.get(id);
    if (l?.socket.readyState === 1) l.socket.send(JSON.stringify(message));
  };
  app.get("/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok" };
  });
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (req.headers.origin !== config.origin) denied(403, "Invalid origin");
      const b = z
        .object({
          name: z.string().min(1).max(100),
          password: z.string().min(1).max(256),
        })
        .strict()
        .parse(req.body);
      const [u] = await db
        .select()
        .from(t.users)
        .where(eq(t.users.name, b.name));
      if (
        !verify(
          b.password,
          u?.password ?? "fixed-dummy-salt:" + "00".repeat(64),
        ) ||
        !u
      )
        denied(401, "Invalid credentials");
      const token = secret(),
        csrf = secret();
      await db.insert(t.sessions).values({
        hash: hash(token),
        userId: u.id,
        csrf,
        expires: new Date(Date.now() + 8 * 3600000),
      });
      reply.setCookie("crewnest_session", token, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 3600,
      });
      await record("login", u.id);
      return { csrf };
    },
  );
  app.get("/api/session", async (req) => {
    const s = await owner(req);
    return { userId: s.userId, csrf: s.csrf };
  });
  app.post("/api/logout", async (req, reply) => {
    const s = await owner(req);
    await db.delete(t.sessions).where(eq(t.sessions.hash, s.hash));
    reply.clearCookie("crewnest_session", {
      path: "/",
      secure: true,
      sameSite: "strict",
    });
    return { ok: true };
  });
  app.post("/api/pairings", async (req) => {
    const s = await owner(req);
    const code = secret();
    await db.insert(t.pairings).values({
      hash: hash(code),
      ownerId: s.userId,
      expires: new Date(Date.now() + 300000),
    });
    await record("pairing_created", s.userId);
    return { code, expiresInSeconds: 300 };
  });
  app.post(
    "/api/device/pair",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const b = z
        .object({
          code: z.string().min(40).max(100),
          name: z.string().trim().min(1).max(100),
        })
        .strict()
        .parse(req.body);
      return db.transaction(async (tx) => {
        const [p] = await tx
          .delete(t.pairings)
          .where(
            and(
              eq(t.pairings.hash, hash(b.code)),
              gt(t.pairings.expires, new Date()),
            ),
          )
          .returning();
        if (!p) denied(401, "Expired or used pairing code");
        const id = randomUUID(),
          token = secret();
        await tx.insert(t.devices).values({
          id,
          ownerId: p.ownerId,
          name: b.name,
          credentialHash: hash(token),
        });
        await tx.insert(t.audit).values({
          id: randomUUID(),
          ownerId: p.ownerId,
          deviceId: id,
          action: "device_paired",
          created: new Date(),
        });
        return { deviceId: id, ownerId: p.ownerId, token };
      });
    },
  );
  app.get("/api/devices", async (req) => {
    const s = await owner(req);
    const list = await db
      .select({
        id: t.devices.id,
        name: t.devices.name,
        revoked: t.devices.revoked,
        lastSeen: t.devices.lastSeen,
        snapshot: t.devices.snapshot,
      })
      .from(t.devices)
      .where(eq(t.devices.ownerId, s.userId));
    return list.map((d) => ({
      ...d,
      online:
        !d.revoked &&
        !!live.get(d.id) &&
        Date.now() - live.get(d.id)!.seen < 12000,
    }));
  });
  app.post("/api/devices/:id/revoke", async (req) => {
    const { s, d } = await owned(req, (req.params as { id: string }).id);
    await db.transaction(async (tx) => {
      await tx
        .update(t.devices)
        .set({ revoked: true })
        .where(eq(t.devices.id, d.id));
      await tx
        .update(t.commands)
        .set({ state: "revoked" })
        .where(
          and(eq(t.commands.deviceId, d.id), eq(t.commands.state, "pending")),
        );
    });
    live.get(d.id)?.socket.close(4003, "Revoked");
    live.delete(d.id);
    await record("device_revoked", s.userId, d.id);
    return { ok: true };
  });
  app.get("/api/devices/:id/commands", async (req) => {
    const { d } = await owned(req, (req.params as { id: string }).id);
    return db
      .select({
        id: t.commands.id,
        envelope: t.commands.envelope,
        state: t.commands.state,
        result: t.commands.result,
      })
      .from(t.commands)
      .where(eq(t.commands.deviceId, d.id))
      .orderBy(desc(t.commands.expires))
      .limit(100);
  });
  app.post("/api/devices/:id/commands", async (req) => {
    const { s, d } = await owned(req, (req.params as { id: string }).id);
    if (d.revoked) denied(403, "Device revoked");
    const b = commandRequest.parse(req.body);
    const [old] = await db
      .select()
      .from(t.commands)
      .where(
        and(
          eq(t.commands.ownerId, s.userId),
          eq(t.commands.deviceId, d.id),
          eq(t.commands.key, b.idempotencyKey),
        ),
      );
    if (old) {
      const previous = old.envelope as Record<string, unknown>;
      if (
        previous.project_id !== b.projectId ||
        previous.task_id !== b.taskId ||
        previous.action !== b.action ||
        JSON.stringify(previous.payload) !== JSON.stringify(b.payload)
      )
        denied(409, "Idempotency key payload changed");
      return { commandId: old.id, state: old.state };
    }
    const l = live.get(d.id);
    if (!l || Date.now() - l.seen >= 12000)
      denied(409, "Device offline; command not queued");
    if (b.action !== "status" && b.action !== "pause_scheduling") {
      const [p] = await db
        .select()
        .from(t.projects)
        .where(
          and(eq(t.projects.deviceId, d.id), eq(t.projects.id, b.projectId)),
        );
      if (!p) denied(403, "Project not shared");
    }
    if (b.action === "submit" && !b.payload)
      denied(400, "Submission payload required");
    if (b.action !== "submit" && b.payload) denied(400, "Unexpected payload");
    if (b.payload) {
      const bindings = {
        astra: "codex",
        forge: "claude",
        mira: "antigravity",
        vector: "codex",
        scout: "codex",
      };
      if (
        b.payload.adapter !== "mock" &&
        bindings[b.payload.agentId] !== b.payload.adapter
      )
        denied(400, "Invalid agent/runtime binding");
    }
    const envelope = remoteCommand.parse({
      command_id: randomUUID(),
      device_id: d.id,
      project_id: b.projectId,
      task_id: b.taskId,
      action: b.action,
      requested_by: s.userId,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60000).toISOString(),
      idempotency_key: b.idempotencyKey,
      authorization_context: { approval_id: null },
      ...(b.payload ? { payload: b.payload } : {}),
    });
    try {
      await db.insert(t.commands).values({
        id: envelope.command_id,
        deviceId: d.id,
        ownerId: s.userId,
        key: b.idempotencyKey,
        envelope,
        state: "pending",
        expires: new Date(envelope.expires_at),
      });
    } catch {
      denied(409, "Concurrent idempotency conflict; retry original request");
    }
    await record("command_" + b.action, s.userId, d.id);
    send(d.id, { type: "command", command: envelope });
    return { commandId: envelope.command_id, state: "pending" };
  });
  app.get("/api/devices/:id/events", async (req) => {
    const { d } = await owned(req, (req.params as { id: string }).id);
    const q = z.object({ executionId: z.string().uuid() }).parse(req.query);
    return db
      .select()
      .from(t.events)
      .where(
        and(
          eq(t.events.deviceId, d.id),
          eq(t.events.executionId, q.executionId),
        ),
      )
      .orderBy(sql`length(${t.events.id})`, t.events.id)
      .limit(500);
  });
  app.get(
    "/api/device/socket",
    {
      websocket: true,
      preValidation: async (req) => {
        await deviceAuth(req);
      },
    },
    (socket, req) => {
      let deviceId = "",
        connectionId = "";
      let serial = Promise.resolve();
      const initialized = (async () => {
        const d = await deviceAuth(req);
        deviceId = d.id;
        connectionId = randomUUID();
        live.get(d.id)?.socket.close(4000, "Replaced");
        live.set(d.id, { socket, seen: Date.now(), connection: connectionId });
        await db
          .insert(t.connections)
          .values({ id: connectionId, deviceId: d.id, connected: new Date() });
        send(d.id, { type: "ready", deviceId: d.id });
        const pending = await db
          .select()
          .from(t.commands)
          .where(
            and(
              eq(t.commands.deviceId, d.id),
              eq(t.commands.state, "pending"),
              gt(t.commands.expires, new Date()),
            ),
          );
        for (const c of pending)
          send(d.id, { type: "command", command: c.envelope });
      })();
      void initialized.catch(() =>
        socket.close(4003, "Device initialization rejected"),
      );
      socket.on("message", (raw) => {
        serial = serial
          .then(async () => {
            await initialized;
            const d = await deviceAuth(req);
            if (live.get(d.id)?.connection !== connectionId) return;
            const m = JSON.parse(raw.toString()) as Record<string, unknown>;
            live.get(d.id)!.seen = Date.now();
            await db
              .update(t.devices)
              .set({ lastSeen: new Date() })
              .where(eq(t.devices.id, d.id));
            if (m.type === "snapshot") {
              const snap = remoteSnapshot.parse(m.data);
              await db.transaction(async (tx) => {
                await tx
                  .update(t.devices)
                  .set({ snapshot: snap })
                  .where(eq(t.devices.id, d.id));
                await tx
                  .delete(t.projects)
                  .where(eq(t.projects.deviceId, d.id));
                if (snap.projects.length)
                  await tx
                    .insert(t.projects)
                    .values(
                      snap.projects.map((p) => ({ deviceId: d.id, ...p })),
                    );
              });
            } else if (m.type === "ack") {
              const a = z
                .object({
                  type: z.literal("ack"),
                  commandId: z.string().uuid(),
                  state: z.enum(["accepted", "rejected"]),
                  detail: z.string().max(500),
                })
                .strict()
                .parse(m);
              await db
                .update(t.commands)
                .set({ state: a.state, result: { detail: a.detail } })
                .where(
                  and(
                    eq(t.commands.id, a.commandId),
                    eq(t.commands.deviceId, d.id),
                  ),
                );
            } else if (m.type === "events") {
              const a = z
                .array(
                  z
                    .object({
                      id: z.string().regex(/^\d{1,18}$/),
                      executionId: z.string().uuid(),
                      kind: z.string().max(40),
                      text: z.string().max(8000),
                    })
                    .strict(),
                )
                .max(100)
                .parse(m.events);
              if (a.length)
                await db
                  .insert(t.events)
                  .values(a.map((e) => ({ ...e, deviceId: d.id })))
                  .onConflictDoNothing();
              send(d.id, { type: "events_ack", ids: a.map((e) => e.id) });
            } else if (m.type !== "heartbeat")
              denied(400, "Unknown device message");
          })
          .catch(() => {
            socket.close(4002, "Invalid or unauthorized message");
          });
      });
      socket.on("close", () => {
        void initialized
          .then(async () => {
            if (live.get(deviceId)?.connection === connectionId)
              live.delete(deviceId);
            await db
              .update(t.connections)
              .set({ disconnected: new Date() })
              .where(eq(t.connections.id, connectionId));
          })
          .catch(() => {});
      });
    },
  );
  const timer = setInterval(() => {
    for (const [id, l] of live)
      if (Date.now() - l.seen > 12000) {
        l.socket.close(4001, "Heartbeat expired");
        live.delete(id);
      }
    void db
      .update(t.commands)
      .set({ state: "expired" })
      .where(
        and(
          eq(t.commands.state, "pending"),
          lt(t.commands.expires, new Date()),
        ),
      )
      .catch(() => {});
  }, 3000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    for (const l of live.values()) l.socket.close();
    live.clear();
    await pool.end();
  });
  return app;
}
