// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/observations.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// The observation buffer, and the loop every MTConnect client runs:
// /current once, then /sample?from=<nextSequence> for ever. Also what a
// deployment with no machine source reports, the demonstration mode, the
// environment settings and the HYDRA-UMC-SERVER reader's size cap.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, readIntegerEnv, resolveListenPortOf, resolvePort } from "../src/server.js";
import { ObservationBuffer } from "../src/buffer.js";
import { HydraServerMachineReader, readJsonCapped } from "../src/hydraServerReader.js";
import type { MachineReader } from "../src/reader.js";
import type { RawReading } from "../src/dataitem.js";

beforeEach(() => {
  delete process.env.HYDRA_UMC_SERVER_URL;
  delete process.env.HYDRA_UMC_MTCONNECT_DEMO;
});
afterEach(() => {
  delete process.env.HYDRA_UMC_MTCONNECT_DEMO;
});

describe("ObservationBuffer", () => {
  const obs = (id: string, value: string) => ({ id, category: "EVENT" as const, type: "EXECUTION", value, timestampMs: 1 });

  it("gives every observation its own increasing sequence number", () => {
    const buffer = new ObservationBuffer(10);
    expect(buffer.record(obs("a", "1"))?.sequence).toBe(1);
    expect(buffer.record(obs("b", "1"))?.sequence).toBe(2);
    expect(buffer.record(obs("a", "2"))?.sequence).toBe(3);
    expect([buffer.firstSequence, buffer.lastSequence, buffer.nextSequence]).toEqual([1, 3, 4]);
  });

  it("records changes only: the same value again is not a new observation", () => {
    const buffer = new ObservationBuffer(10);
    buffer.record(obs("a", "1"));
    expect(buffer.record(obs("a", "1"))).toBeNull();
    expect(buffer.lastSequence).toBe(1);
  });

  it("keeps the newest observations and reports the range it really holds", () => {
    const buffer = new ObservationBuffer(3);
    for (let i = 0; i < 5; i++) buffer.record(obs("a", String(i)));
    expect([buffer.firstSequence, buffer.lastSequence]).toEqual([3, 5]);
    expect(buffer.since(3, 100).observations.map((o) => o.sequence)).toEqual([3, 4, 5]);
    // the latest value of a DataItem is still known after its observation was evicted
    buffer.record(obs("other", "x"));
    expect(buffer.current().map((o) => o.id)).toEqual(["a", "other"]);
  });

  it("returns at most `count` observations and continues right after the last one returned", () => {
    const buffer = new ObservationBuffer(10);
    for (let i = 0; i < 6; i++) buffer.record(obs("a", String(i)));
    const page = buffer.since(2, 3);
    expect(page.observations.map((o) => o.sequence)).toEqual([2, 3, 4]);
    expect(page.nextSequence).toBe(5);
    expect(buffer.since(7, 3)).toEqual({ observations: [], nextSequence: 7 });
  });
});

describe("the client loop: /current, then /sample?from=<nextSequence>", () => {
  it("receives every change exactly once and never loses one", async () => {
    let value = 10;
    const reader: MachineReader = {
      read: async () => [{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value, timestampMs: Date.now() }],
    };
    const app = buildApp({ reader, minPollIntervalMs: 0 });

    const current = await request(app).get("/current");
    let next = Number(current.text.match(/nextSequence="(\d+)"/)?.[1]);
    const seen: string[] = [];
    for (const v of [11, 12, 13, 14]) {
      value = v;
      const sample = await request(app).get(`/sample?from=${next}`);
      for (const match of sample.text.matchAll(/<Temperature [^>]*sequence="(\d+)"[^>]*>([^<]*)</g)) seen.push(`${match[1]}:${match[2]}`);
      next = Number(sample.text.match(/nextSequence="(\d+)"/)?.[1]);
    }
    expect(seen.map((s) => s.split(":")[1])).toEqual(["11", "12", "13", "14"]);
    const sequences = seen.map((s) => Number(s.split(":")[0]));
    expect(new Set(sequences).size).toBe(4);
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
  });

  it("does not repeat an unchanged value", async () => {
    const reader: MachineReader = {
      read: async () => [{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value: 30, timestampMs: Date.now() }],
    };
    const app = buildApp({ reader, minPollIntervalMs: 0 });
    const first = await request(app).get("/current");
    const next = first.text.match(/nextSequence="(\d+)"/)?.[1];
    await request(app).get("/current");
    await request(app).get("/current");
    const sample = await request(app).get(`/sample?from=${next}`);
    expect(sample.text).not.toContain("<DeviceStream");
  });

  it("pages with count and continues where the page ended", async () => {
    const app = buildApp({ reader: { read: async () => [] } });
    const page1 = await request(app).get("/sample?from=1&count=2");
    expect(page1.text.match(/<[A-Za-z]+ dataItemId=/g)).toHaveLength(2);
    expect(page1.text).toContain('nextSequence="3"');
    const page2 = await request(app).get("/sample?from=3&count=2");
    expect(page2.text.match(/<[A-Za-z]+ dataItemId=/g)).toHaveLength(2);
    expect(page2.text).toContain('nextSequence="5"');
  });

  it("answers OUT_OF_RANGE for a sequence this agent has not produced, and rejects a bad count", async () => {
    const app = buildApp({ reader: { read: async () => [] } });
    expect((await request(app).get("/sample?from=500")).text).toContain("OUT_OF_RANGE");
    expect((await request(app).get("/sample?count=0")).text).toContain("INVALID_REQUEST");
    expect((await request(app).get("/sample?count=abc")).text).toContain("INVALID_REQUEST");
    expect((await request(app).get("/sample?count=5000")).text).toContain("OUT_OF_RANGE");
  });

  it("advertises the buffer size it really has", async () => {
    const res = await request(buildApp({ reader: { read: async () => [] }, bufferSize: 50 })).get("/current");
    expect(res.text).toContain('bufferSize="50"');
  });
});

describe("what is served when nothing real is behind it", () => {
  it("reports every DataItem as UNAVAILABLE when no machine source is configured", async () => {
    const res = await request(buildApp()).get("/current");
    expect(res.text).toMatch(/<Execution [^>]*>UNAVAILABLE</);
    expect(res.text).toMatch(/<Availability dataItemId="avail"[^>]*>UNAVAILABLE</);
    expect(res.text).toMatch(/<Temperature [^>]*>UNAVAILABLE</);
    expect(res.text).not.toContain(">READY<");
    expect(res.text).not.toContain(">140<");
  });

  it("serves synthetic values only on request, and says so in the device model", async () => {
    process.env.HYDRA_UMC_MTCONNECT_DEMO = "1";
    const app = buildApp();
    const current = await request(app).get("/current");
    expect(current.text).toContain(">READY<");
    const probe = await request(app).get("/probe");
    expect(probe.text).toContain("DEMONSTRATION DATA");
    expect(probe.text).toContain('uuid="hydra-umc-node-demo"');
  });

  it("describes the agent itself with its own DeviceStream", async () => {
    const res = await request(buildApp()).get("/current");
    expect(res.text).toContain('<DeviceStream name="Agent" uuid="hydra-umc-mtconnect-adapter">');
    expect(res.text).toMatch(/<Availability dataItemId="agent_avail"[^>]*>AVAILABLE</);
  });

  it("does not announce the framework", async () => {
    const res = await request(buildApp()).get("/probe");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("environment settings", () => {
  it("rejects a value that is set but not a non-negative integer", () => {
    expect(readIntegerEnv("X", 7, {})).toBe(7);
    expect(readIntegerEnv("X", 7, { X: "" })).toBe(7);
    expect(readIntegerEnv("X", 7, { X: "0" })).toBe(0);
    expect(() => readIntegerEnv("X", 7, { X: "abc" })).toThrow(/X must be a non-negative integer/);
    expect(() => readIntegerEnv("X", 7, { X: "-3" })).toThrow();
    expect(() => readIntegerEnv("X", 7, { X: "1.5" })).toThrow();
  });

  it("validates PORT instead of silently using 5000", () => {
    expect(resolvePort({})).toBe(5000);
    expect(resolvePort({ PORT: "8123" })).toBe(8123);
    expect(() => resolvePort({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => resolvePort({ PORT: "70000" })).toThrow(/PORT/);
    expect(() => resolvePort({ PORT: "0" })).toThrow(/PORT/);
  });

  it("reads the variable of its own before the shared PORT, and only PORT earns a warning", () => {
    expect(resolvePort({ HYDRA_UMC_MTCONNECT_PORT: "5100", PORT: "3000" })).toBe(5100);
    expect(resolveListenPortOf({ HYDRA_UMC_MTCONNECT_PORT: "5100", PORT: "3000" }).warning).toBeUndefined();
    const shared = resolveListenPortOf({ PORT: "3000" });
    expect(shared.port).toBe(3000);
    expect(shared.warning).toContain("HYDRA_UMC_MTCONNECT_PORT");
    expect(resolveListenPortOf({}).source).toBe("default");
    expect(() => resolvePort({ HYDRA_UMC_MTCONNECT_PORT: "abc", PORT: "3000" })).toThrow(/HYDRA_UMC_MTCONNECT_PORT/);
    expect(resolvePort({ HYDRA_UMC_MTCONNECT_PORT: " ", PORT: "3000" })).toBe(3000);
  });
});

describe("the HYDRA-UMC-SERVER reader", () => {
  it("counts the body in bytes as it arrives and stops at the limit", async () => {
    const big = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(600));
          controller.enqueue(new Uint8Array(600));
          controller.close();
        },
      }),
    );
    await expect(readJsonCapped(big, 1000)).rejects.toThrow(/larger than 1000/);
    await expect(readJsonCapped(new Response('{"controllers":[]}'), 1000)).resolves.toEqual({ controllers: [] });
  });

  it("reports execution as UNAVAILABLE while the robot is not available", async () => {
    const settings = { controllers: [{ robots: [{ id: 1, online: false, playbackState: { isPlaying: true } }] }] };
    const reader = new HydraServerMachineReader({
      baseUrl: "http://server.invalid",
      token: "t",
      fetchImpl: (async () => new Response(JSON.stringify(settings))) as unknown as typeof fetch,
    });
    const readings: RawReading[] = await reader.read();
    const byId = Object.fromEntries(readings.map((r) => [r.id, r.value]));
    expect(byId.avail).toBe("UNAVAILABLE");
    expect(byId.execution).toBe("UNAVAILABLE");
  });

  it("derives execution from the playback state while the robot is available", async () => {
    const settings = { controllers: [{ robots: [{ id: 1, online: true, playbackState: { isPlaying: true } }] }] };
    const reader = new HydraServerMachineReader({
      baseUrl: "http://server.invalid",
      token: "t",
      fetchImpl: (async () => new Response(JSON.stringify(settings))) as unknown as typeof fetch,
    });
    const byId = Object.fromEntries((await reader.read()).map((r) => [r.id, r.value]));
    expect(byId.avail).toBe("AVAILABLE");
    expect(byId.execution).toBe("ACTIVE");
  });
});
