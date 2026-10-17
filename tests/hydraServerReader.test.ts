// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/hydraServerReader.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// Real HTTP tests: a real node:http server standing in for
// HYDRA-UMC-SERVER's own GET /api/settings (same real shape
// HYDRA-UMC-TOOL-CLI's own robots.go and server_test.go already expect),
// and a real HydraServerMachineReader making a real fetch() against it -
// not a mocked reader or a hand-built RawReading. Closes the
// finding that this repo's only MachineReader was ever the fixture one.
// =============================================================================

import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { HydraServerMachineReader } from "../src/hydraServerReader.js";

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

async function serveSettings(body: unknown, status = 200): Promise<string> {
  server = createServer((req, res) => {
    if (req.url !== "/api/settings") {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  });
  const port = await new Promise<number>((resolve) => {
    server!.listen(0, "127.0.0.1", () => resolve((server!.address() as any).port));
  });
  return `http://127.0.0.1:${port}`;
}

const settingsWith = (robots: unknown[]) => ({ controllers: [{ id: "localhost", name: "Master", robots }] });

describe("HydraServerMachineReader - real HTTP against a real /api/settings shape", () => {
  it("reports AVAILABLE/ACTIVE for a real robot that is online and playing", async () => {
    const baseUrl = await serveSettings(settingsWith([{ id: 1, online: true, playbackState: { isPlaying: true, isPaused: false } }]));
    const reader = new HydraServerMachineReader({ baseUrl });

    const readings = await reader.read();
    const avail = readings.find((r) => r.id === "avail");
    const execution = readings.find((r) => r.id === "execution");
    expect(avail?.value).toBe("AVAILABLE");
    expect(execution?.value).toBe("ACTIVE");
  });

  it("reports UNAVAILABLE for a real robot that is offline, regardless of its own playbackState", async () => {
    const baseUrl = await serveSettings(settingsWith([{ id: 1, online: false, playbackState: { isPlaying: true } }]));
    const reader = new HydraServerMachineReader({ baseUrl });

    const readings = await reader.read();
    expect(readings.find((r) => r.id === "avail")?.value).toBe("UNAVAILABLE");
  });

  it("reports INTERRUPTED for a real paused-mid-program robot", async () => {
    const baseUrl = await serveSettings(settingsWith([{ id: 1, online: true, playbackState: { isPlaying: true, isPaused: true } }]));
    const reader = new HydraServerMachineReader({ baseUrl });

    expect((await reader.read()).find((r) => r.id === "execution")?.value).toBe("INTERRUPTED");
  });

  it("reports STOPPED for a real robot that finished its own program", async () => {
    const baseUrl = await serveSettings(settingsWith([{ id: 1, online: true, playbackState: { isPlaying: false, isFinished: true } }]));
    const reader = new HydraServerMachineReader({ baseUrl });

    expect((await reader.read()).find((r) => r.id === "execution")?.value).toBe("STOPPED");
  });

  it("reports READY for a real robot with no playbackState yet (never commanded)", async () => {
    const baseUrl = await serveSettings(settingsWith([{ id: 1, online: true }]));
    const reader = new HydraServerMachineReader({ baseUrl });

    expect((await reader.read()).find((r) => r.id === "execution")?.value).toBe("READY");
  });

  it("honestly reports no real spindle_temp data - no sensor exists for it yet", async () => {
    const baseUrl = await serveSettings(settingsWith([{ id: 1, online: true }]));
    const reader = new HydraServerMachineReader({ baseUrl });

    const spindleTemp = (await reader.read()).find((r) => r.id === "spindle_temp");
    expect(spindleTemp?.value).toBeNull();
  });

  it("selects a specific robotId out of a real multi-robot roster when configured", async () => {
    const baseUrl = await serveSettings(
      settingsWith([
        { id: 1, online: false },
        { id: 2, online: true, playbackState: { isPlaying: true } },
      ]),
    );
    const reader = new HydraServerMachineReader({ baseUrl, robotId: 2 });

    expect((await reader.read()).find((r) => r.id === "avail")?.value).toBe("AVAILABLE");
  });

  it("defaults to the first robot in the real roster when robotId is not configured", async () => {
    const baseUrl = await serveSettings(
      settingsWith([
        { id: 5, online: true },
        { id: 6, online: false },
      ]),
    );
    const reader = new HydraServerMachineReader({ baseUrl });

    expect((await reader.read()).find((r) => r.id === "avail")?.value).toBe("AVAILABLE");
  });

  it("throws a real, honest error when the configured robotId does not exist in a reachable server's roster", async () => {
    const baseUrl = await serveSettings(settingsWith([{ id: 1, online: true }]));
    const reader = new HydraServerMachineReader({ baseUrl, robotId: 99 });

    await expect(reader.read()).rejects.toThrow(/no robot with id 99/);
  });

  it("throws a real, honest error when a reachable server's roster has no robots at all", async () => {
    const baseUrl = await serveSettings(settingsWith([]));
    const reader = new HydraServerMachineReader({ baseUrl });

    await expect(reader.read()).rejects.toThrow(/no robots registered/);
  });

  it("throws when the real server responds with a non-2xx status", async () => {
    const baseUrl = await serveSettings({ error: "boom" }, 500);
    const reader = new HydraServerMachineReader({ baseUrl });

    await expect(reader.read()).rejects.toThrow(/HTTP 500/);
  });

  it("throws a real connection error when nothing is listening - CachedReader turns this into SourceUnavailableError", async () => {
    // Port 1 is a real, universally-unassigned low port nothing binds to
    // in this test environment - a real connection refusal, not simulated.
    const reader = new HydraServerMachineReader({ baseUrl: "http://127.0.0.1:1" });
    await expect(reader.read()).rejects.toThrow();
  });

  it("times out instead of hanging forever against a real server that accepts the connection but never responds", async () => {
    // Real regression: read() used to call fetch() with no timeout/signal
    // at all - a HYDRA-UMC-SERVER that accepted the TCP connection but
    // never wrote a response left this adapter's own poll loop stuck
    // waiting indefinitely on one read().
    server = createServer(() => {
      // Deliberately never calls res.end()/res.writeHead().
    });
    const port = await new Promise<number>((resolve) => {
      server!.listen(0, "127.0.0.1", () => resolve((server!.address() as any).port));
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    const reader = new HydraServerMachineReader({ baseUrl, requestTimeoutMs: 50 });

    const start = Date.now();
    await expect(reader.read()).rejects.toThrow(/did not respond within 50ms/);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

// HYDRA-UMC-SERVER only answers GET /api/settings to a logged-in account (an
// anonymous request gets 401 "No token provided"); a reader that sent no
// credential at all could never read the real roster.
describe("HydraServerMachineReader - the credential HYDRA-UMC-SERVER requires", () => {
  const GOOD = "session-token-1";
  let loginCount = 0;
  let validTokens: Set<string>;

  async function serveGuarded(): Promise<string> {
    loginCount = 0;
    validTokens = new Set([GOOD]);
    server = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/login" && req.method === "POST") {
        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => {
          const { username, password } = JSON.parse(raw || "{}");
          if (username !== "operator" || password !== "right-password") {
            res.writeHead(401).end(JSON.stringify({ error: "Invalid credentials" }));
            return;
          }
          loginCount += 1;
          const token = `login-token-${loginCount}`;
          validTokens.add(token);
          res.writeHead(200).end(JSON.stringify({ success: true, token }));
        });
        return;
      }
      if (req.url !== "/api/settings") {
        res.writeHead(404).end();
        return;
      }
      const header = req.headers.authorization ?? "";
      if (!header) {
        res.writeHead(401).end(JSON.stringify({ error: "Access denied: No token provided" }));
        return;
      }
      if (!validTokens.has(header.replace(/^Bearer /, ""))) {
        res.writeHead(403).end(JSON.stringify({ error: "Access denied: invalid token" }));
        return;
      }
      res.writeHead(200).end(JSON.stringify(settingsWith([{ id: 1, online: true, playbackState: { isPlaying: true } }])));
    });
    const port = await new Promise<number>((resolve) => {
      server!.listen(0, "127.0.0.1", () => resolve((server!.address() as any).port));
    });
    return `http://127.0.0.1:${port}`;
  }

  it("is refused, and says what to set, when no credential is configured", async () => {
    const baseUrl = await serveGuarded();
    await expect(new HydraServerMachineReader({ baseUrl }).read()).rejects.toThrow(/HYDRA_UMC_SERVER_TOKEN/);
  });

  it("reads the roster with a token the server already issued", async () => {
    const baseUrl = await serveGuarded();
    const readings = await new HydraServerMachineReader({ baseUrl, token: GOOD }).read();
    expect(readings.find((r) => r.id === "execution")?.value).toBe("ACTIVE");
    expect(loginCount).toBe(0);
  });

  it("is refused with a wrong token and does not try to log in without an account", async () => {
    const baseUrl = await serveGuarded();
    await expect(new HydraServerMachineReader({ baseUrl, token: "nope" }).read()).rejects.toThrow(/refused the credential/);
    expect(loginCount).toBe(0);
  });

  it("logs in with an account and reuses the session for the next reads", async () => {
    const baseUrl = await serveGuarded();
    const reader = new HydraServerMachineReader({ baseUrl, username: "operator", password: "right-password" });
    expect((await reader.read()).find((r) => r.id === "avail")?.value).toBe("AVAILABLE");
    await reader.read();
    expect(loginCount).toBe(1);
  });

  it("logs in again, once, when the session it holds has expired", async () => {
    const baseUrl = await serveGuarded();
    const reader = new HydraServerMachineReader({ baseUrl, username: "operator", password: "right-password" });
    await reader.read();
    validTokens.clear(); // the server forgot the session (expiry, restart, revocation)
    await reader.read();
    expect(loginCount).toBe(2);
  });

  it("reports a refused login instead of retrying forever", async () => {
    const baseUrl = await serveGuarded();
    const reader = new HydraServerMachineReader({ baseUrl, username: "operator", password: "wrong" });
    await expect(reader.read()).rejects.toThrow(/refused the login/);
    expect(loginCount).toBe(0);
  });

  it("refuses a response larger than the cap", async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ controllers: [], padding: "x".repeat(5 * 1024 * 1024) }));
    });
    const port = await new Promise<number>((resolve) => {
      server!.listen(0, "127.0.0.1", () => resolve((server!.address() as any).port));
    });
    await expect(new HydraServerMachineReader({ baseUrl: `http://127.0.0.1:${port}` }).read()).rejects.toThrow(/larger than/);
  });
});
