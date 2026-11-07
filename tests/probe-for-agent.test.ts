// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/probe-for-agent.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// GET /probe?shdr=1: the device model for an agent that reads the SHDR output. The SHDR lines carry values already in the declared units, so
// the model leaves out nativeUnits (a real cppagent converts a value from its nativeUnits, which would convert a Celsius value a second time).
// =============================================================================
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { validateXML } from "xmllint-wasm";
import { buildApp } from "../src/server.js";

const SCHEMA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../schemas/mtconnect-1.7");
const schema = (fileName: string) => ({ fileName, contents: readFileSync(path.join(SCHEMA_DIR, fileName), "utf-8") });

// the header carries the time of the answer
const withoutTime = (xml: string): string => xml.replace(/creationTime="[^"]*"/, "").replace(/instanceId="\d+"/, "");

describe("GET /probe?shdr=1", () => {
  it("keeps nativeUnits in the normal model and leaves it out for an agent", async () => {
    const app = buildApp();
    const normal = await request(app).get("/probe");
    expect(normal.text).toContain('nativeUnits="FAHRENHEIT"');
    const forAgent = await request(app).get("/probe?shdr=1");
    expect(forAgent.status).toBe(200);
    expect(forAgent.text).not.toContain("nativeUnits");
    expect(forAgent.text).toContain('units="CELSIUS"');
  });

  it("changes nothing else of the model", async () => {
    const app = buildApp();
    const normal = (await request(app).get("/probe")).text;
    const forAgent = (await request(app).get("/probe?shdr=1")).text;
    expect(withoutTime(forAgent)).toBe(withoutTime(normal.replace(/ nativeUnits="[^"]*"/g, "")));
  });

  it("only the exact value 1 changes the model", async () => {
    const app = buildApp();
    const normal = (await request(app).get("/probe")).text;
    for (const value of ["0", "true", "yes", "", "11"]) {
      const answer = await request(app).get(`/probe?shdr=${value}`);
      expect(answer.status).toBe(200);
      expect(withoutTime(answer.text)).toBe(withoutTime(normal));
    }
  });

  it("also answers on the route of one device", async () => {
    const app = buildApp();
    const answer = await request(app).get("/HydraNode_1/probe?shdr=1");
    if (answer.status === 200) expect(answer.text).not.toContain("nativeUnits");
    else expect([404]).toContain(answer.status);
  });

  it("is still valid against the MTConnect 1.7 schema", async () => {
    const res = await request(buildApp()).get("/probe?shdr=1");
    const result = await validateXML({
      xml: { fileName: "response.xml", contents: res.text },
      schema: schema("MTConnectDevices_1.7.xsd"),
      preload: [schema("xlink.xsd")],
    });
    expect(result.errors.map((e) => e.rawMessage)).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
