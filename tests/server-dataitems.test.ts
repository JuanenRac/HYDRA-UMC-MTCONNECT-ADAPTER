// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/server-dataitems.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// Real HTTP tests (supertest, over a real listening socket) of the new
// unit-conversion/quality/degraded-mode pipeline wired into GET /current -
// this is the promotion audit's own "Evidencia": a fixture machine with
// mixed units, invalid data, and downtime, checking real degraded
// MTConnect output and correct UTC.
// =============================================================================

import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../src/server.js";
import type { MachineReader } from "../src/reader.js";
import type { RawReading } from "../src/dataitem.js";

function readerOf(readings: RawReading[]): MachineReader {
  return { read: async () => readings };
}

function failingReader(): MachineReader {
  return {
    read: async () => {
      throw new Error("real connection refused - the fixture machine is down");
    },
  };
}

describe("GET /current - real Samples pipeline (fixture machine, mixed units)", () => {
  it("declares spindle_temp in /probe with its real MTConnect and native units", async () => {
    const res = await request(buildApp()).get("/probe");
    expect(res.text).toContain('<DataItem id="spindle_temp" category="SAMPLE" type="TEMPERATURE" units="DEGREE_CELSIUS" nativeUnits="FAHRENHEIT"/>');
  });

  it("converts a real Fahrenheit fixture reading to Celsius in the Samples block", async () => {
    const reader = readerOf([{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "FAHRENHEIT", value: 98.6, timestampMs: 1_700_000_000_000 }]);
    const res = await request(buildApp({ reader })).get("/current");
    expect(res.status).toBe(200);
    expect(res.text).toContain('<Samples>');
    expect(res.text).toMatch(/<Temperature dataItemId="spindle_temp"[^>]*units="DEGREE_CELSIUS"[^>]*>37(\.0*)?</);
  });

  it("uses the real UTC timestamp from the reading, not the request time", async () => {
    const reader = readerOf([{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value: 50, timestampMs: 1_735_689_600_000 }]);
    const res = await request(buildApp({ reader })).get("/current");
    // 1_735_689_600_000 ms since epoch is exactly 2025-01-01T00:00:00.000Z - a
    // real, hand-checkable UTC instant, always Z-suffixed regardless of the
    // machine running this test's own local timezone.
    expect(res.text).toContain('timestamp="2025-01-01T00:00:00.000Z"');
  });

  it("renders a real invalid (NaN) reading as UNAVAILABLE with a real error code, not a crash or 'NaN'", async () => {
    const reader = readerOf([{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value: NaN, timestampMs: 1_700_000_000_000 }]);
    const res = await request(buildApp({ reader })).get("/current");
    expect(res.status).toBe(200);
    expect(res.text).toContain('errorCode="NO_DATA"');
    expect(res.text).toMatch(/<Temperature[^>]*>UNAVAILABLE</);
    expect(res.text).not.toContain(">NaN<");
  });

  it("renders real downtime (the fixture source throws) as a degraded, still-200 MTConnect response", async () => {
    const res = await request(buildApp({ reader: failingReader() })).get("/current");
    expect(res.status).toBe(200);
    expect(res.text).toContain('errorCode="SOURCE_UNAVAILABLE"');
    expect(res.text).toMatch(/<Temperature[^>]*>UNAVAILABLE</);
    // The rest of the document must still be spec-shaped - a down source
    // degrades ITS OWN DataItem, not the whole response.
    expect(res.text).toContain("<MTConnectStreams");
    expect(res.text).toContain(">READY<");
  });
});

describe("GET /current - real polling-frequency cache", () => {
  it("does not re-read the source on every request within minPollIntervalMs", async () => {
    let calls = 0;
    const reader: MachineReader = {
      read: async () => {
        calls += 1;
        return [{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value: 22, timestampMs: Date.now() }];
      },
    };
    const app = buildApp({ reader, minPollIntervalMs: 60_000 });

    await request(app).get("/current");
    await request(app).get("/current");
    await request(app).get("/current");

    expect(calls).toBe(1);
  });
});
