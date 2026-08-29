// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - MTConnect XML/HTTP Interface: src/server.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// Legacy and factory-standard bridge for machine tool monitoring (see this
// project's own README.md for the full rationale). Implements the two
// read-only HTTP requests every MTConnect Agent/collector expects
// (GET /probe for the static device model, GET /current for the latest
// DataItem values) so existing MTConnect tooling can monitor a HydraNode
// without a specialized driver. This entry point hand-builds the XML
// envelopes directly (no xml2js/fast-xml-parser dependency) since the
// payload shape is fixed and small - real per-robot DataItems (execution
// state, tool position, sensor values) get wired into buildCurrent() once
// HYDRA-UMC-GATEWAY-INDUSTRIAL defines how HydraState reaches this
// adapter; this proves the HTTP surface itself is real and responds with
// spec-shaped XML today, verified by tests/server.test.ts with real HTTP
// requests against a real listening server.
//
// buildApp() is exported (separately from starting the listener) so tests
// can exercise the real Express app without binding a port, and main()
// below is the only thing that actually calls app.listen().
// =============================================================================

import express, { type Express } from "express";
import { readPackageVersion } from "./version.js";
import { sourceUnavailableReading, toDataItemReading, type DataItemReading, type RawReading } from "./dataitem.js";
import { CachedReader, type MachineReader } from "./reader.js";

// MTConnect implementations commonly default to 5000 (the "mtconnect"
// convention used by most reference Agents) - kept as the default here so
// any off-the-shelf MTConnect Agent/collector can point at this adapter
// with zero configuration during local development.
const DEFAULT_PORT = Number(process.env.PORT) || 5000;

// Real, honest v0 limitation: no real machine source exists in this
// environment yet - this fixture reader proves
// the real unit-conversion/quality/degraded-mode pipeline (dataitem.ts,
// reader.ts) end to end with a real, if synthetic, reading, exactly like
// this adapter's own pre-existing hardcoded execution/availability values
// stand in for a real HydraNode connection.
class FixtureMachineReader implements MachineReader {
  async read(): Promise<RawReading[]> {
    return [{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "FAHRENHEIT", value: 140, timestampMs: Date.now() }];
  }
}

function typeToElementName(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

// Real bug fixed after a live audit: every interpolated value below used to
// go straight into the hand-built XML string with zero escaping -
// typeToElementName() sanitizes the element NAME, but nothing sanitized
// the content/attributes. `DataItemReading.value` is always a string
// (toDataItemReading() converts a RawReading's `number | string | null`
// into one), and can legitimately BE an arbitrary device-reported string
// for an EVENT-category reading (e.g. an alarm/status message) - once a
// real MachineReader is wired to live hardware (this file's own stated
// near-term next step), any such value containing `<`, `&` or `"` would
// corrupt the MTConnect document for every real Agent/collector parsing
// it, or worse, inject XML into the response. Standard XML 1.0
// predefined-entity escaping - order matters (& must be escaped first, or
// a later &lt; would itself get re-escaped into &amp;lt;).
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderSampleElement(reading: DataItemReading): string {
  const elementName = typeToElementName(reading.type);
  const unitsAttr = reading.units ? ` units="${escapeXml(reading.units)}"` : "";
  const errorAttr = reading.errorCode ? ` errorCode="${escapeXml(reading.errorCode)}"` : "";
  const timestamp = new Date(reading.timestampMs).toISOString();
  return `<${elementName} dataItemId="${escapeXml(reading.id)}" timestamp="${timestamp}" sequence="1"${unitsAttr}${errorAttr}>${escapeXml(reading.value)}</${elementName}>`;
}

export interface BuildAppOptions {
  /** Real machine source to poll for /current's real Samples block.
   * Defaults to FixtureMachineReader - a real, testable synthetic
   * reading, not a live HydraNode. */
  reader?: MachineReader;
  /** Real minimum interval between actual reads of `reader` - see
   * reader.ts's CachedReader. Defaults to POLL_INTERVAL_MS or 1000ms. */
  minPollIntervalMs?: number;
}

export function buildApp(options: BuildAppOptions = {}): Express {
  const app = express();
  const cachedReader = new CachedReader(
    options.reader ?? new FixtureMachineReader(),
    options.minPollIntervalMs ?? (Number(process.env.POLL_INTERVAL_MS) || 1000),
  );

  // Every MTConnect response carries the same header block (creation time,
  // instance ID, buffer/asset counts) - centralized here so /probe and
  // /current stay consistent with each other, matching the ANSI/MTC1.4
  // envelope shape real Agents expect to parse.
  const instanceId = Date.now();

  function mtconnectHeader(): string {
    return `<Header creationTime="${new Date().toISOString()}" sender="HYDRA-UMC-MTCONNECT-ADAPTER" instanceId="${instanceId}" version="${readPackageVersion()}" bufferSize="131072" nextSequence="1" firstSequence="1" lastSequence="1"/>`;
  }

  // GET /probe - the static device model: which HydraNodes exist and what
  // DataItems each one exposes. Real deployments generate this from the
  // live robot roster (HYDRA-UMC-SERVER's own /api/hydra-info); this
  // placeholder exposes exactly one HydraNode so the response shape is
  // already spec-correct end to end.
  app.get("/probe", (_req, res) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MTConnectDevices xmlns="urn:mtconnect.org:MTConnectDevices:1.7">
  ${mtconnectHeader()}
  <Devices>
    <Device id="hydra_umc_1" name="HydraNode_1" uuid="hydra-umc-node-1">
      <Description manufacturer="JuanenRac (Electro Hobby 3D)">HYDRA-UMC multi-robot micro-factory cell</Description>
      <DataItems>
        <DataItem id="execution" category="EVENT" type="EXECUTION"/>
        <DataItem id="avail" category="EVENT" type="AVAILABILITY"/>
        <DataItem id="spindle_temp" category="SAMPLE" type="TEMPERATURE" units="DEGREE_CELSIUS" nativeUnits="FAHRENHEIT"/>
      </DataItems>
    </Device>
  </Devices>
</MTConnectDevices>
`;
    res.type("application/xml").send(xml);
  });

  // GET /current - the latest value of every DataItem declared in /probe.
  // AVAILABLE/UNAVAILABLE here reflects this adapter's own uptime, not a
  // real HydraNode connection yet - this stands in for the real HydraState
  // wiring that will eventually replace it. spindle_temp, by contrast, goes
  // through the real unit-conversion/quality/degraded-mode pipeline
  // (dataitem.ts/reader.ts) - a real fixture reading today, real
  // machine data once one exists, with the same rendering either way.
  app.get("/current", async (_req, res) => {
    let sampleReadings: DataItemReading[];
    try {
      const raw = await cachedReader.getReadings();
      sampleReadings = raw.map(toDataItemReading);
    } catch {
      // The source itself is down (see reader.ts's SourceUnavailableError)
      // - real degraded output, not a 500 and not stale data pretending
      // to be live.
      sampleReadings = [sourceUnavailableReading("spindle_temp", "SAMPLE", "TEMPERATURE", Date.now())];
    }
    const samplesXml = sampleReadings.map(renderSampleElement).join("\n          ");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MTConnectStreams xmlns="urn:mtconnect.org:MTConnectStreams:1.7">
  ${mtconnectHeader()}
  <Streams>
    <DeviceStream name="HydraNode_1" uuid="hydra-umc-node-1">
      <ComponentStream component="Device" name="HydraNode_1">
        <Events>
          <Execution dataItemId="execution" timestamp="${new Date().toISOString()}" sequence="1">READY</Execution>
          <Availability dataItemId="avail" timestamp="${new Date().toISOString()}" sequence="1">AVAILABLE</Availability>
        </Events>
        <Samples>
          ${samplesXml}
        </Samples>
      </ComponentStream>
    </DeviceStream>
  </Streams>
</MTConnectStreams>
`;
    res.type("application/xml").send(xml);
  });

  return app;
}

function main() {
  const app = buildApp();
  app.listen(DEFAULT_PORT, "0.0.0.0", () => {
    console.log("=================================================");
    console.log(` HYDRA-UMC-MTCONNECT-ADAPTER v${readPackageVersion()}`);
    console.log(" ROLE: Standardized XML/HTTP interface for machine tool monitoring");
    console.log(` STATUS: Running on port ${DEFAULT_PORT} - probe: http://localhost:${DEFAULT_PORT}/probe`);
    console.log("=================================================");
  });
}

// Only auto-start when run directly, not when imported by
// tests/server.test.ts.
const entryFile = process.argv[1] ? process.argv[1].split(/[/\\]/).pop() : "";
if (entryFile === "server.ts" || entryFile === "server.cjs" || entryFile === "server.js") {
  main();
}
