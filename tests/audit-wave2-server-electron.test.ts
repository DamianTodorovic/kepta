// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { richtlinienCacheLeeren } from "../src/lib/richtlinien";
import { createApp } from "../server/app";
import { hoerer } from "./helfer/hoerer";

const tempDirs: string[] = [];
const prevEnv: Record<string, string | undefined> = {
  KEPTA_DATA_DIR: process.env.KEPTA_DATA_DIR,
  KEPTA_DB_KEY: process.env.KEPTA_DB_KEY,
  KEPTA_MANAGED_CONFIG: process.env.KEPTA_MANAGED_CONFIG,
  HOME: process.env.HOME,
};

function makeSandboxApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-w2-"));
  tempDirs.push(dir);
  const home = path.join(dir, "home");
  const data = path.join(dir, "data");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(data, { recursive: true });
  const keyHex = crypto.randomBytes(32).toString("hex");
  process.env.HOME = home;
  process.env.KEPTA_DATA_DIR = data;
  process.env.KEPTA_DB_KEY = keyHex;
  delete process.env.KEPTA_MANAGED_CONFIG;
  richtlinienCacheLeeren();

  const keyBytes = Buffer.from(keyHex, "hex");
  const store = new KeptaStore(path.join(data, "memory.db"), {
    ...defaultExtensions(),
    keys: { ablage: "test", keyFor: () => new Uint8Array(keyBytes) },
  });
  const app = createApp(store);
  const srv = hoerer(app);
  const port = (srv.address() as { port: number }).port;
  return { dir, data, store, base: `http://127.0.0.1:${port}` };
}

afterEach(() => {
  vi.unstubAllGlobals();
  richtlinienCacheLeeren();
  for (const [k, v] of Object.entries(prevEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Audit Wave 2: Server Security, SSRF, Rate Limit, Graph & Electron Hardening", () => {
  it("scan/config roundtrips encrypted KEPTA-NEBEN1 values faithfully on GET", async () => {
    const { data, store, base } = makeSandboxApp();
    try {
      const put = await fetch(`${base}/api/scan/config`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roots: [],
          endungen: [".md", ".txt"],
          maxDateiBytes: 512000,
          zusaetzlichAusgelassen: ["custom-secret-dir", "archive-old"],
        }),
      });
      expect(put.status).toBe(200);

      const raw = fs.readFileSync(path.join(data, "scan-config.json"), "utf8");
      expect(raw.startsWith("KEPTA-NEBEN1\n")).toBe(true);

      const get = await fetch(`${base}/api/scan/config`);
      expect(get.status).toBe(200);
      const cfg = (await get.json()) as {
        endungen: string[];
        maxDateiBytes: number;
        zusaetzlichAusgelassen: string[];
      };
      expect(cfg.maxDateiBytes).toBe(512000);
      expect(cfg.zusaetzlichAusgelassen).toEqual(["custom-secret-dir", "archive-old"]);
      expect(cfg.endungen).toEqual([".md", ".txt"]);
    } finally {
      store.close();
    }
  });

  it("/api/models & /api/chat block metadata SSRF targets, enforce MDM chat_cloud=deny, and sanitize internal errors", async () => {
    const { dir, store, base } = makeSandboxApp();
    try {
      const ssrfUrls = [
        "http://169.254.169.254/latest/meta-data/",
        "http://[::ffff:169.254.169.254]/v1",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://user:pass@127.0.0.1:11434/v1",
        "file:///etc/passwd",
      ];
      for (const badUrl of ssrfUrls) {
        const resModels = await fetch(`${base}/api/models`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ protocol: "openai", baseUrl: badUrl, apiKey: "sk-dummy" }),
        });
        expect(resModels.status, `models should reject ${badUrl}`).toBe(400);
        const jm = (await resModels.json()) as { grund?: string };
        expect(["adresse-blockiert", "ungueltige-adresse"]).toContain(jm.grund);

        const resChat = await fetch(`${base}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            protocol: "openai",
            baseUrl: badUrl,
            apiKey: "sk-dummy",
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        expect(resChat.status, `chat should reject ${badUrl}`).toBe(400);
      }

      // MDM chat_cloud = deny must ALSO block /api/models for cloud endpoints
      const managedPath = path.join(dir, "managed.json");
      fs.writeFileSync(managedPath, JSON.stringify({ richtlinien: { chat_cloud: "deny" } }));
      process.env.KEPTA_MANAGED_CONFIG = managedPath;
      richtlinienCacheLeeren();

      const cloudBlocked = await fetch(`${base}/api/models`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ protocol: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "sk-dummy" }),
      });
      expect(cloudBlocked.status).toBe(403);
      const jc = (await cloudBlocked.json()) as { grund?: string };
      expect(jc.grund).toBe("wolke-verboten");

      delete process.env.KEPTA_MANAGED_CONFIG;
      richtlinienCacheLeeren();

      // Sanitized 500 error on unreadable upstream JSON — no internal parser/path string leaked
      const realFetch = globalThis.fetch.bind(globalThis);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: unknown, init?: unknown) => {
          const url = String(input);
          if (url.startsWith("http://127.0.0.1:59991/")) {
            return {
              ok: true,
              status: 200,
              json: async () => {
                throw new SyntaxError("Unexpected token < from /internal/secret/stack");
              },
            } as unknown as Response;
          }
          return realFetch(input as Parameters<typeof realFetch>[0], init as Parameters<typeof realFetch>[1]);
        }),
      );
      const errRes = await fetch(`${base}/api/models`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ protocol: "openai", baseUrl: "http://127.0.0.1:59991/v1", apiKey: "sk-dummy" }),
      });
      expect(errRes.status).toBe(500);
      const jErr = (await errRes.json()) as { error: string; grund: string };
      expect(jErr.grund).toBe("antwort-nicht-lesbar");
      expect(jErr.error).not.toContain("/internal/secret/stack");
      expect(jErr.error).not.toContain("Unexpected token");
    } finally {
      store.close();
    }
  });

  it("applies write rate limiter to POST /api/profile, POST /mcp, POST /api/scan/cancel and POST /api/graph/nachzug/cancel", async () => {
    const { store, base } = makeSandboxApp();
    try {
      // Advance global limiter bucket via 3 GET requests so global remaining < 599
      for (let i = 0; i < 3; i++) {
        const g = await fetch(`${base}/api/profile`);
        expect(g.status).toBe(200);
      }

      const routes: Array<{ path: string; body: unknown; okStatus: number[] }> = [
        { path: "/api/profile", body: { role: "engineer" }, okStatus: [200] },
        { path: "/api/scan/cancel", body: {}, okStatus: [200] },
        { path: "/api/graph/nachzug/cancel", body: {}, okStatus: [200] },
        { path: "/mcp", body: { jsonrpc: "2.0", id: 1, method: "tools/list" }, okStatus: [200] },
      ];
      for (let idx = 0; idx < routes.length; idx++) {
        const r = routes[idx]!;
        const res = await fetch(`${base}${r.path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(r.body),
        });
        expect(r.okStatus).toContain(res.status);
        // Second limiter (`ctx.limiter.write`) resets RateLimit-Remaining to its own independent count (600 - 1 - idx = 599 - idx)
        const remaining = Number(res.headers.get("ratelimit-remaining"));
        expect(remaining, `${r.path} must carry independent write limiter remaining header`).toBe(599 - idx);
      }
    } finally {
      store.close();
    }
  });

  it("/api/graph batches entity memory lookups accurately via memoryIdsByEntity", async () => {
    const { store, base } = makeSandboxApp();
    try {
      const m1 = store.createMemory({ title: "Note One", content: "[[AlphaNode]] links [[BetaNode]]" });
      const m2 = store.createMemory({ title: "Note Two", content: "[[BetaNode]] details" });
      store.linkEntities(m1.id, ["AlphaNode", "BetaNode"]);
      store.linkEntities(m2.id, ["BetaNode"]);
      store.addRelation("AlphaNode", "links_to", "BetaNode", m1.id);

      const res = await fetch(`${base}/api/graph?depth=2`);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-kepta-teilzeiten")).toContain("begriffsmemorien=");
      const data = (await res.json()) as { memoriesByEntity: Record<string, string[]> };
      const byLower = Object.fromEntries(
        Object.entries(data.memoriesByEntity).map(([k, v]) => [k.toLowerCase(), v]),
      );
      expect(byLower.alphanode).toEqual([m1.id]);
      expect(new Set(byLower.betanode)).toEqual(new Set([m1.id, m2.id]));
    } finally {
      store.close();
    }
  });

  it("electron.js blocks data:text/html navigation, restricts shell.openExternal to http/https, and index.html avoids inline scripts for CSP", () => {
    const root = process.cwd();
    const electronSrc = fs.readFileSync(path.join(root, "electron.js"), "utf8");
    const htmlSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");

    expect(electronSrc).not.toMatch(/isAllowedUrl[\s\S]{0,220}data:text\/html/);
    expect(electronSrc).toMatch(/if\s*\(u\.protocol\s*===\s*['"]data:['"]\)\s*return\s*false;/);
    expect(electronSrc).toContain("openExternalSafe");
    expect(electronSrc).toMatch(/u\.protocol\s*===\s*['"]http:['"]\s*\|\|\s*u\.protocol\s*===\s*['"]https:['"]/);

    expect(htmlSrc).toMatch(/<script\b[^>]*\bsrc=["']\/theme-init\.js["']/);
    // Any remaining <script> tag must have a src attribute and empty body
    const scriptTags = [...htmlSrc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    expect(scriptTags.length).toBeGreaterThanOrEqual(2);
    for (const [, attrs, body] of scriptTags) {
      expect(attrs).toMatch(/\bsrc=/i);
      expect(body!.trim()).toBe("");
    }
    const themeInit = fs.readFileSync(path.join(root, "public", "theme-init.js"), "utf8");
    expect(themeInit).toContain("theme-werkbank");
  });
});
