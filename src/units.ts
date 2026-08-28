// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - src/units.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// Real unit conversion from whatever native unit a source machine reports
// in to the MTConnect-standard unit its DataItem declares - a pure
// function, testable without any hardware or a running adapter. This is
// what the promotion audit specifically asks for: "conversiones de unidad
// se prueben sin hardware", not embedded inline in XML-building code where
// it can only be exercised through a real HTTP round trip.
// =============================================================================

export type NativeUnit = "CELSIUS" | "FAHRENHEIT" | "RPM" | "RADIAN_PER_SECOND" | "MILLIMETER" | "INCH";
export type MtconnectUnit = "DEGREE_CELSIUS" | "REVOLUTION_PER_MINUTE" | "MILLIMETER";

export class UnitConversionError extends Error {}

/**
 * Converts a real numeric value from its source's own native unit to the
 * MTConnect-standard unit its DataItem should report. Throws
 * UnitConversionError for a native unit this adapter doesn't know how to
 * convert yet - an honest failure the caller renders as UNAVAILABLE,
 * rather than silently passing through an unconverted (and therefore
 * wrong) number under a unit label that doesn't match it.
 */
export function convertToMtconnectUnit(value: number, nativeUnit: NativeUnit): { value: number; unit: MtconnectUnit } {
  switch (nativeUnit) {
    case "CELSIUS":
      return { value, unit: "DEGREE_CELSIUS" };
    case "FAHRENHEIT":
      return { value: ((value - 32) * 5) / 9, unit: "DEGREE_CELSIUS" };
    case "RPM":
      return { value, unit: "REVOLUTION_PER_MINUTE" };
    case "RADIAN_PER_SECOND":
      return { value: (value * 60) / (2 * Math.PI), unit: "REVOLUTION_PER_MINUTE" };
    case "MILLIMETER":
      return { value, unit: "MILLIMETER" };
    case "INCH":
      return { value: value * 25.4, unit: "MILLIMETER" };
    default: {
      // Exhaustiveness check: a new NativeUnit added without a case here
      // is a real compile error, not a silent runtime fallthrough.
      const exhaustive: never = nativeUnit;
      throw new UnitConversionError(`unsupported native unit: ${String(exhaustive)}`);
    }
  }
}
