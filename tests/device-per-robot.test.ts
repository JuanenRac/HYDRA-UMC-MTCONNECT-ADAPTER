// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/device-per-robot.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// One Device per robot of the roster, behind HYDRA_UMC_MTCONNECT_DEVICE_PER_ROBOT
// (off by default: the single HydraNode_1 stays as it was). Reads a real
// local http.Server standing in for HYDRA-UMC-SERVER's /api/settings, and
// validates every document against the MTConnect 1.7 XSD.
// =============================================================================

import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { validateXML } from "xmllint-wasm";
import { buildApp } from "../src/server.js";
import { HydraServerMachineReader } from "../src/hydraServerReader.js";

const SCHEMA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../schemas/mtconnect-1.7");
const readSchema = (fileName: string) => ({ fileName, contents: readFileSync(path.join(SCHEMA_DIR, fileName), "utf-8") });

async function valid(xml: string, schema: string): Promise<void> {
  const result = await validateXML({ xml: { fileName: "r.xml", contents: xml }, schema: readSchema(schema), preload: [readSchema("xlink.xsd")] });
  if (!result.valid) throw new Error(result.errors.map((e) => e.rawMessage).join("\n"));
  expect(result.valid).toBe(true);
}

let server: Server | undefined;
let roster: unknown = { controllers: [] };

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

async function serve(): Promise<string> {
  server = createServer((req, res) => {
    if (req.url !== "/api/settings") return void res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(roster));
  });
  const port = await new Promise<number>((resolve) => server!.listen(0, "127.0.0.1", () => resolve((server!.address() as { port: number }).port)));
  return `http://127.0.0.1:${port}`;
}

const robot = (id: number, online: boolean, playing = false) => ({ id, online, playbackState: { isPlaying: playing } });

function appFor(baseUrl: string, perRobot: boolean, robotId?: number) {
  return buildApp({
    reader: new HydraServerMachineReader({ baseUrl, perRobot, robotId }),
    minPollIntervalMs: 0,
    devicePerRobot: perRobot,
  });
}

describe("one Device per robot", () => {
  it("is off by default: the same roster is still one HydraNode_1", async () => {
    roster = { controllers: [{ robots: [robot(1, true, true), robot(2, true)] }] };
    const app = appFor(await serve(), false);
    const probe = await request(app).get("/probe");
    expect(probe.text).toContain('name="HydraNode_1"');
    expect(probe.text).not.toContain("Robot_");
    expect(probe.text).toContain('<DataItem id="execution"');
  });

  it("/probe declares a Device per robot with ids that cannot collide, and validates", async () => {
    roster = { controllers: [{ robots: [robot(1, true, true), robot(2, false)] }, { robots: [robot(7, true)] }] };
    const app = appFor(await serve(), true);
    const probe = await request(app).get("/probe");
    expect(probe.text).toContain('<Device id="hydra_umc_robot_1" name="Robot_1" uuid="hydra-umc-robot-1">');
    expect(probe.text).toContain('<Device id="hydra_umc_robot_2" name="Robot_2" uuid="hydra-umc-robot-2">');
    expect(probe.text).toContain('<Device id="hydra_umc_robot_7" name="Robot_7" uuid="hydra-umc-robot-7">');
    expect(probe.text).not.toContain('name="HydraNode_1"');
    for (const id of ["robot_1_execution", "robot_2_avail", "robot_7_asset_chg", "robot_7_asset_rem"]) {
      expect(probe.text).toContain(`<DataItem id="${id}"`);
    }
    const ids = [...probe.text.matchAll(/<DataItem id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    await valid(probe.text, "MTConnectDevices_1.7.xsd");
  });

  it("/current groups the observations by robot and validates", async () => {
    roster = { controllers: [{ robots: [robot(1, true, true), robot(2, false)] }] };
    const app = appFor(await serve(), true);
    const current = await request(app).get("/current");
    expect(current.text).toContain('<DeviceStream name="Robot_1" uuid="hydra-umc-robot-1">');
    expect(current.text).toContain('<DeviceStream name="Robot_2" uuid="hydra-umc-robot-2">');
    expect(current.text).toMatch(/<Execution dataItemId="robot_1_execution"[^>]*>ACTIVE</);
    expect(current.text).toMatch(/<Availability dataItemId="robot_2_avail"[^>]*>UNAVAILABLE</);
    await valid(current.text, "MTConnectStreams_1.7.xsd");
  });

  it("/<robot>/current and /sample answer for one robot only, by name or uuid", async () => {
    roster = { controllers: [{ robots: [robot(1, true, true), robot(2, true)] }] };
    const app = appFor(await serve(), true);
    const one = await request(app).get("/Robot_2/current");
    expect(one.text).toContain('name="Robot_2"');
    expect(one.text).not.toContain('name="Robot_1"');
    expect(one.text).not.toContain('name="Agent"');
    await valid(one.text, "MTConnectStreams_1.7.xsd");
    const byUuid = await request(app).get("/hydra-umc-robot-1/sample?from=1&count=1000");
    expect(byUuid.text).toContain('name="Robot_1"');
    expect(byUuid.text).not.toContain('name="Robot_2"');
    await valid(byUuid.text, "MTConnectStreams_1.7.xsd");
    const probeOne = await request(app).get("/Robot_1/probe");
    await valid(probeOne.text, "MTConnectDevices_1.7.xsd");
  });

  it("an unknown device is NO_DEVICE and names the robots it serves; HydraNode_1 is no longer one of them", async () => {
    roster = { controllers: [{ robots: [robot(1, true), robot(2, true)] }] };
    const app = appFor(await serve(), true);
    const res = await request(app).get("/HydraNode_1/current");
    expect(res.text).toContain('errorCode="NO_DEVICE"');
    expect(res.text).toContain("devices Robot_1, Robot_2");
  });

  it("a robot added later is declared, and the device model change time moves", async () => {
    roster = { controllers: [{ robots: [robot(1, true)] }] };
    const app = appFor(await serve(), true);
    const first = await request(app).get("/probe");
    const t1 = first.text.match(/deviceModelChangeTime="([^"]+)"/)?.[1];
    await new Promise((r) => setTimeout(r, 15));
    roster = { controllers: [{ robots: [robot(1, true), robot(3, true)] }] };
    const second = await request(app).get("/probe");
    expect(second.text).toContain('name="Robot_3"');
    expect(second.text.match(/deviceModelChangeTime="([^"]+)"/)?.[1]).not.toBe(t1);
    await valid(second.text, "MTConnectDevices_1.7.xsd");
  });

  it("a robot that leaves the roster turns UNAVAILABLE, and a source that goes down turns every robot UNAVAILABLE", async () => {
    roster = { controllers: [{ robots: [robot(1, true, true), robot(2, true, true)] }] };
    const app = appFor(await serve(), true);
    await request(app).get("/current");
    roster = { controllers: [{ robots: [robot(1, true, true)] }] };
    const left = await request(app).get("/current");
    expect(left.text).toMatch(/<Execution dataItemId="robot_2_execution"[^>]*>UNAVAILABLE</);
    expect(left.text).toMatch(/<Execution dataItemId="robot_1_execution"[^>]*>ACTIVE</);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    const down = await request(app).get("/current");
    expect(down.text).toMatch(/<Execution dataItemId="robot_1_execution"[^>]*>UNAVAILABLE</);
    await valid(down.text, "MTConnectStreams_1.7.xsd");
  });

  it("with an empty roster (or before it is known) the probe still validates and stands in with HydraNode_1", async () => {
    roster = { controllers: [] };
    const app = appFor(await serve(), true);
    const probe = await request(app).get("/probe");
    expect(probe.text).toContain('name="HydraNode_1"');
    await valid(probe.text, "MTConnectDevices_1.7.xsd");
    const current = await request(app).get("/current");
    await valid(current.text, "MTConnectStreams_1.7.xsd");
  });

  it("HYDRA_UMC_ROBOT_ID narrows the devices to that robot", async () => {
    roster = { controllers: [{ robots: [robot(1, true), robot(2, true)] }] };
    const app = appFor(await serve(), true, 2);
    const probe = await request(app).get("/probe");
    expect(probe.text).toContain('name="Robot_2"');
    expect(probe.text).not.toContain('name="Robot_1"');
  });

  it("/sample continues from nextSequence without losing or repeating a change", async () => {
    roster = { controllers: [{ robots: [robot(1, true, false)] }] };
    const app = appFor(await serve(), true);
    const first = await request(app).get("/sample");
    const next = Number(first.text.match(/nextSequence="(\d+)"/)?.[1]);
    roster = { controllers: [{ robots: [robot(1, true, true)] }] };
    const second = await request(app).get(`/sample?from=${next}`);
    const seqs = [...second.text.matchAll(/ sequence="(\d+)"/g)].map((m) => Number(m[1]));
    expect(seqs).toHaveLength(1);
    expect(seqs[0]).toBe(next);
    expect(second.text).toMatch(/<Execution dataItemId="robot_1_execution"[^>]*>ACTIVE</);
  });
});
