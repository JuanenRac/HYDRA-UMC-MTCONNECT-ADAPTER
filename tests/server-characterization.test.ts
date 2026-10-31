// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/server-characterization.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// Characterization of the documents server.ts builds: the exact text of
// /probe, /current and /sample and of the error answers, with the values that
// change per run (times, instance id) replaced by placeholders. These tests
// pin the current behaviour so the server can be reorganized without any
// observable change.
// =============================================================================

import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../src/server.js";
import type { MachineReader } from "../src/reader.js";

const FIXED = Date.UTC(2026, 0, 1, 12, 0, 0);

const reader: MachineReader = {
  read: async () => [
    { id: "execution", category: "EVENT", type: "EXECUTION", value: "ACTIVE", timestampMs: FIXED },
    { id: "avail", category: "EVENT", type: "AVAILABILITY", value: "AVAILABLE", timestampMs: FIXED },
    { id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "FAHRENHEIT", value: 212, timestampMs: FIXED },
  ],
};

/** Replaces what differs from run to run. */
function normalize(text: string): string {
  return text
    .replace(/creationTime="[^"]*"/g, 'creationTime="T"')
    .replace(/deviceModelChangeTime="[^"]*"/g, 'deviceModelChangeTime="T"')
    .replace(/instanceId="\d+"/g, 'instanceId="I"')
    .replace(/instanceId="I" version="[^"]*"/g, 'instanceId="I" version="V"')
    .replace(/timestamp="(?!2026-01-01T12:00:00.000Z)[^"]*"/g, 'timestamp="T"');
}

const app = () => buildApp({ reader, minPollIntervalMs: 0, bufferSize: 100 });

const PROBE = `<?xml version="1.0" encoding="UTF-8"?>
<MTConnectDevices xmlns="urn:mtconnect.org:MTConnectDevices:1.7">
  <Header creationTime="T" sender="HYDRA-UMC-MTCONNECT-ADAPTER" instanceId="I" version="V" bufferSize="100" deviceModelChangeTime="T" assetBufferSize="1" assetCount="0"/>
  <Devices>
    <Agent id="agent" name="Agent" uuid="hydra-umc-mtconnect-adapter">
      <Description manufacturer="JuanenRac (Electro Hobby 3D)">HYDRA-UMC-MTCONNECT-ADAPTER process</Description>
      <DataItems>
        <DataItem id="agent_avail" category="EVENT" type="AVAILABILITY"/>
      </DataItems>
    </Agent>
    <Device id="hydra_umc_1" name="HydraNode_1" uuid="hydra-umc-node-1">
      <Description manufacturer="JuanenRac (Electro Hobby 3D)">HYDRA-UMC multi-robot micro-factory cell</Description>
      <DataItems>
        <DataItem id="execution" category="EVENT" type="EXECUTION"/>
        <DataItem id="avail" category="EVENT" type="AVAILABILITY"/>
        <DataItem id="spindle_temp" category="SAMPLE" type="TEMPERATURE" units="CELSIUS" nativeUnits="FAHRENHEIT"/>
        <DataItem id="asset_chg" category="EVENT" type="ASSET_CHANGED"/>
        <DataItem id="asset_rem" category="EVENT" type="ASSET_REMOVED"/>
      </DataItems>
    </Device>
  </Devices>
</MTConnectDevices>
`;

describe("server.ts characterization", () => {
  it("/probe is exactly the one-device model", async () => {
    const res = await request(app()).get("/probe");
    expect(normalize(res.text)).toBe(PROBE);
  });

  it("/HydraNode_1/probe and /<uuid>/probe answer the same document", async () => {
    const a = app();
    expect(normalize((await request(a).get("/HydraNode_1/probe")).text)).toBe(PROBE);
    expect(normalize((await request(a).get("/hydra-umc-node-1/probe")).text)).toBe(PROBE);
  });

  it("/current has an Agent stream and a HydraNode_1 stream in sequence order", async () => {
    const res = await request(app()).get("/current");
    const text = normalize(res.text);
    expect(text).toContain('<DeviceStream name="Agent" uuid="hydra-umc-mtconnect-adapter">');
    expect(text).toContain('<DeviceStream name="HydraNode_1" uuid="hydra-umc-node-1">');
    expect(text).toContain('<ComponentStream componentId="hydra_umc_1" component="Device" name="HydraNode_1">');
    expect(text).toContain('<Execution dataItemId="execution" timestamp="2026-01-01T12:00:00.000Z" sequence="');
    expect(text).toMatch(/<Temperature dataItemId="spindle_temp"[^>]*>100<\/Temperature>/);
    // the order of the observations is the order of their sequence numbers
    const sequences = [...res.text.matchAll(/sequence="(\d+)"/g)].map((m) => Number(m[1]));
    expect(sequences).toEqual([...sequences].sort((x, y) => x - y));
    expect(new Set(sequences).size).toBe(sequences.length);
  });

  it("/HydraNode_1/current leaves the agent stream out", async () => {
    const res = await request(app()).get("/HydraNode_1/current");
    expect(res.text).not.toContain('name="Agent"');
    expect(res.text).toContain('<DeviceStream name="HydraNode_1" uuid="hydra-umc-node-1">');
  });

  it("/sample from the first sequence returns every observation once, with nextSequence after the last", async () => {
    const res = await request(app()).get("/sample?from=1&count=1000");
    const sequences = [...res.text.matchAll(/ sequence="(\d+)"/g)].map((m) => Number(m[1]));
    const next = Number(res.text.match(/nextSequence="(\d+)"/)?.[1]);
    expect(sequences[0]).toBe(1);
    expect(next).toBe(sequences[sequences.length - 1] + 1);
  });

  it("the error answers keep their shape (status 200 unless HTTP errors are on)", async () => {
    const a = app();
    const noDevice = await request(a).get("/Other/probe");
    expect(noDevice.status).toBe(200);
    expect(normalize(noDevice.text)).toContain('<Error errorCode="NO_DEVICE">this agent serves the device HydraNode_1, not &quot;Other&quot;</Error>');
    const bad = await request(a).get("/sample?from=abc");
    expect(bad.text).toContain('<Error errorCode="INVALID_REQUEST">');
    const range = await request(a).get("/sample?from=9999");
    expect(range.text).toContain('<Error errorCode="OUT_OF_RANGE">');
    const count = await request(a).get("/sample?count=1001");
    expect(count.text).toContain('<Error errorCode="OUT_OF_RANGE">');
  });

  it("with HTTP errors on, the same errors use 404 and 400", async () => {
    const a = buildApp({ reader, minPollIntervalMs: 0, httpErrors: true });
    expect((await request(a).get("/Other/current")).status).toBe(404);
    expect((await request(a).get("/sample?from=abc")).status).toBe(400);
  });

  it("a source that fails turns every DataItem UNAVAILABLE", async () => {
    const down: MachineReader = { read: async () => { throw new Error("down"); } };
    const res = await request(buildApp({ reader: down, minPollIntervalMs: 0 })).get("/current");
    expect(res.text).not.toContain(">ACTIVE<");
    expect(res.text).toContain(">UNAVAILABLE<");
  });
});
