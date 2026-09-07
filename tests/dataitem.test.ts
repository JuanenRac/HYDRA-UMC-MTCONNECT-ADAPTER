// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/dataitem.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// Pure unit tests of the real raw-reading -> DataItemReading mapping -
// quality, units, UTC timestamps and error codes, all testable without
// hardware or a running adapter (the promotion audit's own requirement).
// =============================================================================

import { describe, expect, it } from "vitest";
import { sourceUnavailableReading, toDataItemReading, type RawReading } from "../src/dataitem.js";

describe("toDataItemReading - GOOD readings", () => {
  it("converts a Fahrenheit reading to a real Celsius GOOD reading", () => {
    const raw: RawReading = { id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "FAHRENHEIT", value: 98.6, timestampMs: 1_700_000_000_000 };
    const result = toDataItemReading(raw);
    expect(result.quality).toBe("GOOD");
    expect(result.units).toBe("DEGREE_CELSIUS");
    expect(Number(result.value)).toBeCloseTo(37, 6);
    expect(result.errorCode).toBeUndefined();
  });

  it("passes a string EVENT value through unchanged as GOOD", () => {
    const raw: RawReading = { id: "execution", category: "EVENT", type: "EXECUTION", value: "READY", timestampMs: 1_700_000_000_000 };
    const result = toDataItemReading(raw);
    expect(result).toMatchObject({ value: "READY", quality: "GOOD" });
    expect(result.units).toBeUndefined();
  });

  it("passes a numeric value through as GOOD when no native unit is declared", () => {
    const raw: RawReading = { id: "part_count", category: "EVENT", type: "PART_COUNT", value: 42, timestampMs: 1_700_000_000_000 };
    const result = toDataItemReading(raw);
    expect(result).toMatchObject({ value: "42", quality: "GOOD" });
  });

  it("uses the real UTC epoch ms passed in, unchanged", () => {
    const raw: RawReading = { id: "x", category: "EVENT", type: "X", value: "y", timestampMs: 1_735_689_600_000 };
    expect(toDataItemReading(raw).timestampMs).toBe(1_735_689_600_000);
  });
});

describe("toDataItemReading - degraded/invalid readings (fixture: mixed units, bad data, downtime)", () => {
  it("renders a null value as UNAVAILABLE/NO_DATA", () => {
    const raw: RawReading = { id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value: null, timestampMs: 1_700_000_000_000 };
    const result = toDataItemReading(raw);
    expect(result.value).toBe("UNAVAILABLE");
    expect(result.quality).toBe("UNAVAILABLE");
    expect(result.errorCode).toBe("NO_DATA");
  });

  it("renders a NaN sensor reading as UNAVAILABLE/NO_DATA rather than the literal string 'NaN'", () => {
    const raw: RawReading = { id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value: NaN, timestampMs: 1_700_000_000_000 };
    const result = toDataItemReading(raw);
    expect(result.value).toBe("UNAVAILABLE");
    expect(result.errorCode).toBe("NO_DATA");
  });

  it("renders an unrecognized native unit as UNAVAILABLE/UNIT_CONVERSION_ERROR, never a silently-wrong number", () => {
    const raw: RawReading = {
      id: "spindle_temp",
      category: "SAMPLE",
      type: "TEMPERATURE",
      // @ts-expect-error - deliberately an invalid native unit, proving the runtime guard
      nativeUnit: "KELVIN",
      value: 310,
      timestampMs: 1_700_000_000_000,
    };
    const result = toDataItemReading(raw);
    expect(result.value).toBe("UNAVAILABLE");
    expect(result.quality).toBe("UNAVAILABLE");
    expect(result.errorCode).toBe("UNIT_CONVERSION_ERROR");
  });
});

describe("sourceUnavailableReading (the whole source is down, not just one bad value)", () => {
  it("renders SOURCE_UNAVAILABLE, distinct from a per-value NO_DATA", () => {
    const result = sourceUnavailableReading("spindle_temp", "SAMPLE", "TEMPERATURE", 1_700_000_000_000);
    expect(result.value).toBe("UNAVAILABLE");
    expect(result.quality).toBe("UNAVAILABLE");
    expect(result.errorCode).toBe("SOURCE_UNAVAILABLE");
  });
});
