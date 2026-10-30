// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/current-at.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// GET /current?at=<sequence>: the state of the device as it stood at an
// earlier sequence. Includes characterization of the plain /current.
// =============================================================================

import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../src/server.js";
import { ObservationBuffer } from "../src/buffer.js";
import type { MachineReader } from "../src/reader.js";

function steppingReader(): { reader: MachineReader; set: (v: number) => void } {
  let value = 20;
  return {
    reader: { read: async () => [{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value, timestampMs: Date.now() }] },
    set: (v) => {
      value = v;
    },
  };
}

const num = (text: string, attr: string): number => Number(text.match(new RegExp(`${attr}="(\\d+)"`))?.[1]);

describe("ObservationBuffer.currentAt", () => {
  it("returns the newest observation per DataItem up to the sequence", () => {
    const b = new ObservationBuffer(10);
    const base = { category: "EVENT" as const, type: "EXECUTION", timestampMs: 1 };
    b.record({ ...base, id: "a", value: "READY" });
    b.record({ ...base, id: "b", value: "ACTIVE" });
    b.record({ ...base, id: "a", value: "STOPPED" });
    expect(b.currentAt(2).map((o) => `${o.id}=${o.value}`)).toEqual(["a=READY", "b=ACTIVE"]);
    expect(b.currentAt(3).map((o) => `${o.id}=${o.value}`)).toEqual(["b=ACTIVE", "a=STOPPED"]);
    expect(b.currentAt(3)).toEqual(b.current());
  });
});

describe("GET /current", () => {
  it("without 'at' keeps answering the latest state", async () => {
    const { reader } = steppingReader();
    const app = buildApp({ reader, minPollIntervalMs: 0 });
    const res = await request(app).get("/current");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<Temperature[^>]*>20</);
  });

  it("'at' returns the older value, while /current returns the new one", async () => {
    const { reader, set } = steppingReader();
    const app = buildApp({ reader, minPollIntervalMs: 0 });
    const first = await request(app).get("/current");
    const seqOfFirst = num(first.text, "lastSequence");
    set(35);
    const later = await request(app).get("/current");
    expect(later.text).toMatch(/<Temperature[^>]*>35</);

    const past = await request(app).get(`/current?at=${seqOfFirst}`);
    expect(past.status).toBe(200);
    expect(past.text).toMatch(/<Temperature[^>]*>20</);
    expect(past.text).not.toMatch(/<Temperature[^>]*>35</);
    // the header still says where the stream stands now
    expect(num(past.text, "nextSequence")).toBe(num(later.text, "nextSequence"));
  });

  it("'at' also works on the per-device path", async () => {
    const { reader } = steppingReader();
    const app = buildApp({ reader, minPollIntervalMs: 0 });
    const cur = await request(app).get("/HydraNode_1/current");
    const res = await request(app).get(`/HydraNode_1/current?at=${num(cur.text, "lastSequence")}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("<MTConnectStreams");
  });

  it("rejects a malformed or out-of-range 'at' with an MTConnectError", async () => {
    const { reader } = steppingReader();
    const app = buildApp({ reader, minPollIntervalMs: 0, httpErrors: true });
    const bad = await request(app).get("/current?at=abc");
    expect(bad.status).toBe(400);
    expect(bad.text).toContain('errorCode="INVALID_REQUEST"');
    const beyond = await request(app).get("/current?at=999999");
    expect(beyond.status).toBe(400);
    expect(beyond.text).toContain('errorCode="OUT_OF_RANGE"');
  });
});
