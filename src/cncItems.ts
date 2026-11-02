// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - src/cncItems.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// The DataItems of a CNC that HYDRA-UMC-BRIDGE-CNC says in its SHDR stream besides the execution and the availability: the
// emergency stop, the door, the spindle speed, the path feed rate and a condition for the system. They are declared (and fed
// by a reader of that stream) only when HYDRA_UMC_MTCONNECT_CNC_ITEMS=1, so a deployment without it has the device it always had.
// =============================================================================

import type { DeclaredItem } from "./server.js";
import type { FeedableItem } from "./shdrReader.js";

/** What /probe declares for them. The bridge reports the spindle in rpm and the feed rate in mm/min; the agent serves SI-style units. */
export const CNC_ITEMS: ReadonlyArray<DeclaredItem> = [
  { id: "estop", category: "EVENT", type: "EMERGENCY_STOP" },
  { id: "door", category: "EVENT", type: "DOOR_STATE" },
  { id: "spindle_speed", category: "SAMPLE", type: "SPINDLE_SPEED", units: "REVOLUTION/MINUTE" },
  { id: "path_feedrate", category: "SAMPLE", type: "PATH_FEEDRATE", units: "MILLIMETER/SECOND" },
  { id: "system", category: "CONDITION", type: "SYSTEM" },
];

/** What the SHDR reader keeps of the stream, by id, in addition to the execution and the availability. */
export const CNC_FEEDABLE: Readonly<Record<string, FeedableItem>> = {
  execution: { category: "EVENT", type: "EXECUTION" },
  avail: { category: "EVENT", type: "AVAILABILITY" },
  estop: { category: "EVENT", type: "EMERGENCY_STOP" },
  door: { category: "EVENT", type: "DOOR_STATE" },
  spindle_speed: { category: "SAMPLE", type: "SPINDLE_SPEED", nativeUnit: "RPM" },
  path_feedrate: { category: "SAMPLE", type: "PATH_FEEDRATE", nativeUnit: "MILLIMETER_PER_MINUTE" },
  system: { category: "CONDITION", type: "SYSTEM" },
};
