// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/units.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// Pure unit tests of real conversion math - no hardware, no HTTP, no
// running adapter needed.
// =============================================================================

import { describe, expect, it } from "vitest";
import { convertToMtconnectUnit, UnitConversionError } from "../src/units.js";

describe("convertToMtconnectUnit", () => {
  it("passes Celsius through unchanged", () => {
    expect(convertToMtconnectUnit(37, "CELSIUS")).toEqual({ value: 37, unit: "DEGREE_CELSIUS" });
  });

  it("converts a real Fahrenheit reading to Celsius (98.6F = 37C, body-temp-adjacent, hand-checkable)", () => {
    const result = convertToMtconnectUnit(98.6, "FAHRENHEIT");
    expect(result.unit).toBe("DEGREE_CELSIUS");
    expect(result.value).toBeCloseTo(37, 6);
  });

  it("converts freezing point exactly (32F = 0C)", () => {
    expect(convertToMtconnectUnit(32, "FAHRENHEIT")).toEqual({ value: 0, unit: "DEGREE_CELSIUS" });
  });

  it("passes RPM through unchanged", () => {
    expect(convertToMtconnectUnit(1200, "RPM")).toEqual({ value: 1200, unit: "REVOLUTION_PER_MINUTE" });
  });

  it("converts radians/second to RPM (1 rev/s = 2*PI rad/s = 60 RPM, hand-checkable)", () => {
    const result = convertToMtconnectUnit(2 * Math.PI, "RADIAN_PER_SECOND");
    expect(result.unit).toBe("REVOLUTION_PER_MINUTE");
    expect(result.value).toBeCloseTo(60, 6);
  });

  it("passes millimeters through unchanged", () => {
    expect(convertToMtconnectUnit(10, "MILLIMETER")).toEqual({ value: 10, unit: "MILLIMETER" });
  });

  it("converts inches to millimeters (1in = 25.4mm exactly, the real defined conversion)", () => {
    expect(convertToMtconnectUnit(1, "INCH")).toEqual({ value: 25.4, unit: "MILLIMETER" });
  });

  it("throws UnitConversionError for a native unit it doesn't recognize", () => {
    // @ts-expect-error - deliberately passing an invalid native unit to prove the runtime guard, not just the type system
    expect(() => convertToMtconnectUnit(1, "PASCAL")).toThrow(UnitConversionError);
  });
});
