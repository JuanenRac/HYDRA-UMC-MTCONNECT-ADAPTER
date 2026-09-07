// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/server.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// Real HTTP tests (via supertest, a real request over a real listening
// socket, not a hand-rolled call into the route handler) verifying the
// two endpoints every MTConnect Agent/collector expects respond with
// spec-shaped XML.
// =============================================================================

import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../src/server.js";

describe("HYDRA-UMC-MTCONNECT-ADAPTER (real HTTP)", () => {
  it("GET /probe returns a spec-shaped MTConnectDevices document", async () => {
    const res = await request(buildApp()).get("/probe");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/xml/);
    expect(res.text).toContain("<MTConnectDevices");
    expect(res.text).toContain('xmlns="urn:mtconnect.org:MTConnectDevices:1.7"');
    expect(res.text).toContain('<Device id="hydra_umc_1" name="HydraNode_1" uuid="hydra-umc-node-1">');
    expect(res.text).toContain('<DataItem id="execution" category="EVENT" type="EXECUTION"/>');
    expect(res.text).toContain('<DataItem id="avail" category="EVENT" type="AVAILABILITY"/>');
  });

  it("GET /current returns a spec-shaped MTConnectStreams document with matching DataItem ids", async () => {
    const res = await request(buildApp()).get("/current");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/xml/);
    expect(res.text).toContain("<MTConnectStreams");
    expect(res.text).toContain('xmlns="urn:mtconnect.org:MTConnectStreams:1.7"');
    expect(res.text).toContain('dataItemId="execution"');
    expect(res.text).toContain('dataItemId="avail"');
    expect(res.text).toContain(">READY<");
    expect(res.text).toContain(">AVAILABLE<");
  });

  it("/probe and /current share the same instanceId across requests to the same app instance", async () => {
    const app = buildApp();
    const probe = await request(app).get("/probe");
    const current = await request(app).get("/current");
    const probeInstanceId = probe.text.match(/instanceId="(\d+)"/)?.[1];
    const currentInstanceId = current.text.match(/instanceId="(\d+)"/)?.[1];
    expect(probeInstanceId).toBeDefined();
    expect(probeInstanceId).toBe(currentInstanceId);
  });

  it("returns 404 for an unknown path", async () => {
    const res = await request(buildApp()).get("/nope");
    expect(res.status).toBe(404);
  });
});
