// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/xsd-validation.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// Real schema validation, not just a shape/substring check like
// server.test.ts already does. Validates every real endpoint's own
// generated XML against the actual, official MTConnect 1.7 XSD schemas
// (vendored unmodified from https://github.com/mtconnect/schema,
// Apache-2.0 - see schemas/mtconnect-1.7/NOTICE.md) using xmllint-wasm (a
// real libxml2 xmllint build compiled to WebAssembly - no native
// compilation step, kept as a devDependency only, never shipped in the
// built/bundled adapter). This is the one place this repo actually proves
// the emitted XML is not just spec-SHAPED (namespaces/ids matching, which
// server.test.ts already covers) but spec-VALID against the real standard
// document.
// =============================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { validateXML } from "xmllint-wasm";
import { buildApp } from "../src/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(__dirname, "../schemas/mtconnect-1.7");

function readSchema(fileName: string): { fileName: string; contents: string } {
  return { fileName, contents: readFileSync(path.join(SCHEMA_DIR, fileName), "utf-8") };
}

// xlink.xsd is MTConnectDevices_1.7.xsd's own real xs:import dependency
// (see schemas/mtconnect-1.7/NOTICE.md) - xmllint needs it preloaded into
// its in-memory filesystem under the exact relative name the importing
// schema references, or every /probe validation would fail on a missing
// import rather than a real content problem.
const xlink = readSchema("xlink.xsd");

async function assertValidAgainst(xml: string, schemaFileName: string): Promise<void> {
  const result = await validateXML({
    xml: { fileName: "response.xml", contents: xml },
    schema: readSchema(schemaFileName),
    preload: [xlink],
  });
  if (!result.valid) {
    const details = result.errors.map((e) => e.rawMessage).join("\n");
    throw new Error(`${schemaFileName} validation failed:\n${details}`);
  }
  expect(result.valid).toBe(true);
}

describe("HYDRA-UMC-MTCONNECT-ADAPTER (real MTConnect 1.7 XSD validation)", () => {
  it("GET /probe's XML validates against the real MTConnectDevices_1.7.xsd", async () => {
    const res = await request(buildApp()).get("/probe");
    expect(res.status).toBe(200);
    await assertValidAgainst(res.text, "MTConnectDevices_1.7.xsd");
  });

  it("GET /current's XML validates against the real MTConnectStreams_1.7.xsd", async () => {
    const res = await request(buildApp()).get("/current");
    expect(res.status).toBe(200);
    await assertValidAgainst(res.text, "MTConnectStreams_1.7.xsd");
  });

  it("GET /sample's XML validates against the real MTConnectStreams_1.7.xsd", async () => {
    const res = await request(buildApp()).get("/sample");
    expect(res.status).toBe(200);
    await assertValidAgainst(res.text, "MTConnectStreams_1.7.xsd");
  });

  it("a real INVALID_REQUEST error response validates against the real MTConnectError_1.7.xsd", async () => {
    const res = await request(buildApp()).get("/sample?from=not-a-number");
    expect(res.status).toBe(200);
    expect(res.text).toContain("INVALID_REQUEST");
    await assertValidAgainst(res.text, "MTConnectError_1.7.xsd");
  });

  it("a real OUT_OF_RANGE error response validates against the real MTConnectError_1.7.xsd", async () => {
    const app = buildApp();
    // A real read must happen first so firstSequence pins to 1 (see
    // server.ts's own bufferBounds doc comment) - only then is `from=0`
    // genuinely older than the retained buffer, the real OUT_OF_RANGE case.
    await request(app).get("/current");
    const res = await request(app).get("/sample?from=0");
    expect(res.status).toBe(200);
    expect(res.text).toContain("OUT_OF_RANGE");
    await assertValidAgainst(res.text, "MTConnectError_1.7.xsd");
  });
});
