import { test, expect } from "@playwright/test";
import agents from "../../packages/shared/default-agents.json";

test("project flow shows nodes, links an Antigravity session, and lists the day timeline", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((roster) => {
    const now = new Date().toISOString();
    const project = {
      id: "p1",
      name: "Web shop",
      goal: "ขายของออนไลน์",
      path: "C:\\Work\\web",
      isGit: true,
      createdAt: now,
      folders: [
        {
          id: "f1",
          path: "C:\\Work\\web",
          repoRoot: "C:\\Work\\web",
          isGit: true,
          isPrimary: true,
          position: 0,
          exists: true,
        },
      ],
    };
    const sessions = [
      {
        agent: "claude",
        id: "c1",
        title: "Fix checkout",
        cwd: "C:\\Work\\web",
        updatedAt: now,
        projectId: "p1",
        link: "auto",
      },
      {
        agent: "antigravity",
        id: "g1",
        title: "Plan payments",
        cwd: null,
        updatedAt: now,
        projectId: null as string | null,
        link: null as string | null,
      },
    ];
    const fixture = globalThis as unknown as {
      isTauri: boolean;
      fixtureCalls: { cmd: string; args: Record<string, unknown> }[];
      __TAURI_INTERNALS__: {
        invoke: (
          cmd: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      };
    };
    fixture.isTauri = true;
    fixture.fixtureCalls = [];
    fixture.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        fixture.fixtureCalls.push({ cmd, args });
        if (cmd === "snapshot")
          return structuredClone({
            agents: roster,
            projects: [project],
            executions: [],
            tasks: [
              {
                id: "t1",
                projectId: "p1",
                agentId: "scout",
                adapter: "codex",
                title: "SCOUT — review",
                prompt: "",
                dependencies: [],
                priority: 50,
                timeoutSeconds: 300,
                retryLimit: 2,
                attempts: 1,
                status: "completed",
                workflowId: "w1",
                step: "review",
                gate: false,
                approved: true,
                createdAt: now,
                lastExecutionId: null,
                blocker: null,
              },
            ],
            workflows: [],
            schedulerPaused: true,
            dataPath: "FIXTURE_ONLY",
            remoteStatus: "not_configured",
          });
        if (cmd === "remote_status")
          return {
            connection: "not_configured",
            deviceId: null,
            server: null,
            shared: [],
          };
        if (cmd === "diagnostics") return [];
        if (cmd === "project_overview")
          return structuredClone({
            since: new Date(Date.now() - 7 * 864e5).toISOString(),
            sessions,
            commits: [
              {
                projectId: "p1",
                hash: "abc1234def",
                author: "Dev",
                at: now,
                subject: "Add cart page",
              },
            ],
            events: [],
          });
        if (cmd === "link_session") {
          const s = sessions.find((item) => item.id === args.sessionId);
          if (s)
            Object.assign(s, { projectId: args.projectId, link: "manual" });
          return null;
        }
        throw new Error(`Unsupported fixture command: ${cmd}`);
      },
    };
  }, agents);

  await page.goto("/?view=console&page=projects");
  const flow = page.getByLabel("Project flow");
  await expect(
    flow.getByRole("button", { name: /Project Web shop/ }),
  ).toBeVisible();
  await expect(
    flow.getByRole("button", { name: /Agent project Claude Code 1/ }),
  ).toBeVisible();
  await expect(
    flow.getByRole("button", { name: /Git repo 1 commit/ }),
  ).toBeVisible();
  await expect(
    flow.getByRole("button", { name: /Audit ผ่าน 1/ }),
  ).toBeVisible();

  await flow.getByRole("button", { name: /Agent project/ }).click();
  await page.getByRole("button", { name: "ผูกกับ Web shop" }).click();
  await expect(
    flow.getByRole("button", { name: /Claude Code 1 · Antigravity 1/ }),
  ).toBeVisible();
  const calls = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          fixtureCalls: { cmd: string; args: unknown }[];
        }
      ).fixtureCalls,
  );
  expect(calls.find((c) => c.cmd === "link_session")?.args).toEqual({
    agent: "antigravity",
    sessionId: "g1",
    projectId: "p1",
  });

  const timeline = page.locator(".timeline");
  await expect(timeline).toContainText("Add cart page");
  await expect(timeline).toContainText("Plan payments");
  await page.getByRole("button", { name: "โหลดย้อนหลังอีก 7 วัน" }).click();
  await expect(page.getByText("14 วันล่าสุด")).toBeVisible();
  expect(errors).toEqual([]);
});
