// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/server-sample.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// I43's own real acceptance test: "Consumidor solicita desde una secuencia
// anterior al buffer... y recibe una respuesta coherente con el contrato,
// no una mezcla silenciosa." Real HTTP tests (supertest, over a real
// listening socket) of GET /sample against this adapter's own real,
// honestly narrow buffer (exactly one retained batch - see server.ts's
// own doc comment on mtconnectHeader()).
// =============================================================================

import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../src/server.js";
import type { MachineReader } from "../src/reader.js";

function counterReader(): { reader: MachineReader; calls: () => number } {
  let calls = 0;
  return {
    reader: {
      read: async () => {
        calls += 1;
        return [{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value: 22, timestampMs: Date.now() }];
      },
    },
    calls: () => calls,
  };
}

describe("GET /sample - real sequence coherence (I43)", () => {
  it("with no 'from', returns the same real content and sequence as /current", async () => {
    const { reader } = counterReader();
    const app = buildApp({ reader, minPollIntervalMs: 60_000 });

    const current = await request(app).get("/current");
    const currentSequence = current.text.match(/lastSequence="(\d+)"/)?.[1];
    expect(currentSequence).toBeDefined();

    const sample = await request(app).get("/sample");
    expect(sample.status).toBe(200);
    expect(sample.text).toContain("<MTConnectStreams");
    expect(sample.text).toContain(`lastSequence="${currentSequence}"`);
    expect(sample.text).toMatch(/<Temperature[^>]*>22</);
  });

  it("'from' equal to the current lastSequence returns a real, valid, EMPTY result - not a repeat", async () => {
    const { reader } = counterReader();
    const app = buildApp({ reader, minPollIntervalMs: 60_000 });

    const current = await request(app).get("/current");
    const lastSequence = current.text.match(/lastSequence="(\d+)"/)?.[1];

    const sample = await request(app).get(`/sample?from=${lastSequence}`);
    expect(sample.status).toBe(200);
    expect(sample.text).toContain("<MTConnectStreams");
    expect(sample.text).not.toMatch(/<Temperature/); // nothing new since `from` - real empty Samples
  });

  it("'from' older than firstSequence gets a real MTConnectError, never a silent mix of old and new data", async () => {
    const { reader } = counterReader();
    const app = buildApp({ reader, minPollIntervalMs: 60_000 });

    // Advances the real buffer to at least sequence 1 first.
    await request(app).get("/current");

    const res = await request(app).get("/sample?from=0");

    expect(res.status).toBe(200); // this adapter signals errors via the XML root, not the HTTP status - same convention /probe and /current already use
    expect(res.text).toContain("<MTConnectError");
    expect(res.text).toContain('xmlns="urn:mtconnect.org:MTConnectError:1.7"');
    expect(res.text).toMatch(/<Error errorCode="OUT_OF_RANGE">/);
    expect(res.text).not.toContain("<MTConnectStreams");
  });

  it("a malformed 'from' gets a real INVALID_REQUEST error, not a crash or a guessed default", async () => {
    const app = buildApp({ reader: counterReader().reader });

    const nonNumeric = await request(app).get("/sample?from=not-a-number");
    expect(nonNumeric.text).toMatch(/<Error errorCode="INVALID_REQUEST">/);

    const negative = await request(app).get("/sample?from=-1");
    expect(negative.text).toMatch(/<Error errorCode="INVALID_REQUEST">/);
  });

  it("the real MTConnectError still carries this adapter's own real, current instanceId/sequence in its Header", async () => {
    const { reader } = counterReader();
    const app = buildApp({ reader, minPollIntervalMs: 60_000 });
    await request(app).get("/current");

    const probeInstanceId = (await request(app).get("/probe")).text.match(/instanceId="(\d+)"/)?.[1];
    const errorRes = await request(app).get("/sample?from=0");
    const errorInstanceId = errorRes.text.match(/instanceId="(\d+)"/)?.[1];

    expect(errorInstanceId).toBeDefined();
    expect(errorInstanceId).toBe(probeInstanceId);
  });

  it("before any real read has ever happened, /probe honestly reports an empty buffer (firstSequence=0, lastSequence=0)", async () => {
    // GET /probe never triggers a read itself (it's the static device
    // model) - on a completely fresh app, nothing has been read yet.
    const res = await request(buildApp({ reader: counterReader().reader })).get("/probe");
    expect(res.text).toMatch(/firstSequence="0"/);
    expect(res.text).toMatch(/lastSequence="0"/);
  });

  it("a real new poll advances the sequence, and 'from' at the OLD lastSequence now returns the new data", async () => {
    let value = 10;
    const reader: MachineReader = {
      read: async () => [{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value, timestampMs: Date.now() }],
    };
    // minPollIntervalMs: 0 - every request is a real, fresh read, so this
    // test controls "has new data arrived" purely by mutating `value`
    // between requests, without needing to fake the clock.
    const app = buildApp({ reader, minPollIntervalMs: 0 });

    const first = await request(app).get("/current");
    const firstSequence = first.text.match(/lastSequence="(\d+)"/)?.[1];

    value = 99;
    const sample = await request(app).get(`/sample?from=${firstSequence}`);

    expect(sample.status).toBe(200);
    expect(sample.text).toContain("<MTConnectStreams");
    expect(sample.text).toMatch(/<Temperature[^>]*>99</); // the real new value, not a repeat of the old one
    const newSequence = sample.text.match(/lastSequence="(\d+)"/)?.[1];
    expect(Number(newSequence)).toBeGreaterThan(Number(firstSequence));
  });
});
