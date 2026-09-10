// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - src/hydraServerReader.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
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
  /** Which real robot's own state to report - defaults to the first robot
   * found in the live roster (this adapter models exactly one HydraNode,
   * matching /probe's own single-Device shape). */
  robotId?: number;
  /** Injectable for real tests against a local http.Server instead of a
   * live HYDRA-UMC-SERVER - defaults to the real global fetch (stable
   * since Node 18, already this repo's own minimum). */
  fetchImpl?: typeof fetch;
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
  private readonly fetchImpl: typeof fetch;

  constructor(options: HydraServerMachineReaderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.robotId = options.robotId;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async read(): Promise<RawReading[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/settings`);
    if (!response.ok) {
      throw new Error(`HYDRA-UMC-SERVER replied with HTTP ${response.status}`);
    }
    const body = (await response.json()) as HydraSettingsResponse;
    const robot = findRobot(body, this.robotId);
    if (!robot) {
      throw new Error(
        this.robotId !== undefined
          ? `no robot with id ${this.robotId} in HYDRA-UMC-SERVER's own live roster`
          : "HYDRA-UMC-SERVER's own live roster has no robots registered",
      );
    }

    const timestampMs = Date.now();
    return [
      { id: "avail", category: "EVENT", type: "AVAILABILITY", value: robot.online ? "AVAILABLE" : "UNAVAILABLE", timestampMs },
      { id: "execution", category: "EVENT", type: "EXECUTION", value: deriveExecution(robot.playbackState), timestampMs },
      { id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", value: null, timestampMs },
    ];
  }
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
