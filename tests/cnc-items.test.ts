// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/cnc-items.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// The DataItems of a CNC (emergency stop, door, spindle speed, path feed rate, system condition) fed from the SHDR stream of
// HYDRA-UMC-BRIDGE-CNC. Off unless asked for. The stream below has the exact shape that bridge writes.
// =============================================================================

import { afterEach, describe, expect, it } from "vitest";
import net from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { validateXML } from "xmllint-wasm";
import { buildApp } from "../src/server.js";
import { CNC_FEEDABLE, CNC_ITEMS } from "../src/cncItems.js";
import { parseShdrCondition, ShdrMachineReader } from "../src/shdrReader.js";
import { toDataItemReading } from "../src/dataitem.js";
import { convertToMtconnectUnit } from "../src/units.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(__dirname, "../schemas/mtconnect-1.7");
const read = (fileName: string) => ({ fileName, contents: readFileSync(path.join(SCHEMA_DIR, fileName), "utf-8") });

async function assertValid(xml: string, schema: string): Promise<void> {
  const result = await validateXML({ xml: { fileName: "response.xml", contents: xml }, schema: read(schema), preload: [read("xlink.xsd")] });
  if (!result.valid) throw new Error(`${schema}: ${result.errors.map((e) => e.rawMessage).join("\n")}`);
}

let server: net.Server | undefined;
let reader: ShdrMachineReader | undefined;
const sockets: net.Socket[] = [];

afterEach(async () => {
  reader?.close();
  reader = undefined;
  for (const socket of sockets.splice(0)) socket.destroy();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

async function serve(lines: string[]): Promise<number> {
  server = net.createServer((socket) => {
    sockets.push(socket);
    socket.write(lines.join("\n") + "\n");
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
  return (server!.address() as net.AddressInfo).port;
}

async function eventually<T>(attempt: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 100; i++) {
    try {
      return await attempt();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw last;
}

const T = "2026-01-01T00:00:00.000Z";

describe("the CNC DataItems are off unless asked for", () => {
  it("the probe has none of them by default", async () => {
    const res = await request(buildApp()).get("/probe");
    for (const item of CNC_ITEMS) expect(res.text).not.toContain(`id="${item.id}"`);
  });

  it("with the option the probe declares them, with their units, and validates against the schema", async () => {
    const res = await request(buildApp({ cncItems: true })).get("/probe");
    expect(res.text).toContain('<DataItem id="estop" category="EVENT" type="EMERGENCY_STOP"/>');
    expect(res.text).toContain('<DataItem id="door" category="EVENT" type="DOOR_STATE"/>');
    expect(res.text).toContain('<DataItem id="spindle_speed" category="SAMPLE" type="SPINDLE_SPEED" units="REVOLUTION/MINUTE"/>');
    expect(res.text).toContain('<DataItem id="path_feedrate" category="SAMPLE" type="PATH_FEEDRATE" units="MILLIMETER/SECOND"/>');
    expect(res.text).toContain('<DataItem id="system" category="CONDITION" type="SYSTEM"/>');
    await assertValid(res.text, "MTConnectDevices_1.7.xsd");
  });

  it("the streams with every item unavailable validate too", async () => {
    const app = buildApp({ cncItems: true, reader: { read: async () => { throw new Error("down"); } } });
    const res = await request(app).get("/current");
    expect(res.text).toContain('dataItemId="estop"');
    await assertValid(res.text, "MTConnectStreams_1.7.xsd");
  });

  it("the environment variable switches it on", async () => {
    process.env.HYDRA_UMC_MTCONNECT_CNC_ITEMS = "1";
    try {
      const res = await request(buildApp({ reader: { read: async () => [] } })).get("/probe");
      expect(res.text).toContain('id="spindle_speed"');
    } finally {
      delete process.env.HYDRA_UMC_MTCONNECT_CNC_ITEMS;
    }
  });
});

describe("units", () => {
  it("a feed rate in mm/min becomes mm/s", () => {
    expect(convertToMtconnectUnit(600, "MILLIMETER_PER_MINUTE")).toEqual({ value: 10, unit: "MILLIMETER/SECOND" });
    expect(toDataItemReading({ id: "path_feedrate", category: "SAMPLE", type: "PATH_FEEDRATE", nativeUnit: "MILLIMETER_PER_MINUTE", value: 90, timestampMs: 1 })).toMatchObject({ value: "1.5", units: "MILLIMETER/SECOND" });
  });
});

describe("condition lines", () => {
  it("are read with their code and message, an escaped pipe included", () => {
    expect(parseShdrCondition(`${T}|system|FAULT|ESTOP|||emergency stop`)).toEqual([Date.parse(T), "system", "FAULT", "ESTOP", "emergency stop"]);
    expect(parseShdrCondition(`${T}|system|WARNING|X|||a\\|b`)?.[4]).toBe("a|b");
    expect(parseShdrCondition(`${T}|system|UNAVAILABLE||||`)).toEqual([Date.parse(T), "system", "UNAVAILABLE", "", ""]);
    expect(parseShdrCondition(`${T}|execution|ACTIVE`)).toBeNull();
    expect(parseShdrCondition("* PING")).toBeNull();
    expect(parseShdrCondition(`nonsense|system|FAULT|E|||m`)).toBeNull();
  });
});

describe("the reader with the CNC items", () => {
  it("keeps the extra items of the stream of the CNC bridge, with the right categories", async () => {
    const port = await serve([
      `${T}|avail|AVAILABLE`,
      `${T}|execution|ACTIVE`,
      `${T}|estop|ARMED`,
      `${T}|door|CLOSED`,
      `${T}|spindle_speed|12000`,
      `${T}|path_feedrate|600`,
      `${T}|system|FAULT|DOOR_OPEN|||safety door open`,
    ]);
    reader = new ShdrMachineReader({ host: "127.0.0.1", port, feedable: CNC_FEEDABLE });
    const readings = await eventually(async () => {
      const got = await reader!.read();
      if (!got.some((r) => r.id === "system")) throw new Error("not yet");
      return got;
    });
    const byId = Object.fromEntries(readings.map((r) => [r.id, r]));
    expect(Object.keys(byId).sort()).toEqual(["avail", "door", "estop", "execution", "path_feedrate", "spindle_speed", "system"]);
    expect(byId.estop).toMatchObject({ category: "EVENT", type: "EMERGENCY_STOP", value: "ARMED" });
    expect(byId.spindle_speed).toMatchObject({ category: "SAMPLE", value: 12000, nativeUnit: "RPM" });
    expect(byId.path_feedrate).toMatchObject({ category: "SAMPLE", value: 600, nativeUnit: "MILLIMETER_PER_MINUTE" });
    expect(byId.system).toMatchObject({ category: "CONDITION", value: "FAULT", nativeCode: "DOOR_OPEN", message: "safety door open" });
  });

  it("a sample the bridge does not know (UNAVAILABLE) is no value, and a stream without the option ignores the extras", async () => {
    const port = await serve([`${T}|execution|READY`, `${T}|spindle_speed|UNAVAILABLE`, `${T}|estop|TRIGGERED`]);
    reader = new ShdrMachineReader({ host: "127.0.0.1", port, feedable: CNC_FEEDABLE });
    const readings = await eventually(async () => {
      const got = await reader!.read();
      if (!got.some((r) => r.id === "estop")) throw new Error("not yet");
      return got;
    });
    expect(readings.find((r) => r.id === "spindle_speed")?.value).toBeNull();
    reader.close();
    reader = new ShdrMachineReader({ host: "127.0.0.1", port });
    const plain = await eventually(async () => {
      const got = await reader!.read();
      if (!got.some((r) => r.id === "execution")) throw new Error("not yet");
      return got;
    });
    expect(plain.map((r) => r.id)).toEqual(["execution"]);
  });
});
