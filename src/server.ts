// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - MTConnect XML/HTTP Interface: src/server.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// Factory-standard bridge for machine tool monitoring (see this project's
// own README.md for the full rationale). In MTConnect terms this process is
// an AGENT: it serves the three read-only HTTP requests every MTConnect
// client expects (GET /probe for the static device model, GET /current for
// the latest value of every DataItem, GET /sample for the observations since
// a sequence number) with documents built by hand as XML strings (no xml
// library: the payload shape is fixed and small).
//
// The data comes from a MachineReader (buildReader() below): a
// HydraServerMachineReader polling a live HYDRA-UMC-SERVER's
// GET /api/settings for one robot, the synthetic FixtureMachineReader only
// when HYDRA_UMC_MTCONNECT_DEMO=1 asks for it, or - with neither configured -
// a reader that reports every DataItem UNAVAILABLE. Whatever it reports is
// recorded in an ObservationBuffer (buffer.ts) that gives every change its
// own sequence number, which is what /current and /sample serve.
//
// buildApp() is exported (separately from starting the listener) so tests
// can exercise the real Express app without binding a port; main() below is
// the only thing that calls listen(). Every response is checked against the
// official MTConnect 1.7 XSD in tests/xsd-validation.test.ts.
// =============================================================================

import express, { type Express } from "express";
import { readPackageVersion } from "./version.js";
import { markStale, sourceUnavailableReading, toDataItemReading, type DataItemReading, type RawReading } from "./dataitem.js";
import { CachedReader, type MachineReader } from "./reader.js";
import { HydraServerMachineReader } from "./hydraServerReader.js";
import { parseShdrSource, ShdrMachineReader } from "./shdrReader.js";
import { ObservationBuffer, type Observation } from "./buffer.js";
import { element, escapeXml } from "./xml.js";
import { ShdrServer } from "./shdr.js";
import { resolveListenPort, type ResolvedPort } from "./portConfig.js";

/** A non-negative integer from an environment variable; a value that is set but not one is a startup error, never a silent default. */
export function readIntegerEnv(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`HYDRA-UMC-MTCONNECT-ADAPTER: ${name} must be a non-negative integer, got ${raw}`);
  }
  return value;
}

/** MTConnect implementations commonly default to 5000, so an off-the-shelf client can point at this agent with no configuration. */
export function resolveListenPortOf(env: NodeJS.ProcessEnv = process.env): ResolvedPort {
  return resolveListenPort(env, "HYDRA-UMC-MTCONNECT-ADAPTER", "HYDRA_UMC_MTCONNECT_PORT", 5000);
}

/** The port of its own variable `HYDRA_UMC_MTCONNECT_PORT` first, then the shared `PORT` (with a warning in main), then 5000. */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  return resolveListenPortOf(env).port;
}

// The DataItems /probe declares for the HydraNode device, and the one for the agent itself.
export interface DeclaredItem {
  id: string;
  category: "EVENT" | "SAMPLE" | "CONDITION";
  type: string;
}

const DECLARED_ITEMS: ReadonlyArray<DeclaredItem> = [
  { id: "execution", category: "EVENT", type: "EXECUTION" },
  { id: "avail", category: "EVENT", type: "AVAILABILITY" },
  { id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE" },
  // The device says which asset events it can produce (required of a Device since MTConnect 1.2). It has no assets, so they stay UNAVAILABLE.
  { id: "asset_chg", category: "EVENT", type: "ASSET_CHANGED" },
  { id: "asset_rem", category: "EVENT", type: "ASSET_REMOVED" },
];
const AGENT_AVAILABILITY_ID = "agent_avail";
const DEFAULT_BUFFER_SIZE = 10_000;
const DEFAULT_SAMPLE_COUNT = 100;
const MAX_SAMPLE_COUNT = 1000;

/** Synthetic readings for a demonstration: fixed values, never to be mistaken for a machine. Only used when HYDRA_UMC_MTCONNECT_DEMO=1. */
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

/** The reader of a deployment with no machine source configured: it has nothing to report, so every DataItem is UNAVAILABLE. */
class UnconfiguredMachineReader implements MachineReader {
  async read(): Promise<RawReading[]> {
    throw new Error("no machine source configured: set HYDRA_UMC_SERVER_URL (or HYDRA_UMC_MTCONNECT_DEMO=1 for synthetic demonstration data)");
  }
}

function isDemo(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.HYDRA_UMC_SERVER_URL && (env.HYDRA_UMC_MTCONNECT_DEMO ?? "").trim() === "1";
}

function buildReader(): MachineReader {
  const serverUrl = process.env.HYDRA_UMC_SERVER_URL;
  const shdrSource = (process.env.HYDRA_UMC_MTCONNECT_SHDR_SOURCE ?? "").trim();
  if (!serverUrl && shdrSource) {
    const parsed = parseShdrSource(shdrSource);
    if (!parsed) throw new Error(`HYDRA-UMC-MTCONNECT-ADAPTER: HYDRA_UMC_MTCONNECT_SHDR_SOURCE must be host:port or a port, got ${shdrSource}`);
    return new ShdrMachineReader(parsed);
  }
  if (!serverUrl) return isDemo() ? new FixtureMachineReader() : new UnconfiguredMachineReader();
  const robotIdRaw = process.env.HYDRA_UMC_ROBOT_ID;
  const robotId = robotIdRaw ? Number(robotIdRaw) : undefined;
  if (robotIdRaw && (!Number.isInteger(robotId) || robotId! < 0)) {
    throw new Error(`HYDRA-UMC-MTCONNECT-ADAPTER: HYDRA_UMC_ROBOT_ID must be a non-negative integer, got ${robotIdRaw}`);
  }
  // HYDRA-UMC-SERVER only answers /api/settings to a logged-in account: a
  // token it already issued, or an account to log in with (re-done when the
  // session expires)
  return new HydraServerMachineReader({
    baseUrl: serverUrl,
    robotId,
    token: process.env.HYDRA_UMC_SERVER_TOKEN,
    username: process.env.HYDRA_UMC_SERVER_USER,
    password: process.env.HYDRA_UMC_SERVER_PASSWORD,
  });
}

function typeToElementName(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

// `units` is a DataItem-DEFINITION attribute (declared once in /probe), not a
// Streams value attribute: the official schema's sample type has no `units`.
function renderObservation(observation: Observation): string {
  const timestamp = new Date(observation.timestampMs).toISOString();
  const common = [["dataItemId", observation.id], ["timestamp", timestamp], ["sequence", observation.sequence]] as const;
  if (observation.category === "CONDITION") {
    // the element is the level (Normal, Warning, Fault, Unavailable); the DataItem type is an attribute
    const level = observation.value.charAt(0) + observation.value.slice(1).toLowerCase();
    return element(level, [...common, ["type", observation.type], ["nativeCode", observation.nativeCode]], observation.value === "UNAVAILABLE" ? undefined : observation.message);
  }
  return element(typeToElementName(observation.type), common, observation.value);
}

const INDENT = "          ";

function renderComponentStream(componentId: string, name: string, observations: Observation[]): string {
  const events = observations.filter((o) => o.category === "EVENT").map(renderObservation);
  const samples = observations.filter((o) => o.category === "SAMPLE").map(renderObservation);
  const conditions = observations.filter((o) => o.category === "CONDITION").map(renderObservation);
  // The schema wants at least one child inside Events/Samples/Condition: an empty one is left out altogether.
  const parts: string[] = [];
  if (events.length > 0) parts.push(`        <Events>\n${INDENT}${events.join(`\n${INDENT}`)}\n        </Events>`);
  if (samples.length > 0) parts.push(`        <Samples>\n${INDENT}${samples.join(`\n${INDENT}`)}\n        </Samples>`);
  if (conditions.length > 0) parts.push(`        <Condition>\n${INDENT}${conditions.join(`\n${INDENT}`)}\n        </Condition>`);
  return `      <ComponentStream componentId="${componentId}" component="Device" name="${name}">\n${parts.join("\n")}\n      </ComponentStream>`;
}

/** The DeviceStream elements for a set of observations: one for the agent and one for the HydraNode, each only if it has something to say. */
function renderDeviceStreams(observations: Observation[], nodeUuid: string, includeAgent = true): string {
  const agent = includeAgent ? observations.filter((o) => o.id === AGENT_AVAILABILITY_ID) : [];
  const node = observations.filter((o) => o.id !== AGENT_AVAILABILITY_ID);
  const streams: string[] = [];
  if (agent.length > 0) {
    streams.push(`    <DeviceStream name="Agent" uuid="hydra-umc-mtconnect-adapter">\n${renderComponentStream("agent", "Agent", agent)}\n    </DeviceStream>`);
  }
  if (node.length > 0) {
    streams.push(`    <DeviceStream name="HydraNode_1" uuid="${nodeUuid}">\n${renderComponentStream("hydra_umc_1", "HydraNode_1", node)}\n    </DeviceStream>`);
  }
  return streams.join("\n");
}

export interface BuildAppOptions {
  /** Machine source for /current and /sample. Defaults to buildReader()'s choice. */
  reader?: MachineReader;
  /** Minimum interval between actual reads of `reader` (reader.ts's CachedReader). Defaults to POLL_INTERVAL_MS or 1000 ms; 0 reads on every request. */
  minPollIntervalMs?: number;
  /** A reading older than this many milliseconds is reported UNAVAILABLE instead of as a live value. Defaults to MAX_SAMPLE_AGE_MS, or 0 (checking off). */
  maxSampleAgeMs?: number;
  /** How many observations the buffer keeps (default MTCONNECT_BUFFER_SIZE or 10000). */
  bufferSize?: number;
  /** DataItems the device declares in /probe besides the built-in ones, for a reader that reports more (a CONDITION, for example). Each starts UNAVAILABLE. */
  extraItems?: DeclaredItem[];
  /** Answer an MTConnectError with an HTTP error status (400 for INVALID_REQUEST and OUT_OF_RANGE, 404 for NO_DEVICE) instead of 200. Defaults to HYDRA_UMC_MTCONNECT_HTTP_ERRORS=1, otherwise off (200, as before). */
  httpErrors?: boolean;
}

/** The HTTP status of an MTConnectError. */
export function errorStatus(errorCode: string, httpErrors: boolean): number {
  if (!httpErrors) return 200;
  return errorCode === "NO_DEVICE" ? 404 : 400;
}

export function buildApp(options: BuildAppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  const demo = options.reader === undefined && isDemo();
  const cachedReader = new CachedReader(
    options.reader ?? buildReader(),
    options.minPollIntervalMs ?? readIntegerEnv("POLL_INTERVAL_MS", 1000),
  );
  const maxSampleAgeMs = options.maxSampleAgeMs ?? readIntegerEnv("MAX_SAMPLE_AGE_MS", 0);
  const httpErrors = options.httpErrors ?? (process.env.HYDRA_UMC_MTCONNECT_HTTP_ERRORS ?? "").trim() === "1";
  const items: DeclaredItem[] = [...DECLARED_ITEMS, ...(options.extraItems ?? [])];
  const buffer = new ObservationBuffer((options.bufferSize ?? readIntegerEnv("MTCONNECT_BUFFER_SIZE", DEFAULT_BUFFER_SIZE)) || DEFAULT_BUFFER_SIZE);
  const nodeUuid = demo ? "hydra-umc-node-demo" : "hydra-umc-node-1";
  const nodeDescription = demo ? "HYDRA-UMC multi-robot micro-factory cell - DEMONSTRATION DATA, not a machine" : "HYDRA-UMC multi-robot micro-factory cell";

  // Every response carries the same header block; a new process gets a new instanceId.
  const instanceId = Date.now();
  const deviceModelChangeTimeIso = new Date(instanceId).toISOString();

  // Every DataItem starts out UNAVAILABLE, as an MTConnect agent reports it
  // before its first data: a client never meets a DataItem without an
  // observation, and the buffer is never empty.
  const startedAt = Date.now();
  buffer.record({ id: AGENT_AVAILABILITY_ID, category: "EVENT", type: "AVAILABILITY", value: "AVAILABLE", timestampMs: startedAt });
  for (const item of items) buffer.record({ ...item, value: "UNAVAILABLE", timestampMs: startedAt });

  const mapReadings = (raw: RawReading[]): DataItemReading[] => raw.map((r) => markStale(toDataItemReading(r), Date.now(), maxSampleAgeMs));

  /** Reads the source (or its cache) and records whatever changed. Always called before a Streams document is built. */
  async function refresh(): Promise<void> {
    let readings: DataItemReading[];
    try {
      readings = mapReadings(await cachedReader.getReadings());
    } catch {
      // The source itself is down: every DataItem it would have reported is UNAVAILABLE - not a 500, and not old data pretending to be live.
      const timestampMs = Date.now();
      readings = items.map((item) => sourceUnavailableReading(item.id, item.category, item.type, timestampMs));
    }
    const now = Date.now();
    for (const reading of readings) {
      buffer.record({
        id: reading.id,
        category: reading.category,
        type: reading.type,
        value: reading.value,
        timestampMs: reading.quality === "GOOD" ? reading.timestampMs : now,
        ...(reading.message !== undefined ? { message: reading.message } : {}),
        ...(reading.nativeCode !== undefined ? { nativeCode: reading.nativeCode } : {}),
      });
    }
  }

  // main() reads the source on a timer for the SHDR output, which no HTTP request drives
  app.locals.refresh = refresh;
  app.locals.buffer = buffer;

  function streamsHeader(nextSequence: number): string {
    return `<Header creationTime="${new Date().toISOString()}" sender="HYDRA-UMC-MTCONNECT-ADAPTER" instanceId="${instanceId}" version="${readPackageVersion()}" bufferSize="${buffer.capacity}" deviceModelChangeTime="${deviceModelChangeTimeIso}" nextSequence="${nextSequence}" firstSequence="${buffer.firstSequence}" lastSequence="${buffer.lastSequence}"/>`;
  }

  // /probe's Header (MTConnectDevices' HeaderType): no sequence attributes
  // (there is no stream position in a device model) but a required asset
  // buffer; this agent has no Assets, so a buffer of the minimum size 1 and
  // a count of 0.
  function devicesHeader(): string {
    return `<Header creationTime="${new Date().toISOString()}" sender="HYDRA-UMC-MTCONNECT-ADAPTER" instanceId="${instanceId}" version="${readPackageVersion()}" bufferSize="${buffer.capacity}" deviceModelChangeTime="${deviceModelChangeTimeIso}" assetBufferSize="1" assetCount="0"/>`;
  }

  // MTConnectError's own narrower Header: no model change time, no sequences.
  function errorHeader(): string {
    return `<Header creationTime="${new Date().toISOString()}" sender="HYDRA-UMC-MTCONNECT-ADAPTER" instanceId="${instanceId}" version="${readPackageVersion()}" bufferSize="${buffer.capacity}"/>`;
  }

  function errorXml(errorCode: string, message: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<MTConnectError xmlns="urn:mtconnect.org:MTConnectError:1.7">
  ${errorHeader()}
  <Errors>
    ${element("Error", [["errorCode", errorCode]], message)}
  </Errors>
</MTConnectError>
`;
  }

  /** Sends an MTConnectError: status 200 as this agent always did, or 400/404 when HTTP errors are switched on. */
  function sendError(res: express.Response, errorCode: string, message: string): void {
    res.status(errorStatus(errorCode, httpErrors)).type("application/xml").send(errorXml(errorCode, message));
  }

  function streamsXml(nextSequence: number, observations: Observation[], includeAgent = true): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<MTConnectStreams xmlns="urn:mtconnect.org:MTConnectStreams:1.7">
  ${streamsHeader(nextSequence)}
  <Streams>
${renderDeviceStreams(observations, nodeUuid, includeAgent)}
  </Streams>
</MTConnectStreams>
`;
  }

  /** Whether `name` (the first segment of /<device>/probe) names the device this agent serves, by name or by uuid. */
  const isOurDevice = (name: string): boolean => name === "HydraNode_1" || name === nodeUuid;

  // GET /probe - the static device model: the agent itself and the HydraNode
  // with the DataItems it exposes. (`<Devices>` is `(Agent, Device+)`: the
  // agent is modelled as a device of its own.)
  const probeXml = (includeAgent: boolean): string => {
    const agent = includeAgent
      ? `    <Agent id="agent" name="Agent" uuid="hydra-umc-mtconnect-adapter">
      <Description manufacturer="JuanenRac (Electro Hobby 3D)">HYDRA-UMC-MTCONNECT-ADAPTER process</Description>
      <DataItems>
        <DataItem id="${AGENT_AVAILABILITY_ID}" category="EVENT" type="AVAILABILITY"/>
      </DataItems>
    </Agent>
`
      : "";
    const extras = (options.extraItems ?? []).map((item) => `        ${element("DataItem", [["id", item.id], ["category", item.category], ["type", item.type]])}\n`).join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
<MTConnectDevices xmlns="urn:mtconnect.org:MTConnectDevices:1.7">
  ${devicesHeader()}
  <Devices>
${agent}    <Device id="hydra_umc_1" name="HydraNode_1" uuid="${nodeUuid}">
      <Description manufacturer="JuanenRac (Electro Hobby 3D)">${escapeXml(nodeDescription)}</Description>
      <DataItems>
        <DataItem id="execution" category="EVENT" type="EXECUTION"/>
        <DataItem id="avail" category="EVENT" type="AVAILABILITY"/>
        <DataItem id="spindle_temp" category="SAMPLE" type="TEMPERATURE" units="CELSIUS" nativeUnits="FAHRENHEIT"/>
        <DataItem id="asset_chg" category="EVENT" type="ASSET_CHANGED"/>
        <DataItem id="asset_rem" category="EVENT" type="ASSET_REMOVED"/>
${extras}      </DataItems>
    </Device>
  </Devices>
</MTConnectDevices>
`;
  };
  app.get("/probe", (_req, res) => {
    res.type("application/xml").send(probeXml(true));
  });
  // The standard also addresses one device: /<device>/probe (the schema wants the Agent in every Devices document, so it stays in it).
  app.get("/:device/probe", (req, res) => {
    const device = String(req.params.device);
    if (!isOurDevice(device)) return sendError(res, "NO_DEVICE", `this agent serves the device HydraNode_1, not ${JSON.stringify(device)}`);
    res.type("application/xml").send(probeXml(true));
  });

  // GET /current - the latest observation of every DataItem declared in /probe.
  app.get("/current", async (_req, res) => {
    await refresh();
    res.type("application/xml").send(streamsXml(buffer.nextSequence, buffer.current()));
  });
  app.get("/:device/current", async (req, res) => {
    const device = String(req.params.device);
    if (!isOurDevice(device)) return sendError(res, "NO_DEVICE", `this agent serves the device HydraNode_1, not ${JSON.stringify(device)}`);
    await refresh();
    res.type("application/xml").send(streamsXml(buffer.nextSequence, buffer.current(), false));
  });

  // GET /sample?from=<sequence>&count=<n> - the observations with sequence >=
  // `from` (inclusive), at most `count`. A client that continues from the
  // `nextSequence` of its previous answer receives every change exactly once.
  // `from` older than the oldest observation still held, or beyond
  // nextSequence, is an OUT_OF_RANGE error: it never gets a silent mix of old
  // and new data.
  const sampleHandler = async (req: express.Request, res: express.Response, includeAgent: boolean): Promise<void> => {
    const fromRaw = req.query.from;
    let from: number | undefined;
    if (fromRaw !== undefined) {
      const parsed = Number(fromRaw);
      if (typeof fromRaw !== "string" || fromRaw.trim() === "" || !Number.isInteger(parsed) || parsed < 0) {
        sendError(res, "INVALID_REQUEST", `'from' must be a non-negative integer, got ${JSON.stringify(fromRaw)}`);
        return;
      }
      from = parsed;
    }
    const countRaw = req.query.count;
    let count = DEFAULT_SAMPLE_COUNT;
    if (countRaw !== undefined) {
      const parsed = Number(countRaw);
      if (typeof countRaw !== "string" || countRaw.trim() === "" || !Number.isInteger(parsed) || parsed < 1) {
        sendError(res, "INVALID_REQUEST", `'count' must be a positive integer, got ${JSON.stringify(countRaw)}`);
        return;
      }
      if (parsed > MAX_SAMPLE_COUNT) {
        sendError(res, "OUT_OF_RANGE", `'count' must be at most ${MAX_SAMPLE_COUNT}, got ${parsed}`);
        return;
      }
      count = parsed;
    }

    // Read (or take the cached read) first, so every decision below sees the buffer in its final state for this request.
    await refresh();

    const first = buffer.firstSequence;
    if (from !== undefined && from < first) {
      sendError(res, "OUT_OF_RANGE", `requested sequence ${from} is older than this agent's retained buffer (firstSequence=${first}, instanceId=${instanceId}) - resynchronize from firstSequence`);
      return;
    }
    if (from !== undefined && from > buffer.nextSequence) {
      sendError(res, "OUT_OF_RANGE", `requested sequence ${from} is beyond nextSequence=${buffer.nextSequence} (instanceId=${instanceId}) - this agent has not produced it`);
      return;
    }

    const result = buffer.since(from ?? first, count);
    res.type("application/xml").send(streamsXml(result.nextSequence, result.observations, includeAgent));
  };
  app.get("/sample", (req, res) => sampleHandler(req, res, true));
  app.get("/:device/sample", (req, res) => {
    const device = String(req.params.device);
    if (!isOurDevice(device)) return sendError(res, "NO_DEVICE", `this agent serves the device HydraNode_1, not ${JSON.stringify(device)}`);
    return sampleHandler(req, res, false);
  });

  return app;
}

function main() {
  const listen = resolveListenPortOf();
  if (listen.warning) console.warn(`[HYDRA-UMC-MTCONNECT-ADAPTER] ${listen.warning}`);
  const port = listen.port;
  const host = process.env.HYDRA_UMC_MTCONNECT_HOST?.trim() || "0.0.0.0";
  const app = buildApp();
  const shdrSource = (process.env.HYDRA_UMC_MTCONNECT_SHDR_SOURCE ?? "").trim();
  const source = process.env.HYDRA_UMC_SERVER_URL
    ? `live HYDRA-UMC-SERVER at ${process.env.HYDRA_UMC_SERVER_URL}`
    : shdrSource
      ? `SHDR stream at ${shdrSource}`
      : isDemo()
      ? "FixtureMachineReader - DEMONSTRATION DATA (HYDRA_UMC_MTCONNECT_DEMO=1)"
      : "none configured: every DataItem is UNAVAILABLE (set HYDRA_UMC_SERVER_URL for real robot data)";
  // 0.0.0.0 keeps the agent reachable by an MTConnect client on the network
  // (that is what the standard is for); HYDRA_UMC_MTCONNECT_HOST narrows it,
  // e.g. to 127.0.0.1 when only a local reverse proxy should reach it.
  const shdrPort = readIntegerEnv("HYDRA_UMC_MTCONNECT_SHDR_PORT", 0);
  if (shdrPort > 65_535) throw new Error(`HYDRA-UMC-MTCONNECT-ADAPTER: HYDRA_UMC_MTCONNECT_SHDR_PORT must be in 1..65535, got ${shdrPort}`);
  if (shdrPort > 0) {
    // SHDR for an agent such as cppagent: read only, loopback unless HYDRA_UMC_MTCONNECT_SHDR_HOST says otherwise
    const shdr = new ShdrServer(app.locals.buffer);
    const shdrHost = process.env.HYDRA_UMC_MTCONNECT_SHDR_HOST?.trim() || "127.0.0.1";
    shdr.listen(shdrPort, shdrHost).then(() => console.log(`[HYDRA-UMC-MTCONNECT-ADAPTER] SHDR (read only) on ${shdrHost}:${shdrPort}`));
    const interval = Math.max(readIntegerEnv("POLL_INTERVAL_MS", 1000), 100);
    setInterval(() => {
      app.locals.refresh().then(() => shdr.flush(), () => undefined);
    }, interval).unref();
  }
  const server = app.listen(port, host, () => {
    console.log("=================================================");
    console.log(` HYDRA-UMC-MTCONNECT-ADAPTER v${readPackageVersion()}`);
    console.log(" ROLE: Standardized XML/HTTP interface for machine tool monitoring");
    console.log(` STATUS: Running on ${host}:${port} - probe: http://localhost:${port}/probe`);
    console.log(` SOURCE: ${source}`);
    console.log("=================================================");
  });
  const shutdown = (signal: string) => {
    console.log(`[HYDRA-UMC-MTCONNECT-ADAPTER] ${signal} received: closing`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

// Only auto-start when run directly, not when imported by tests.
const entryFile = process.argv[1] ? process.argv[1].split(/[/\\]/).pop() : "";
if (entryFile === "server.ts" || entryFile === "server.cjs" || entryFile === "server.js") {
  main();
}
