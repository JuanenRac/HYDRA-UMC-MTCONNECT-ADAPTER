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

// MTConnect implementations commonly default to 5000 (the "mtconnect"
// convention used by most reference Agents) - kept as the default here so
// any off-the-shelf MTConnect Agent/collector can point at this adapter
// with zero configuration during local development.
const DEFAULT_PORT = Number(process.env.PORT) || 5000;

export function buildApp(): Express {
  const app = express();

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
      </DataItems>
    </Device>
  </Devices>
</MTConnectDevices>
`;
    res.type("application/xml").send(xml);
  });

  // GET /current - the latest value of every DataItem declared in /probe.
  // AVAILABLE/UNAVAILABLE here reflects this adapter's own uptime, not a
  // real HydraNode connection yet - see mejoras_futuras.txt for the real
  // HydraState wiring this stands in for.
  app.get("/current", (_req, res) => {
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
