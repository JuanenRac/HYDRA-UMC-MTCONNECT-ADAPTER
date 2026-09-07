// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - src/dataitem.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// Real, versioned mapping from a raw machine reading to an MTConnect
// DataItem value: unit conversion, quality, UTC timestamp, and an error
// code when the value isn't real/valid - the promotion audit's own list
// ("unidad, tipo, calidad, timestamp, codigo de error y comportamiento
// cuando el origen no responde"). Deliberately separate from XML
// rendering (src/server.ts) and from reading a real machine (src/reader.ts)
// so this pure transform is testable on its own, without hardware or HTTP.
// =============================================================================

import { convertToMtconnectUnit, UnitConversionError, type NativeUnit } from "./units.js";

export type Category = "SAMPLE" | "EVENT" | "CONDITION";
export type Quality = "GOOD" | "UNAVAILABLE";
// MTConnect itself has no standard "why" attribute for a plain
// SAMPLE/EVENT going UNAVAILABLE - this project's own v0 convention (like
// other DataItem-shape decisions in this ecosystem) for real, honest
// diagnosis instead of a bare UNAVAILABLE with no reason.
export type ErrorCode = "NO_DATA" | "UNIT_CONVERSION_ERROR" | "SOURCE_UNAVAILABLE";

/** One raw value as read directly from a source machine, before any
 * MTConnect-specific transformation. `value: null` is a real, explicit
 * "the source reported no value" - distinct from simply not calling
 * toDataItemReading() at all. */
export interface RawReading {
  id: string;
  category: Category;
  type: string;
  nativeUnit?: NativeUnit;
  value: number | string | null;
  timestampMs: number;
}

/** The real, MTConnect-ready result of mapping one RawReading. */
export interface DataItemReading {
  id: string;
  category: Category;
  type: string;
  units?: string;
  /** The literal string "UNAVAILABLE" when quality !== "GOOD" - MTConnect's
   * own real, spec-recognized value for "no valid data", not a made-up
   * placeholder. */
  value: string;
  quality: Quality;
  timestampMs: number;
  errorCode?: ErrorCode;
}

function base(raw: Pick<RawReading, "id" | "category" | "type" | "timestampMs">) {
  return { id: raw.id, category: raw.category, type: raw.type, timestampMs: raw.timestampMs };
}

/**
 * Real, deterministic mapping from one RawReading to its DataItemReading:
 * - `value: null`, or a non-finite number (NaN/Infinity a bad sensor read
 *   can genuinely produce) -> UNAVAILABLE / NO_DATA.
 * - a numeric value with a declared native unit -> converted for real via
 *   units.ts; a native unit this adapter doesn't know how to convert
 *   -> UNAVAILABLE / UNIT_CONVERSION_ERROR (never a silently-wrong number
 *   under the wrong unit label).
 * - anything else (a string EVENT value like "READY", or a bare number
 *   with no unit to convert) passes through as GOOD.
 */
export function toDataItemReading(raw: RawReading): DataItemReading {
  if (raw.value === null || (typeof raw.value === "number" && !Number.isFinite(raw.value))) {
    return { ...base(raw), value: "UNAVAILABLE", quality: "UNAVAILABLE", errorCode: "NO_DATA" };
  }
  if (typeof raw.value === "number" && raw.nativeUnit) {
    try {
      const converted = convertToMtconnectUnit(raw.value, raw.nativeUnit);
      return { ...base(raw), units: converted.unit, value: String(converted.value), quality: "GOOD" };
    } catch (err) {
      if (err instanceof UnitConversionError) {
        return { ...base(raw), value: "UNAVAILABLE", quality: "UNAVAILABLE", errorCode: "UNIT_CONVERSION_ERROR" };
      }
      throw err;
    }
  }
  return { ...base(raw), value: String(raw.value), quality: "GOOD" };
}

/** The real degraded reading rendered when the source itself couldn't be
 * reached at all (see reader.ts's SourceUnavailableError) - distinct from
 * NO_DATA (source responded but this one value was empty/invalid). */
export function sourceUnavailableReading(id: string, category: Category, type: string, timestampMs: number): DataItemReading {
  return { id, category, type, value: "UNAVAILABLE", quality: "UNAVAILABLE", errorCode: "SOURCE_UNAVAILABLE", timestampMs };
}
