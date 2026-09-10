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
});
