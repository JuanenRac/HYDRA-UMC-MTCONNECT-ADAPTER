// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/conditions-and-devices.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// CONDITION DataItems (Normal, Warning, Fault, Unavailable), the asset events a Device declares,
// per-device routes, the optional HTTP error statuses and the XML helper - all checked, where a
// document is produced, against the official MTConnect 1.7 schemas.
// =============================================================================
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { validateXML } from "xmllint-wasm";
import { buildApp, errorStatus } from "../src/server.js";
import { ObservationBuffer } from "../src/buffer.js";
import { toDataItemReading } from "../src/dataitem.js";
import { element, escapeXml } from "../src/xml.js";
import type { MachineReader } from "../src/reader.js";
import type { RawReading } from "../src/dataitem.js";

const SCHEMA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../schemas/mtconnect-1.7");
const schema = (fileName: string) => ({ fileName, contents: readFileSync(path.join(SCHEMA_DIR, fileName), "utf-8") });

async function assertValid(xml: string, schemaFile: string): Promise<void> {
  const result = await validateXML({ xml: { fileName: "response.xml", contents: xml }, schema: schema(schemaFile), preload: [schema("xlink.xsd")] });
  if (!result.valid) throw new Error(`${schemaFile}: ${result.errors.map((e) => e.rawMessage).join("\n")}`);
}

const CONDITION_ITEM = { id: "system_cond", category: "CONDITION" as const, type: "SYSTEM" };

/** A reader whose condition can be changed from the test. */
function conditionReader(initial: Partial<RawReading>): { reader: MachineReader; set: (next: Partial<RawReading>) => void } {
  let current = initial;
  return {
    reader: { read: async () => [{ id: "system_cond", category: "CONDITION", type: "SYSTEM", value: "normal", timestampMs: Date.now(), ...current }] },
    set: (next) => {
      current = next;
    },
  };
}

describe("CONDITION DataItems", () => {
  it("are declared in /probe when the device has them, and /probe still validates", async () => {
    const res = await request(buildApp({ extraItems: [CONDITION_ITEM] })).get("/probe");
    expect(res.text).toContain('<DataItem id="system_cond" category="CONDITION" type="SYSTEM"/>');
    await assertValid(res.text, "MTConnectDevices_1.7.xsd");
  });

  it("start UNAVAILABLE, like every DataItem, and the document validates", async () => {
    const app = buildApp({ reader: { read: async () => { throw new Error("down"); } }, extraItems: [CONDITION_ITEM] });
    const res = await request(app).get("/current");
    expect(res.text).toMatch(/<Condition>\s*<Unavailable dataItemId="system_cond"[^>]*type="SYSTEM"\/>\s*<\/Condition>/);
    await assertValid(res.text, "MTConnectStreams_1.7.xsd");
  });

  it("are served as Normal, Warning or Fault with the message and the native code, and validate", async () => {
    const { reader, set } = conditionReader({ value: "normal" });
    const app = buildApp({ reader, minPollIntervalMs: 0, extraItems: [CONDITION_ITEM] });
    let res = await request(app).get("/current");
    expect(res.text).toMatch(/<Normal dataItemId="system_cond" timestamp="[^"]+" sequence="\d+" type="SYSTEM"\/>/);
    await assertValid(res.text, "MTConnectStreams_1.7.xsd");

    set({ value: "Fault", message: 'Spindle < 5 & "overheating"', nativeCode: "E-12" });
    res = await request(app).get("/current");
    expect(res.text).toMatch(/<Fault dataItemId="system_cond"[^>]*type="SYSTEM" nativeCode="E-12">Spindle &lt; 5 &amp; &quot;overheating&quot;<\/Fault>/);
    expect(res.text).not.toContain("<Normal");
    await assertValid(res.text, "MTConnectStreams_1.7.xsd");

    set({ value: "WARNING", message: "cooling slowly" });
    res = await request(app).get("/current");
    expect(res.text).toMatch(/<Warning dataItemId="system_cond"[^>]*>cooling slowly<\/Warning>/);
    await assertValid(res.text, "MTConnectStreams_1.7.xsd");
  });

  it("a change of level, of message or of code is a new observation; the same condition again is not", async () => {
    const { reader, set } = conditionReader({ value: "fault", message: "a", nativeCode: "1" });
    const app = buildApp({ reader, minPollIntervalMs: 0, extraItems: [CONDITION_ITEM] });
    const count = async () => ((await request(app).get("/sample?from=1&count=1000")).text.match(/<(Normal|Warning|Fault|Unavailable) dataItemId="system_cond"/g) ?? []).length;
    await request(app).get("/current");
    const afterFirst = await count();
    await request(app).get("/current"); // same reading
    expect(await count()).toBe(afterFirst);
    set({ value: "fault", message: "b", nativeCode: "1" });
    await request(app).get("/current");
    expect(await count()).toBe(afterFirst + 1);
    set({ value: "fault", message: "b", nativeCode: "2" });
    await request(app).get("/current");
    expect(await count()).toBe(afterFirst + 2);
  });

  it("a level that is not one of the four becomes UNAVAILABLE / NO_DATA, never a made-up condition", () => {
    for (const value of ["broken", "", null, 3]) {
      const reading = toDataItemReading({ id: "c", category: "CONDITION", type: "SYSTEM", value: value as string | number | null, timestampMs: 1 });
      expect(reading).toMatchObject({ quality: "UNAVAILABLE", value: "UNAVAILABLE", errorCode: "NO_DATA" });
    }
    expect(toDataItemReading({ id: "c", category: "CONDITION", type: "SYSTEM", value: " warning ", timestampMs: 1 })).toMatchObject({ quality: "GOOD", value: "WARNING" });
  });

  it("the buffer keeps the message and the code of a condition", () => {
    const buffer = new ObservationBuffer(10);
    buffer.record({ id: "c", category: "CONDITION", type: "SYSTEM", value: "FAULT", timestampMs: 1, message: "m", nativeCode: "n" });
    expect(buffer.current()[0]).toMatchObject({ message: "m", nativeCode: "n" });
  });
});

describe("the asset events a Device declares", () => {
  it("/probe declares ASSET_CHANGED and ASSET_REMOVED and /current reports them UNAVAILABLE, all schema-valid", async () => {
    const app = buildApp();
    const probe = await request(app).get("/probe");
    expect(probe.text).toContain('type="ASSET_CHANGED"');
    expect(probe.text).toContain('type="ASSET_REMOVED"');
    await assertValid(probe.text, "MTConnectDevices_1.7.xsd");
    const current = await request(app).get("/current");
    expect(current.text).toMatch(/<AssetChanged [^>]*>UNAVAILABLE<\/AssetChanged>/);
    expect(current.text).toMatch(/<AssetRemoved [^>]*>UNAVAILABLE<\/AssetRemoved>/);
    await assertValid(current.text, "MTConnectStreams_1.7.xsd");
  });
});

describe("per-device routes", () => {
  it("/HydraNode_1/probe, /current and /sample answer for that device, by name or by uuid", async () => {
    const app = buildApp();
    const probe = await request(app).get("/hydra-umc-node-1/probe");
    expect(probe.text).toContain('name="HydraNode_1"');
    await assertValid(probe.text, "MTConnectDevices_1.7.xsd");

    const current = await request(app).get("/HydraNode_1/current");
    expect(current.text).toContain('<DeviceStream name="HydraNode_1"');
    expect(current.text).not.toContain('name="Agent"');
    await assertValid(current.text, "MTConnectStreams_1.7.xsd");

    const sample = await request(app).get("/hydra-umc-node-1/sample?from=1&count=3");
    expect(sample.text).toContain('<DeviceStream name="HydraNode_1"');
    expect(sample.text).not.toContain('name="Agent"');
    await assertValid(sample.text, "MTConnectStreams_1.7.xsd");
  });

  it("another device name is a NO_DEVICE error that validates", async () => {
    const res = await request(buildApp()).get("/Lathe_9/current");
    expect(res.text).toContain('errorCode="NO_DEVICE"');
    expect(res.status).toBe(200);
    await assertValid(res.text, "MTConnectError_1.7.xsd");
  });

  it("the bare routes still describe the agent and the device", async () => {
    const res = await request(buildApp()).get("/current");
    expect(res.text).toContain('name="Agent"');
    expect(res.text).toContain('name="HydraNode_1"');
  });
});

describe("HTTP statuses for MTConnectError", () => {
  it("stay 200 by default, as before", async () => {
    const app = buildApp();
    expect((await request(app).get("/sample?from=x")).status).toBe(200);
    expect((await request(app).get("/Nope/probe")).status).toBe(200);
  });

  it("become 400 and 404 when switched on, with the same valid XML body", async () => {
    const app = buildApp({ httpErrors: true });
    const invalid = await request(app).get("/sample?from=x");
    expect(invalid.status).toBe(400);
    await assertValid(invalid.text, "MTConnectError_1.7.xsd");
    await request(app).get("/current");
    expect((await request(app).get("/sample?from=0")).status).toBe(400); // OUT_OF_RANGE
    expect((await request(app).get("/sample?count=5000")).status).toBe(400);
    const missing = await request(app).get("/Nope/current");
    expect(missing.status).toBe(404);
    await assertValid(missing.text, "MTConnectError_1.7.xsd");
    expect((await request(app).get("/current")).status).toBe(200);
  });

  it("follow HYDRA_UMC_MTCONNECT_HTTP_ERRORS=1 and map the codes as documented", async () => {
    process.env.HYDRA_UMC_MTCONNECT_HTTP_ERRORS = "1";
    try {
      expect((await request(buildApp()).get("/sample?from=x")).status).toBe(400);
    } finally {
      delete process.env.HYDRA_UMC_MTCONNECT_HTTP_ERRORS;
    }
    expect(errorStatus("INVALID_REQUEST", true)).toBe(400);
    expect(errorStatus("OUT_OF_RANGE", true)).toBe(400);
    expect(errorStatus("NO_DEVICE", true)).toBe(404);
    expect(errorStatus("NO_DEVICE", false)).toBe(200);
  });
});

describe("the XML helper", () => {
  it("escapes every attribute value and the text, and leaves out an undefined attribute", () => {
    expect(element("Error", [["errorCode", 'A"B'], ["x", undefined]], "<&>")).toBe('<Error errorCode="A&quot;B">&lt;&amp;&gt;</Error>');
    expect(element("Empty", [["a", 1]])).toBe('<Empty a="1"/>');
  });

  it("drops the control characters XML 1.0 cannot carry", () => {
    expect(escapeXml("a\u0000b\u0007c\td\ne")).toBe("abc\td\ne");
  });
});
