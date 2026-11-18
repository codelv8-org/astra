import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { createServer } from "../src/server.js";
import { migrate } from "../src/migrate.js";
import { database } from "../src/db.js";
import { users } from "../src/schema.js";
import { passwordHash } from "../src/auth.js";

test(
  "real PostgreSQL → HTTPS/Web → WSS → Windows Core execution and reconciliation",
  { timeout: 240000 },
  async () => {
    const repo = resolve("../..");
    const dev = resolve(repo, ".local/phase3-dev");
    const config = JSON.parse(
      await readFile(resolve(dev, "config.json"), "utf8"),
    ) as { databaseUrl: string };
    await migrate(config.databaseUrl);
    const { db, pool } = database(config.databaseUrl);
    const name = "uat-" + randomUUID();
    const password = randomUUID() + randomUUID();
    await db
      .insert(users)
      .values({ id: randomUUID(), name, password: passwordHash(password) });
    await pool.end();
    const origin = "https://127.0.0.1:7444",
      base = "https://127.0.0.1:7443";
    const app = await createServer({
      databaseUrl: config.databaseUrl,
      origin,
      tls: {
        key: await readFile(resolve(dev, "tls.key")),
        cert: await readFile(resolve(dev, "tls.crt")),
      },
    });
    await app.listen({ host: "127.0.0.1", port: 7443 });
    let cookie = "",
      csrf = "";
    const request = async (
      path: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ) => {
      const r = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          cookie,
          origin,
          "x-csrf-token": csrf,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: r.status,
        data: await r.json(),
        cookie: r.headers.get("set-cookie"),
      };
    };
    const wait = async <T>(
      f: () => Promise<T>,
      check: (v: T) => boolean,
      ms = 25000,
    ) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const v = await f();
        if (check(v)) return v;
        await new Promise((r) => setTimeout(r, 400));
      }
      throw Error("Timed out waiting for verified state");
    };
    let host: ReturnType<typeof spawn> | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    let root = "";
    let stderr = "";
    try {
      assert.equal((await request("/api/devices")).status, 401);
      assert.equal(
        (
          await request(
            "/api/login",
            { name, password },
            { origin: "https://evil.invalid" },
          )
        ).status,
        403,
      );
      assert.equal(
        (await request("/api/login", { name, password: "wrong" })).status,
        401,
      );
      const login = await request("/api/login", { name, password });
      assert.equal(login.status, 200);
      cookie = login.cookie!.split(";")[0];
      csrf = login.data.csrf;
      assert.equal(
        (await request("/api/pairings", {}, { "x-csrf-token": "wrong" }))
          .status,
        403,
      );
      const pairing = await request("/api/pairings", {});
      assert.equal(pairing.status, 200);
      root = resolve(dev, "e2e-" + randomUUID());
      await mkdir(root, { recursive: true });
      host = spawn(resolve(repo, "target/debug/examples/remote_host.exe"), [], {
        cwd: repo,
        windowsHide: true,
        env: {
          ...process.env,
          CREWNEST_REMOTE_TEST_ROOT: root,
          CREWNEST_REMOTE_TEST_SERVER: base,
          CREWNEST_REMOTE_TEST_CA: resolve(dev, "tls.crt"),
          CREWNEST_REMOTE_TEST_CODE: pairing.data.code,
          CREWNEST_REMOTE_TEST_CODEX: "1",
        },
      });
      host.stderr?.on("data", (d) => {
        stderr += d.toString();
      });
      const info = await wait(
        async () => {
          try {
            return JSON.parse(
              await readFile(resolve(root, "ready.json"), "utf8"),
            );
          } catch {
            return null;
          }
        },
        (v) => !!v,
        45000,
      );
      assert.ok(info, stderr);
      const device = async () => {
        const r = await request("/api/devices");
        assert.equal(r.status, 200);
        return r.data.find((d: { id: string }) => d.id === info.deviceId);
      };
      await wait(device, (d) => d?.online && d.snapshot.projects.length === 1);
      assert.equal(
        (
          await request("/api/device/pair", {
            code: pairing.data.code,
            name: "replay",
          })
        ).status,
        401,
      );
      assert.equal((await request("/api/device/socket")).status, 403);
      const [otherName, otherPassword] = [
        "other-" + randomUUID(),
        randomUUID() + randomUUID(),
      ];
      const other = database(config.databaseUrl);
      await other.db.insert(users).values({
        id: randomUUID(),
        name: otherName,
        password: passwordHash(otherPassword),
      });
      await other.pool.end();
      const saved = { cookie, csrf };
      const otherLogin = await request("/api/login", {
        name: otherName,
        password: otherPassword,
      });
      cookie = otherLogin.cookie!.split(";")[0];
      csrf = otherLogin.data.csrf;
      assert.equal(
        (await request(`/api/devices/${info.deviceId}/commands`)).status,
        404,
      );
      ({ cookie, csrf } = saved);
      browser = await chromium.launch({ channel: "chrome" });
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByLabel("ชื่อผู้ใช้").fill(name);
      await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
      await page
        .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
        .click();
      await page.getByRole("button", { name: /E2E Windows Core/ }).click();
      await page
        .getByRole("button", { name: "＋ ส่งงานใหม่", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Task title").fill("REMOTE MOCK SUCCESS");
      await dialog
        .getByLabel("Task prompt")
        .fill("MOCK test only. Never report real AI output.");
      await dialog
        .getByRole("button", { name: "ส่ง draft", exact: true })
        .click();
      let d = await wait(device, (d) =>
        d.snapshot.tasks.some(
          (t: { title: string }) => t.title === "REMOTE MOCK SUCCESS",
        ),
      );
      const task = d.snapshot.tasks.find(
        (t: { title: string }) => t.title === "REMOTE MOCK SUCCESS",
      );
      const send = async (
        action: string,
        taskId = task.id,
        projectId = info.projectId,
        key = randomUUID(),
        payload?: unknown,
      ) =>
        request(`/api/devices/${info.deviceId}/commands`, {
          action,
          taskId,
          projectId,
          idempotencyKey: key,
          ...(payload ? { payload } : {}),
        });
      const ack = async (id: string, state: string) =>
        wait(
          async () =>
            (await request(`/api/devices/${info.deviceId}/commands`)).data,
          (rows) =>
            rows.some(
              (c: { id: string; state: string }) =>
                c.id === id && c.state === state,
            ),
        );
      const rejected = await send("start");
      assert.equal(rejected.status, 200);
      await ack(rejected.data.commandId, "rejected");
      assert.equal((await device()).snapshot.executions.length, 0);
      assert.equal((await send("shell")).status, 400);
      assert.equal(
        (
          await send("submit", randomUUID(), randomUUID(), randomUUID(), {
            agentId: "astra",
            adapter: "mock",
            title: "deny",
            prompt: "deny",
          })
        ).status,
        403,
      );
      await writeFile(resolve(root, "control.txt"), "approve");
      await wait(
        device,
        (d) =>
          d.snapshot.tasks.find((t: { id: string }) => t.id === task.id)
            ?.approved === true,
      );
      const key = randomUUID();
      const start = await send("start", task.id, info.projectId, key);
      await ack(start.data.commandId, "accepted");
      const duplicate = await send("start", task.id, info.projectId, key);
      assert.equal(duplicate.data.commandId, start.data.commandId);
      assert.equal(
        (await send("cancel", task.id, info.projectId, key)).status,
        409,
      );
      d = await wait(
        device,
        (d) =>
          d.snapshot.tasks.find((t: { id: string }) => t.id === task.id)
            ?.status === "completed",
        30000,
      );
      assert.equal(
        d.snapshot.executions.filter(
          (e: { taskId: string }) => e.taskId === task.id,
        ).length,
        1,
      );
      const runId = d.snapshot.tasks.find(
        (t: { id: string }) => t.id === task.id,
      ).lastExecutionId;
      const logs = await wait(
        async () =>
          (
            await request(
              `/api/devices/${info.deviceId}/events?executionId=${runId}`,
            )
          ).data,
        (v) => v.some((e: { kind: string }) => e.kind === "artifact"),
      );
      assert.match(JSON.stringify(logs), /MOCK/);
      assert.doesNotMatch(JSON.stringify(d), /workspace|\\\\|C:\\|D:\\/);
      await page
        .getByRole("button", { name: "Logs", exact: true })
        .first()
        .click();
      await page
        .getByRole("log")
        .getByText(/MOCK handoff artifact/)
        .waitFor();
      await page
        .locator(".task")
        .filter({ hasText: "REMOTE MOCK SUCCESS" })
        .getByText(/MOCK.*completed/)
        .waitFor();
      await page.screenshot({
        path: resolve(root, "web-desktop.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 375, height: 850 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.screenshot({
        path: resolve(root, "web-mobile.png"),
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.getByRole("button", { name: "สลับ theme" }).click();
      await page.screenshot({
        path: resolve(root, "web-mobile-light.png"),
        fullPage: true,
      });
      const cancelTask = randomUUID();
      const sub = await send(
        "submit",
        cancelTask,
        info.projectId,
        randomUUID(),
        {
          agentId: "astra",
          adapter: "mock",
          title: "REMOTE CANCEL",
          prompt: "MOCK cancellation only",
        },
      );
      await ack(sub.data.commandId, "accepted");
      await writeFile(resolve(root, "control.txt"), "approve");
      await wait(
        device,
        (d) =>
          d.snapshot.tasks.find((t: { id: string }) => t.id === cancelTask)
            ?.approved,
      );
      const started = await send("start", cancelTask);
      await ack(started.data.commandId, "accepted");
      const canceled = await send("cancel", cancelTask);
      await ack(canceled.data.commandId, "accepted");
      await wait(
        device,
        (d) =>
          d.snapshot.tasks.find((t: { id: string }) => t.id === cancelTask)
            ?.status === "canceled",
      );
      const pause = await send("pause_scheduling");
      await ack(pause.data.commandId, "accepted");
      assert.equal((await device()).snapshot.schedulerPaused, true);
      await writeFile(resolve(root, "control.txt"), "disconnect");
      await wait(device, (d) => !d.online);
      assert.equal((await send("status")).status, 409);
      await writeFile(resolve(root, "control.txt"), "connect");
      await wait(device, (d) => d.online);
      assert.equal(
        (await device()).snapshot.executions.filter(
          (e: { taskId: string }) => e.taskId === task.id,
        ).length,
        1,
      );
      assert.equal(
        info.codex?.authentication,
        "authenticated",
        "Real Codex must authenticate; do not substitute Mock",
      );
      const realTask = randomUUID();
      const realSub = await send(
        "submit",
        realTask,
        info.projectId,
        randomUUID(),
        {
          agentId: "astra",
          adapter: "codex",
          title: "REMOTE CODEX REAL",
          prompt:
            "Reply exactly CREWNEST_REMOTE_CODEX_OK. Do not call tools, run commands or inspect files. This verifies real local execution over the approved remote workflow.",
        },
      );
      await ack(realSub.data.commandId, "accepted");
      await writeFile(resolve(root, "control.txt"), "approve");
      await wait(
        device,
        (d) =>
          d.snapshot.tasks.find((t: { id: string }) => t.id === realTask)
            ?.approved,
      );
      const realStart = await send("start", realTask);
      await ack(realStart.data.commandId, "accepted");
      d = await wait(
        device,
        (d) =>
          d.snapshot.tasks.find((t: { id: string }) => t.id === realTask)
            ?.status === "completed",
        60000,
      );
      const realRun = d.snapshot.tasks.find(
        (t: { id: string }) => t.id === realTask,
      ).lastExecutionId;
      await wait(
        async () =>
          (
            await request(
              `/api/devices/${info.deviceId}/events?executionId=${realRun}`,
            )
          ).data,
        (v) =>
          v.some((e: { text: string }) =>
            e.text.includes("CREWNEST_REMOTE_CODEX_OK"),
          ),
      );
      assert.equal(
        (await request(`/api/devices/${info.deviceId}/revoke`, {})).status,
        200,
      );
      await wait(device, (d) => d.revoked && !d.online);
      assert.equal((await send("status")).status, 403);
      await page
        .getByRole("button", { name: "ออกจากระบบ", exact: true })
        .click();
      await page
        .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
        .waitFor();
      const summary = {
        deviceId: info.deviceId,
        projectId: info.projectId,
        mockRun: runId,
        realCodexRun: realRun,
        checks: [
          "session/CSRF/owner isolation",
          "single-use pairing",
          "Credential Manager roundtrip",
          "real HTTPS/WSS",
          "local approval required",
          "one Mock execution despite duplicate command",
          "real Mock logs",
          "mobile/light/reduced-motion",
          "cancel",
          "pause",
          "offline rejection/reconnect",
          "real Codex execution/logs",
          "revoke",
          "Web logout",
        ],
        root,
      };
      await writeFile(
        resolve(root, "result.json"),
        JSON.stringify(summary, null, 2),
      );
      console.log("REMOTE E2E PASSED " + JSON.stringify(summary));
    } finally {
      if (root && host && host.exitCode === null) {
        await writeFile(resolve(root, "control.txt"), "stop");
        await new Promise<void>((r) => {
          host!.once("exit", () => r());
          setTimeout(r, 5000);
        });
        if (host.exitCode === null) host.kill();
      }
      await browser?.close();
      await app.close();
      if (stderr) console.log("HOST diagnostics: " + stderr.slice(0, 1000));
    }
  },
);
