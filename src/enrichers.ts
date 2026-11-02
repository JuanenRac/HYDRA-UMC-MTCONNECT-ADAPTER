// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - src/enrichers.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// Two more sources for the one device, each off until its address is set:
//
//   HYDRA_UMC_MTCONNECT_JOBS_URL    the queue of HYDRA-UMC-JOB-DISPATCHER (GET /jobs): `part_count` (PART_COUNT, the jobs it finished) and
//                                   `program` (PROGRAM, the id of the job a robot is working on now; UNAVAILABLE when none is).
//   HYDRA_UMC_MTCONNECT_FAULTS_URL  the active faults of the controllers (a list of {robot_id, component, error_code, detail, at_utc}, see
//                                   docs/API.md): two conditions, `mcu_condition` for the microcontroller faults and `urtc_condition` for the
//                                   tool-head (URTC) ones. A condition is NORMAL when no fault is active, WARNING or FAULT by the error code of
//                                   the worst active fault (the newest among equals), and UNAVAILABLE while the feed cannot be read.
//
// Each token is the bearer token of its service (HYDRA_UMC_MTCONNECT_JOBS_TOKEN, HYDRA_UMC_MTCONNECT_FAULTS_TOKEN). A feed that is down turns
// only its own DataItems UNAVAILABLE; nothing else changes. They serve the single device HydraNode_1: with one Device per robot they are refused
// at start, because the job queue and the fault list do not name robots the way the roster does.
// =============================================================================

import type { RawReading } from "./dataitem.js";
import type { DeclaredItem } from "./server.js";
import type { MachineReader } from "./reader.js";
import { readJsonCapped } from "./hydraServerReader.js";

export interface Enricher {
  /** The DataItems this source feeds. */
  items: ReadonlyArray<DeclaredItem>;
  /** The readings for them now; throws when the source cannot be read. */
  read(): Promise<RawReading[]>;
}

export const JOB_ITEMS: ReadonlyArray<DeclaredItem> = [
  { id: "part_count", category: "EVENT", type: "PART_COUNT" },
  { id: "program", category: "EVENT", type: "PROGRAM" },
];

export const FAULT_ITEMS: ReadonlyArray<DeclaredItem> = [
  { id: "mcu_condition", category: "CONDITION", type: "SYSTEM" },
  { id: "urtc_condition", category: "CONDITION", type: "SYSTEM" },
];

const FETCH_TIMEOUT_MS = 1500;

async function getJson(url: string, token: string | undefined, doFetch: typeof fetch): Promise<unknown> {
  const response = await doFetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    await response.arrayBuffer().catch(() => undefined);
    throw new Error(`HTTP ${response.status}`);
  }
  return readJsonCapped(response);
}

/** The job queue as items of the device. `Done` jobs are counted; the newest `assigned` job is the program. */
export function jobReadings(jobs: unknown, nowMs: number): RawReading[] {
  if (!Array.isArray(jobs)) throw new Error("the job list is not a list");
  let done = 0;
  let current: { id: string; at: number } | undefined;
  for (const entry of jobs) {
    const job = entry as { ID?: unknown; Status?: unknown; AssignedAtMs?: unknown } | null;
    if (job?.Status === "done") done += 1;
    if (job?.Status === "assigned" && typeof job.ID === "string") {
      const at = typeof job.AssignedAtMs === "number" ? job.AssignedAtMs : 0;
      if (!current || at >= current.at) current = { id: job.ID, at };
    }
  }
  return [
    { id: "part_count", category: "EVENT", type: "PART_COUNT", value: done, timestampMs: nowMs },
    { id: "program", category: "EVENT", type: "PROGRAM", value: current ? current.id : null, timestampMs: nowMs },
  ];
}

export function jobsEnricher(url: string, token?: string, doFetch: typeof fetch = fetch): Enricher {
  const endpoint = `${url.replace(/\/+$/, "")}/jobs`;
  return { items: JOB_ITEMS, read: async () => jobReadings(await getJson(endpoint, token, doFetch), Date.now()) };
}

/** The error codes of the controllers that stop a machine; every other code is a warning. A feed may also say `severity`: "fault" or "warning". */
const FAULT_CODES = new Set(["ESTOP_ACTIVE", "OUT_OF_RANGE", "TOOL_INCOMPATIBLE", "GRIP_LOST_SEAL"]);

export function faultLevel(errorCode: string, severity?: unknown): "WARNING" | "FAULT" {
  if (severity === "fault") return "FAULT";
  if (severity === "warning") return "WARNING";
  return FAULT_CODES.has(errorCode.toUpperCase()) ? "FAULT" : "WARNING";
}

interface ActiveFault {
  component: string;
  errorCode: string;
  detail: string;
  atMs: number;
  level: "WARNING" | "FAULT";
}

function readFaults(body: unknown): ActiveFault[] {
  const list = (body as { faults?: unknown } | null)?.faults;
  if (!Array.isArray(list)) throw new Error("the fault feed has no faults list");
  const faults: ActiveFault[] = [];
  for (const entry of list) {
    const fault = entry as { component?: unknown; error_code?: unknown; detail?: unknown; at_utc?: unknown; severity?: unknown; active?: unknown } | null;
    if (typeof fault?.error_code !== "string" || fault.error_code === "" || fault.active === false) continue;
    const at = typeof fault.at_utc === "string" ? Date.parse(fault.at_utc) : NaN;
    faults.push({
      component: typeof fault.component === "string" ? fault.component : "unknown",
      errorCode: fault.error_code,
      detail: typeof fault.detail === "string" ? fault.detail : "",
      atMs: Number.isFinite(at) ? at : 0,
      level: faultLevel(fault.error_code, fault.severity),
    });
  }
  return faults;
}

function conditionOf(id: string, faults: ActiveFault[], nowMs: number): RawReading {
  if (faults.length === 0) return { id, category: "CONDITION", type: "SYSTEM", value: "normal", timestampMs: nowMs };
  // the worst level first, the newest among equals
  const worst = [...faults].sort((a, b) => (a.level === b.level ? b.atMs - a.atMs : a.level === "FAULT" ? -1 : 1))[0];
  const more = faults.length > 1 ? ` (+${faults.length - 1} more)` : "";
  const text = `${worst.component}: ${worst.detail || worst.errorCode}${more}`.slice(0, 200);
  return { id, category: "CONDITION", type: "SYSTEM", value: worst.level.toLowerCase(), message: text, nativeCode: worst.errorCode, timestampMs: nowMs };
}

/** The two conditions from a fault list: the tool-head (URTC) faults on one, every other component on the other. */
export function faultReadings(body: unknown, nowMs: number): RawReading[] {
  const faults = readFaults(body);
  const isUrtc = (fault: ActiveFault) => /urtc/i.test(fault.component);
  return [conditionOf("mcu_condition", faults.filter((f) => !isUrtc(f)), nowMs), conditionOf("urtc_condition", faults.filter(isUrtc), nowMs)];
}

export function faultsEnricher(url: string, token?: string, doFetch: typeof fetch = fetch): Enricher {
  return { items: FAULT_ITEMS, read: async () => faultReadings(await getJson(url, token, doFetch), Date.now()) };
}

/** The enrichers the environment asks for: none unless an address is set. */
export function enrichersFromEnv(env: NodeJS.ProcessEnv = process.env): Enricher[] {
  const out: Enricher[] = [];
  const check = (name: string, value: string): string => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("scheme");
    } catch {
      throw new Error(`HYDRA-UMC-MTCONNECT-ADAPTER: ${name} must be an http(s) URL, got ${value}`);
    }
    return value;
  };
  const jobs = env.HYDRA_UMC_MTCONNECT_JOBS_URL?.trim();
  if (jobs) out.push(jobsEnricher(check("HYDRA_UMC_MTCONNECT_JOBS_URL", jobs), env.HYDRA_UMC_MTCONNECT_JOBS_TOKEN?.trim() || undefined));
  const faults = env.HYDRA_UMC_MTCONNECT_FAULTS_URL?.trim();
  if (faults) out.push(faultsEnricher(check("HYDRA_UMC_MTCONNECT_FAULTS_URL", faults), env.HYDRA_UMC_MTCONNECT_FAULTS_TOKEN?.trim() || undefined));
  return out;
}

/** A reader that adds what the enrichers read to what the base reader reads. A base that fails fails the whole read, as before; an enricher that fails turns only its own items UNAVAILABLE. */
export class EnrichedReader implements MachineReader {
  constructor(
    private readonly base: MachineReader,
    private readonly enrichers: ReadonlyArray<Enricher>,
  ) {}

  async read(): Promise<RawReading[]> {
    const readings = [...(await this.base.read())];
    const settled = await Promise.allSettled(this.enrichers.map((enricher) => enricher.read()));
    const now = Date.now();
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        readings.push(...result.value);
        return;
      }
      for (const item of this.enrichers[index].items) {
        readings.push({ id: item.id, category: item.category, type: item.type, value: item.category === "CONDITION" ? "unavailable" : null, timestampMs: now });
      }
    });
    return readings;
  }
}
