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
// payload shape is fixed and small. GET /current's real Events/Samples
// now come from a real MachineReader (buildReader() below) - either a
// real HydraServerMachineReader polling a live HYDRA-UMC-SERVER's own
// GET /api/settings for one real robot's own state, or the honest
// FixtureMachineReader fallback with no server configured. The dynamic,
// one-Device-per-robot address space HYDRA-UMC-GATEWAY-INDUSTRIAL's own
// design eventually calls for is still separate, larger work; this
// adapter still models exactly one HydraNode - see /probe below.
// Verified by tests/server.test.ts with real HTTP requests against a
// real listening server.
//
// buildApp() is exported (separately from starting the listener) so tests
// can exercise the real Express app without binding a port, and main()
// below is the only thing that actually calls app.listen().
// =============================================================================

import express, { type Express } from "express";
import { readPackageVersion } from "./version.js";
import { sourceUnavailableReading, toDataItemReading, type DataItemReading, type RawReading } from "./dataitem.js";
import { CachedReader, type MachineReader } from "./reader.js";
import { HydraServerMachineReader } from "./hydraServerReader.js";

// MTConnect implementations commonly default to 5000 (the "mtconnect"
// convention used by most reference Agents) - kept as the default here so
// any off-the-shelf MTConnect Agent/collector can point at this adapter
// with zero configuration during local development.
const DEFAULT_PORT = Number(process.env.PORT) || 5000;

// Real, honest v0 fallback for a deployment with no real HYDRA_UMC_SERVER_URL
// configured (see buildReader() below) - proves the real unit-conversion/
// quality/degraded-mode pipeline (dataitem.ts, reader.ts) and the real
// Events/Samples rendering below end to end with fixed, synthetic
// readings, without needing a live HYDRA-UMC-SERVER reachable.
class FixtureMachineReader implements MachineReader {
  async read(): Promise<RawReading[]> {
    const timestampMs = Date.now();
    return [
      { id: "execution", category: "EVENT", type: "EXECUTION", value: "READY", timestampMs },
      { id: "avail", category: "EVENT", type: "AVAILABILITY", value: "AVAILABLE", timestampMs },
      { id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "FAHRENHEIT", value: 140, timestampMs },
    ];
  }
}

// Real gap found while auditing the code: this
// was always FixtureMachineReader, unconditionally - there was no real
// MachineReader anywhere in this repo, even though a real source
// (HYDRA-UMC-SERVER's own GET /api/settings) already exists and is
// already what HYDRA-UMC-TOOL-CLI's own robots.go reads. Setting
// HYDRA_UMC_SERVER_URL switches to that real reader; unset, this stays
// exactly the honest fixture behavior it always was - no live server
// reachable is a real, supported deployment (local development, a demo,
// CI), not an error.
function buildReader(): MachineReader {
  const serverUrl = process.env.HYDRA_UMC_SERVER_URL;
  if (!serverUrl) return new FixtureMachineReader();
  const robotIdRaw = process.env.HYDRA_UMC_ROBOT_ID;
  const robotId = robotIdRaw ? Number(robotIdRaw) : undefined;
  if (robotIdRaw && (!Number.isInteger(robotId) || robotId! < 0)) {
    throw new Error(`HYDRA-UMC-MTCONNECT-ADAPTER: HYDRA_UMC_ROBOT_ID must be a non-negative integer, got ${robotIdRaw}`);
  }
  return new HydraServerMachineReader({ baseUrl: serverUrl, robotId });
}

function typeToElementName(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

// Real bug fixed while auditing the code: every interpolated value below used to
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

// I43: `sequence` is a real, caller-supplied MTConnect sequence number
// (see CachedReader's own `sequence` getter) - never a hardcoded literal.
// Every DataItem in the SAME real batch of readings shares this one
// number, matching the batch-level granularity this adapter's own
// buffer actually keeps (see mtconnectHeader()'s own doc comment).
function renderDataItemElement(reading: DataItemReading, sequence: number): string {
  const elementName = typeToElementName(reading.type);
  const unitsAttr = reading.units ? ` units="${escapeXml(reading.units)}"` : "";
  const errorAttr = reading.errorCode ? ` errorCode="${escapeXml(reading.errorCode)}"` : "";
  const timestamp = new Date(reading.timestampMs).toISOString();
  return `<${elementName} dataItemId="${escapeXml(reading.id)}" timestamp="${timestamp}" sequence="${sequence}"${unitsAttr}${errorAttr}>${escapeXml(reading.value)}</${elementName}>`;
}

export interface BuildAppOptions {
  /** Real machine source to poll for /current's real Events/Samples
   * blocks. Defaults to buildReader()'s own real choice - a real
   * HydraServerMachineReader when HYDRA_UMC_SERVER_URL is set, otherwise
   * the honest FixtureMachineReader fallback. */
  reader?: MachineReader;
  /** Real minimum interval between actual reads of `reader` - see
   * reader.ts's CachedReader. Defaults to POLL_INTERVAL_MS or 1000ms. */
  minPollIntervalMs?: number;
}

export function buildApp(options: BuildAppOptions = {}): Express {
  const app = express();
  const cachedReader = new CachedReader(
    options.reader ?? buildReader(),
    options.minPollIntervalMs ?? (Number(process.env.POLL_INTERVAL_MS) || 1000),
  );

  // Every MTConnect response carries the same header block (creation time,
  // instance ID, buffer/asset counts) - centralized here so /probe and
  // /current stay consistent with each other, matching the ANSI/MTC1.4
  // envelope shape real Agents expect to parse.
  const instanceId = Date.now();

  // I43 ("coherencia de instancia y secuencia en reinicios"): first/last/
  // nextSequence are now real, derived from cachedReader's own real
  // sequence counter - never the hardcoded "1" literal every response
  // used to carry regardless of how many times this process had actually
  // polled its source. This adapter keeps no real historical buffer of
  // INTERMEDIATE readings - only the single most recent batch is ever
  // retrievable - but it never refuses to discuss any sequence number
  // this process could plausibly have produced: `firstSequence` is
  // pinned to 1 the moment a first real read ever succeeds (0 before
  // that - a real, honest "nothing observed yet" state), never chasing
  // `lastSequence` upward on every new poll. Pinning it is what makes
  // GET /sample below able to answer "what's new since sequence N" for
  // ANY real past N without a request's own read racing the very
  // firstSequence it would be compared against - see that handler's own
  // doc comment for exactly what "the buffer" honestly promises here.
  // `instanceId` above already changes on every real process restart; a
  // consumer that stored a `from` cursor against a sequence lower than
  // this process could ever have produced (i.e. before it started, or
  // from a since-restarted, different instance) gets a real, explicit
  // OUT_OF_RANGE error from GET /sample below, never a silent mix of old
  // and new data.
  // The one real place firstSequence's own pinning rule lives - see
  // mtconnectHeader's own doc comment above for why it never chases
  // lastSequence upward. Shared by mtconnectHeader() and GET /sample's
  // own OUT_OF_RANGE check below so the two can never silently drift
  // apart into disagreeing about what "in range" means.
  function bufferBounds(): { firstSequence: number; lastSequence: number } {
    const lastSequence = cachedReader.sequence;
    return { firstSequence: lastSequence > 0 ? 1 : 0, lastSequence };
  }

  function mtconnectHeader(): string {
    const { firstSequence, lastSequence } = bufferBounds();
    const nextSequence = lastSequence + 1;
    return `<Header creationTime="${new Date().toISOString()}" sender="HYDRA-UMC-MTCONNECT-ADAPTER" instanceId="${instanceId}" version="${readPackageVersion()}" bufferSize="131072" nextSequence="${nextSequence}" firstSequence="${firstSequence}" lastSequence="${lastSequence}"/>`;
  }

  function mtconnectErrorXml(errorCode: string, message: string): string {
    // Errors reuse the exact same real Header block as every other
    // response, matching the shared base Header type real MTConnect
    // schemas define across MTConnectDevices/Streams/Error/Assets - a
    // consumer parsing this error's own instanceId/sequence attributes
    // sees the same real, current buffer position it would from a
    // successful response.
    return `<?xml version="1.0" encoding="UTF-8"?>
<MTConnectError xmlns="urn:mtconnect.org:MTConnectError:1.7">
  ${mtconnectHeader()}
  <Errors>
    <Error errorCode="${escapeXml(errorCode)}">${escapeXml(message)}</Error>
  </Errors>
</MTConnectError>
`;
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
  // Real gap closed in the same review pass as buildReader() above:
  // Execution/Availability used to be hardcoded literals here,
  // unconditionally - wiring in a real reader would have changed nothing
  // about this response. All three DataItems now render from the SAME
  // real reader output, split by DataItemReading.category - the exact
  // real unit-conversion/quality/degraded-mode pipeline (dataitem.ts/
  // reader.ts) FixtureMachineReader's own spindle_temp already used.
  app.get("/current", async (_req, res) => {
    let readings: DataItemReading[];
    try {
      const raw = await cachedReader.getReadings();
      readings = raw.map(toDataItemReading);
    } catch {
      // The source itself is down (see reader.ts's SourceUnavailableError)
      // - real degraded output for every DataItem this adapter declares,
      // not a 500 and not stale data pretending to be live. A source that
      // cannot be reached at all cannot honestly report its own execution
      // state either - this is real UNAVAILABLE, not the old hardcoded
      // "READY" a down source used to still claim.
      const timestampMs = Date.now();
      readings = [
        sourceUnavailableReading("execution", "EVENT", "EXECUTION", timestampMs),
        sourceUnavailableReading("avail", "EVENT", "AVAILABILITY", timestampMs),
        sourceUnavailableReading("spindle_temp", "SAMPLE", "TEMPERATURE", timestampMs),
      ];
    }
    const sequence = cachedReader.sequence;
    const eventsXml = readings.filter((r) => r.category === "EVENT").map((r) => renderDataItemElement(r, sequence)).join("\n          ");
    const samplesXml = readings.filter((r) => r.category === "SAMPLE").map((r) => renderDataItemElement(r, sequence)).join("\n          ");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MTConnectStreams xmlns="urn:mtconnect.org:MTConnectStreams:1.7">
  ${mtconnectHeader()}
  <Streams>
    <DeviceStream name="HydraNode_1" uuid="hydra-umc-node-1">
      <ComponentStream component="Device" name="HydraNode_1">
        <Events>
          ${eventsXml}
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

  // GET /sample?from=<sequence> - I43's own real acceptance test: a
  // consumer resuming from a remembered sequence must get a response
  // coherent with the real contract, never a silent mix of old and new
  // data. This adapter keeps no real retained buffer of INTERMEDIATE
  // readings - only the single most recent batch is ever retrievable -
  // but bufferBounds() above never treats a real past sequence as
  // unreachable just because more polls happened since. The 3 real,
  // honest outcomes are: `from` omitted, or below lastSequence -> the
  // current batch (the real answer to "what's new since then", even
  // though any readings strictly BETWEEN `from` and lastSequence were
  // never individually retained - a consumer sees the gap for itself by
  // comparing sequence numbers, never told a comforting lie about it);
  // `from` at or past lastSequence -> a real, valid EMPTY result
  // (nothing new has happened yet); `from` below firstSequence (below 1,
  // i.e. requesting data from before this process ever produced any) ->
  // a real OUT_OF_RANGE error, since no amount of "give you the latest"
  // could honestly answer a request for a time before this instance
  // existed at all.
  app.get("/sample", async (req, res) => {
    const fromRaw = req.query.from;
    let from: number | undefined;
    if (fromRaw !== undefined) {
      const parsed = Number(fromRaw);
      if (typeof fromRaw !== "string" || !Number.isInteger(parsed) || parsed < 0) {
        res.type("application/xml").send(mtconnectErrorXml("INVALID_REQUEST", `'from' must be a non-negative integer, got ${JSON.stringify(fromRaw)}`));
        return;
      }
      from = parsed;
    }

    // A real read (or the real cached value) is always attempted FIRST,
    // before any decision below - every decision then reflects the
    // buffer's own final, real, current state, never a sequence snapshot
    // taken before a concurrent poll (rate-limited by the same
    // minPollIntervalMs /current already respects) could have moved it.
    let readings: DataItemReading[];
    try {
      const raw = await cachedReader.getReadings();
      readings = raw.map(toDataItemReading);
    } catch {
      const timestampMs = Date.now();
      readings = [
        sourceUnavailableReading("execution", "EVENT", "EXECUTION", timestampMs),
        sourceUnavailableReading("avail", "EVENT", "AVAILABILITY", timestampMs),
        sourceUnavailableReading("spindle_temp", "SAMPLE", "TEMPERATURE", timestampMs),
      ];
    }

    const { firstSequence, lastSequence } = bufferBounds();
    if (from !== undefined && from < firstSequence) {
      res.type("application/xml").send(
        mtconnectErrorXml(
          "OUT_OF_RANGE",
          `requested sequence ${from} is older than this agent's own retained buffer (firstSequence=${firstSequence}, instanceId=${instanceId}) - resynchronize from firstSequence`,
        ),
      );
      return;
    }

    // `from === lastSequence` means "nothing new since my last read" - a
    // real, valid, empty result, not a repeat of the same data.
    const includeContent = from === undefined || from < lastSequence;
    const eventsXml = includeContent ? readings.filter((r) => r.category === "EVENT").map((r) => renderDataItemElement(r, lastSequence)).join("\n          ") : "";
    const samplesXml = includeContent ? readings.filter((r) => r.category === "SAMPLE").map((r) => renderDataItemElement(r, lastSequence)).join("\n          ") : "";

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MTConnectStreams xmlns="urn:mtconnect.org:MTConnectStreams:1.7">
  ${mtconnectHeader()}
  <Streams>
    <DeviceStream name="HydraNode_1" uuid="hydra-umc-node-1">
      <ComponentStream component="Device" name="HydraNode_1">
        <Events>
          ${eventsXml}
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
  const source = process.env.HYDRA_UMC_SERVER_URL
    ? `live HYDRA-UMC-SERVER at ${process.env.HYDRA_UMC_SERVER_URL}`
    : "FixtureMachineReader (set HYDRA_UMC_SERVER_URL for real robot data)";
  app.listen(DEFAULT_PORT, "0.0.0.0", () => {
    console.log("=================================================");
    console.log(` HYDRA-UMC-MTCONNECT-ADAPTER v${readPackageVersion()}`);
    console.log(" ROLE: Standardized XML/HTTP interface for machine tool monitoring");
    console.log(` STATUS: Running on port ${DEFAULT_PORT} - probe: http://localhost:${DEFAULT_PORT}/probe`);
    console.log(` SOURCE: ${source}`);
    console.log("=================================================");
  });
}

// Only auto-start when run directly, not when imported by
// tests/server.test.ts.
const entryFile = process.argv[1] ? process.argv[1].split(/[/\\]/).pop() : "";
if (entryFile === "server.ts" || entryFile === "server.cjs" || entryFile === "server.js") {
  main();
}
