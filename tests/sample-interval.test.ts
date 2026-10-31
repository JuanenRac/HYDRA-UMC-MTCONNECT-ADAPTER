// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/sample-interval.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// GET /sample?interval=<ms>: the multipart stream of Streams documents, read
// over a real socket. Plain /sample (no interval) keeps being one document.
// =============================================================================

import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../src/server.js";
import type { MachineReader } from "../src/reader.js";

let value = 20;
const reader: MachineReader = {
  read: async () => [{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value, timestampMs: Date.now() }],
};

let server: Server | undefined;
beforeEach(() => {
  value = 20;
  process.env.MTCONNECT_MIN_STREAM_INTERVAL_MS = "0";
  delete process.env.MTCONNECT_MAX_STREAMS;
});
afterEach(async () => {
  delete process.env.MTCONNECT_MIN_STREAM_INTERVAL_MS;
  delete process.env.MTCONNECT_MAX_STREAMS;
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

async function listen(app: ReturnType<typeof buildApp>): Promise<number> {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
  return (server.address() as AddressInfo).port;
}

/** Opens the stream and resolves once `parts` parts arrived (or rejects after 5 s), closing the connection. */
function readParts(port: number, pathAndQuery: string, parts: number, between?: () => void): Promise<{ contentType: string; bodies: string[] }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for the stream parts")), 5000);
    const req = http.get({ host: "127.0.0.1", port, path: pathAndQuery }, (res) => {
      let buffered = "";
      const bodies: string[] = [];
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buffered += chunk;
        for (;;) {
          const headEnd = buffered.indexOf("\r\n\r\n");
          if (headEnd < 0) return;
          const length = Number(buffered.slice(0, headEnd).match(/Content-length: (\d+)/)?.[1]);
          const bodyStart = headEnd + 4;
          if (buffered.length < bodyStart + length) return;
          bodies.push(buffered.slice(bodyStart, bodyStart + length));
          buffered = buffered.slice(bodyStart + length + 2);
          if (bodies.length === 1) between?.();
          if (bodies.length >= parts) {
            clearTimeout(timer);
            req.destroy();
            resolve({ contentType: String(res.headers["content-type"]), bodies });
            return;
          }
        }
      });
    });
    req.on("error", () => undefined);
  });
}

describe("GET /sample?interval=", () => {
  it("streams multipart parts, each continuing where the last stopped, and a change shows up once", async () => {
    const port = await listen(buildApp({ reader, minPollIntervalMs: 0 }));
    const { contentType, bodies } = await readParts(port, "/sample?from=1&count=1000&interval=20", 3, () => {
      value = 77;
    });
    expect(contentType).toMatch(/^multipart\/x-mixed-replace;boundary=/);
    const sequences = bodies.map((b) => [...b.matchAll(/ sequence="(\d+)"/g)].map((m) => Number(m[1])));
    const all = sequences.flat();
    expect(new Set(all).size).toBe(all.length); // no observation is repeated
    // every part is entirely after the one before it (inside a part they are grouped by device and kind)
    for (let i = 1; i < sequences.length; i++) {
      if (sequences[i].length > 0 && sequences[i - 1].length > 0) expect(Math.min(...sequences[i])).toBeGreaterThan(Math.max(...sequences[i - 1]));
    }
    expect(bodies.join("")).toMatch(/<Temperature[^>]*>77</);
    // the nextSequence of one part is where the next part starts
    const nexts = bodies.map((b) => Number(b.match(/nextSequence="(\d+)"/)?.[1]));
    for (let i = 1; i < bodies.length; i++) {
      const first = sequences[i][0];
      if (first !== undefined) expect(first).toBeGreaterThanOrEqual(nexts[i - 1]);
    }
  });

  it("a quiet interval still sends a part (an empty one is the heartbeat)", async () => {
    const port = await listen(buildApp({ reader, minPollIntervalMs: 0 }));
    const { bodies } = await readParts(port, "/sample?interval=20", 3);
    expect(bodies.length).toBe(3);
    expect(bodies[2]).toContain("<MTConnectStreams");
  });

  it("per-device streams carry only that device", async () => {
    const port = await listen(buildApp({ reader, minPollIntervalMs: 0 }));
    const { bodies } = await readParts(port, "/HydraNode_1/sample?from=1&interval=20", 1);
    expect(bodies[0]).toContain('name="HydraNode_1"');
    expect(bodies[0]).not.toContain('name="Agent"');
  });

  it("rejects a malformed interval and a too large one like the other parameters", async () => {
    const app = buildApp({ reader, minPollIntervalMs: 0 });
    expect((await request(app).get("/sample?interval=abc")).text).toContain('errorCode="INVALID_REQUEST"');
    expect((await request(app).get("/sample?interval=-5")).text).toContain('errorCode="INVALID_REQUEST"');
    expect((await request(app).get("/sample?interval=2147483648")).text).toContain('errorCode="OUT_OF_RANGE"');
  });

  it("a stream that asks from a sequence beyond the buffer is the usual OUT_OF_RANGE, not a stream", async () => {
    const app = buildApp({ reader, minPollIntervalMs: 0 });
    const res = await request(app).get("/sample?from=99999&interval=20");
    expect(res.headers["content-type"]).toMatch(/application\/xml/);
    expect(res.text).toContain('errorCode="OUT_OF_RANGE"');
  });

  it("refuses a stream over the limit with 503 and frees the slot when the client leaves", async () => {
    process.env.MTCONNECT_MAX_STREAMS = "1";
    const port = await listen(buildApp({ reader, minPollIntervalMs: 0 }));
    const open = http.get({ host: "127.0.0.1", port, path: "/sample?interval=20" });
    open.on("error", () => undefined);
    await new Promise((r) => open.once("response", r));
    const refused = await new Promise<number>((resolve) => http.get({ host: "127.0.0.1", port, path: "/sample?interval=20" }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }));
    expect(refused).toBe(503);
    open.destroy();
    await new Promise((r) => setTimeout(r, 100));
    const again = await readParts(port, "/sample?interval=20", 1);
    expect(again.bodies).toHaveLength(1);
  });

  it("without interval, /sample stays one plain document", async () => {
    const res = await request(buildApp({ reader, minPollIntervalMs: 0 })).get("/sample");
    expect(res.headers["content-type"]).toMatch(/application\/xml/);
  });
});
