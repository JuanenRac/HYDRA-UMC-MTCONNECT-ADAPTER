// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - src/hydraServerReader.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// Found while auditing the code: server.ts's own
// buildApp() defaulted to FixtureMachineReader unconditionally - there was
// no real MachineReader anywhere in this repo, even though the one real
// machine source this adapter can actually reach today already exists:
// HYDRA-UMC-SERVER's own GET /api/settings, the exact same real, live
// robot roster HYDRA-UMC-TOOL-CLI's own robots.go and every control
// client already read. This reader polls that real endpoint and derives
// real EXECUTION/AVAILABILITY EVENT DataItems from one real robot's own
// current state - the first genuinely non-fixture MachineReader this
// adapter has had.
//
// Deliberately does NOT invent a spindle_temp reading: no field in
// HYDRA-UMC-SERVER's own robot/controller shape corresponds to a real
// temperature sensor today (this ecosystem's robots have no such sensor
// yet) - reporting `value: null` for it is the honest "no real data"
// signal (see dataitem.ts's own NO_DATA convention), not a made-up number
// under a real-looking unit label.
// =============================================================================

import type { RawReading } from "./dataitem.js";
import type { MachineReader } from "./reader.js";

interface HydraPlaybackState {
  isPlaying?: boolean;
  isPaused?: boolean;
  isFinished?: boolean;
}

interface HydraRobot {
  id: number;
  online?: boolean;
  playbackState?: HydraPlaybackState;
}

interface HydraController {
  robots?: HydraRobot[];
}

interface HydraSettingsResponse {
  controllers?: HydraController[];
}

export interface HydraServerMachineReaderOptions {
  /** Base URL of a real HYDRA-UMC-SERVER instance, e.g. "http://localhost:3000". */
  baseUrl: string;
  /** A bearer token HYDRA-UMC-SERVER already issued. HYDRA-UMC-SERVER only
   * answers GET /api/settings to a logged-in account, so a reader with no
   * credential at all is refused with 401 and the adapter reports the source
   * as unavailable. */
  token?: string;
  /** Or an account to log in with (POST /api/login). Used when there is no
   * `token`, and again - once per read - when a token is refused, so a
   * long-running adapter survives the expiry of the session it logged in with. */
  username?: string;
  password?: string;
  /** Which real robot's own state to report - defaults to the first robot
   * found in the live roster (this adapter models exactly one HydraNode,
   * matching /probe's own single-Device shape). */
  robotId?: number;
  /** Report every robot of the roster (or only `robotId` when it is set) as a device of its own: each reading carries a `deviceKey` and the ids of its DataItems are prefixed `robot_<id>_`. Off by default: one robot, one HydraNode_1. */
  perRobot?: boolean;
  /** Injectable for real tests against a local http.Server instead of a
   * live HYDRA-UMC-SERVER - defaults to the real global fetch (stable
   * since Node 18, already this repo's own minimum). */
  fetchImpl?: typeof fetch;
  /** How long read() waits for HYDRA-UMC-SERVER's own GET /api/settings
   * before giving up - real fix: this call used to have no timeout at
   * all, so a hung/unreachable-but-connected HYDRA-UMC-SERVER left this
   * adapter's own poll loop (reader.ts's CachedReader) stuck waiting
   * indefinitely on one read(), instead of surfacing a real
   * SourceUnavailableError a caller can act on. Defaults to 5 seconds. */
  requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
/** Largest response read from HYDRA-UMC-SERVER; a bigger one is refused. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

class SessionRefusedError extends Error {}

/** Reads a response body as JSON, refusing one larger than `maxBytes`: the body is read as it arrives and counted in bytes, so an endless one is never held in memory. */
export async function readJsonCapped(response: Response, maxBytes: number = MAX_RESPONSE_BYTES): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`HYDRA-UMC-SERVER's response is larger than ${maxBytes} bytes`);
  }
  if (!response.body) return JSON.parse(await response.text());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`HYDRA-UMC-SERVER's response is larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

/**
 * Real MachineReader backed by a live HYDRA-UMC-SERVER's own GET
 * /api/settings. EXECUTION is derived from the target robot's own real
 * playbackState (see deriveExecution's own doc comment for the exact
 * mapping); AVAILABILITY reflects the robot's own real `online` flag -
 * both genuinely change as that robot's own real state changes, unlike
 * FixtureMachineReader's fixed literals. A robot that can't be found in a
 * reachable server's own roster - a real configuration mismatch, not a
 * network failure - throws, which CachedReader (reader.ts) turns into the
 * same real SourceUnavailableError a genuine network failure would.
 */
export class HydraServerMachineReader implements MachineReader {
  private readonly baseUrl: string;
  private readonly robotId?: number;
  private readonly perRobot: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;
  private token: string | undefined;
  private readonly username: string | undefined;
  private readonly password: string | undefined;

  constructor(options: HydraServerMachineReaderOptions) {
    this.token = options.token?.trim() || undefined;
    this.username = options.username || undefined;
    this.password = options.password || undefined;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.robotId = options.robotId;
    this.perRobot = options.perRobot ?? false;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /** Fetches with a bounded wait; an abort becomes the "did not respond" error. */
  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`HYDRA-UMC-SERVER did not respond within ${this.requestTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Logs in with the configured account and keeps the token it is given. */
  private async login(): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    if (response.status === 401 || response.status === 403) {
      throw new SessionRefusedError(`HYDRA-UMC-SERVER refused the login for ${this.username}`);
    }
    if (!response.ok) {
      throw new Error(`HYDRA-UMC-SERVER replied with HTTP ${response.status} to the login`);
    }
    const body = (await readJsonCapped(response)) as { token?: unknown };
    if (typeof body.token !== "string" || !body.token) {
      throw new Error("HYDRA-UMC-SERVER's login response carried no token");
    }
    this.token = body.token;
  }

  /** GET /api/settings with the credential, logging in first or again when allowed. */
  private async fetchSettings(): Promise<Response> {
    const hasAccount = this.username !== undefined && this.password !== undefined;
    if (this.token === undefined && hasAccount) await this.login();
    const get = () =>
      this.fetchWithTimeout(`${this.baseUrl}/api/settings`, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });
    let response = await get();
    if ((response.status === 401 || response.status === 403) && hasAccount) {
      // the session expired (or was revoked): log in once more, then ask again
      await response.arrayBuffer().catch(() => undefined);
      await this.login();
      response = await get();
    }
    return response;
  }

  async read(): Promise<RawReading[]> {
    const response = await this.fetchSettings();
    if (response.status === 401 || response.status === 403) {
      throw new SessionRefusedError(
        `HYDRA-UMC-SERVER refused the credential (HTTP ${response.status}): set HYDRA_UMC_SERVER_TOKEN, or HYDRA_UMC_SERVER_USER and HYDRA_UMC_SERVER_PASSWORD`,
      );
    }
    if (!response.ok) {
      throw new Error(`HYDRA-UMC-SERVER replied with HTTP ${response.status}`);
    }
    const body = (await readJsonCapped(response)) as HydraSettingsResponse;
    if (this.perRobot) {
      const robots = findRobots(body, this.robotId);
      if (robots.length === 0 && this.robotId !== undefined) {
        throw new Error(`no robot with id ${this.robotId} in HYDRA-UMC-SERVER's own live roster`);
      }
      const at = Date.now();
      return robots.flatMap((r) => [
        { id: `robot_${r.id}_avail`, category: "EVENT" as const, type: "AVAILABILITY", value: r.online ? "AVAILABLE" : "UNAVAILABLE", timestampMs: at, deviceKey: String(r.id) },
        { id: `robot_${r.id}_execution`, category: "EVENT" as const, type: "EXECUTION", value: r.online ? deriveExecution(r.playbackState) : "UNAVAILABLE", timestampMs: at, deviceKey: String(r.id) },
      ]);
    }
    const robot = findRobot(body, this.robotId);
    if (!robot) {
      throw new Error(
        this.robotId !== undefined
          ? `no robot with id ${this.robotId} in HYDRA-UMC-SERVER's own live roster`
          : "HYDRA-UMC-SERVER's own live roster has no robots registered",
      );
    }

    const timestampMs = Date.now();
    // `online` is the flag HYDRA-UMC-SERVER keeps for the robot (the one the operator interface toggles); a robot that is not available cannot be executing anything.
    return [
      { id: "avail", category: "EVENT", type: "AVAILABILITY", value: robot.online ? "AVAILABLE" : "UNAVAILABLE", timestampMs },
      { id: "execution", category: "EVENT", type: "EXECUTION", value: robot.online ? deriveExecution(robot.playbackState) : "UNAVAILABLE", timestampMs },
      { id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", value: null, timestampMs },
    ];
  }
}

function findRobots(body: HydraSettingsResponse, robotId: number | undefined): HydraRobot[] {
  const allRobots = (body.controllers ?? []).flatMap((controller) => controller.robots ?? []);
  return robotId !== undefined ? allRobots.filter((robot) => robot.id === robotId) : allRobots;
}

function findRobot(body: HydraSettingsResponse, robotId: number | undefined): HydraRobot | undefined {
  const allRobots = (body.controllers ?? []).flatMap((controller) => controller.robots ?? []);
  if (robotId !== undefined) {
    return allRobots.find((robot) => robot.id === robotId);
  }
  return allRobots[0];
}

// Real, standard MTConnect Execution enumerated values (ANSI/MTC1.4 Part
// 3), mapped from the same playbackState fields HYDRA-UMC-SERVER's own
// POST /api/robot/:id/command play/pause/stop cases (src/server.ts) set:
//   - isPlaying && isPaused   -> INTERRUPTED (a real program paused mid-cycle)
//   - isPlaying (not paused)  -> ACTIVE (real, ongoing execution)
//   - isFinished (not playing) -> STOPPED (a real program ran to completion)
//   - anything else (never run, or reset) -> READY
function deriveExecution(state: HydraPlaybackState | undefined): string {
  if (!state) return "READY";
  if (state.isPlaying && state.isPaused) return "INTERRUPTED";
  if (state.isPlaying) return "ACTIVE";
  if (state.isFinished) return "STOPPED";
  return "READY";
}
