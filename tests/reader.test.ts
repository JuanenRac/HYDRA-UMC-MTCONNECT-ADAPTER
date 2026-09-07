// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/reader.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// Real polling-frequency-limit and cache behavior against a real (if
// fake) MachineReader - no actual hardware, but real timing/caching logic
// under real test, per the promotion audit's own request.
// =============================================================================

import { describe, expect, it } from "vitest";
import { CachedReader, SourceUnavailableError, type MachineReader } from "../src/reader.js";
import type { RawReading } from "../src/dataitem.js";

class CountingReader implements MachineReader {
  calls = 0;
  constructor(private readonly makeReadings: () => Promise<RawReading[]>) {}
  async read(): Promise<RawReading[]> {
    this.calls += 1;
    return this.makeReadings();
  }
}

function reading(value: number): RawReading[] {
  return [{ id: "x", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS", value, timestampMs: 1_700_000_000_000 }];
}

describe("CachedReader - real polling-frequency limit", () => {
  it("rejects a negative or non-finite interval instead of silently hammering a source", () => {
    const inner = new CountingReader(async () => reading(1));
    for (const interval of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new CachedReader(inner, interval)).toThrow(RangeError);
    }
  });

  it("serves the cache instead of re-reading within minPollIntervalMs", async () => {
    let clock = 0;
    const inner = new CountingReader(async () => reading(1));
    const cached = new CachedReader(inner, 1000, () => clock);

    await cached.getReadings();
    clock += 500; // still within the 1000ms window
    await cached.getReadings();

    expect(inner.calls).toBe(1);
  });

  it("performs a real new read once minPollIntervalMs has elapsed", async () => {
    let clock = 0;
    const inner = new CountingReader(async () => reading(1));
    const cached = new CachedReader(inner, 1000, () => clock);

    await cached.getReadings();
    clock += 1000; // exactly at the boundary
    await cached.getReadings();

    expect(inner.calls).toBe(2);
  });

  it("returns the real, up-to-date readings from the underlying reader, not a stale copy", async () => {
    let clock = 0;
    let value = 10;
    const inner = new CountingReader(async () => reading(value));
    const cached = new CachedReader(inner, 1000, () => clock);

    const first = await cached.getReadings();
    expect(first[0].value).toBe(10);

    value = 20;
    clock += 1000;
    const second = await cached.getReadings();
    expect(second[0].value).toBe(20);
  });
});

describe("CachedReader - real source-down handling", () => {
  it("throws SourceUnavailableError when the underlying reader fails, instead of serving stale data", async () => {
    let clock = 0;
    const inner: MachineReader = {
      read: async () => {
        throw new Error("connection refused");
      },
    };
    const cached = new CachedReader(inner, 1000, () => clock);

    await expect(cached.getReadings()).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it("a real recovery after downtime performs a fresh read again, not permanently broken", async () => {
    let clock = 0;
    let shouldFail = true;
    const inner: MachineReader = {
      read: async () => {
        if (shouldFail) throw new Error("connection refused");
        return reading(42);
      },
    };
    const cached = new CachedReader(inner, 1000, () => clock);

    await expect(cached.getReadings()).rejects.toBeInstanceOf(SourceUnavailableError);

    shouldFail = false;
    clock += 1000;
    const readings = await cached.getReadings();
    expect(readings[0].value).toBe(42);
  });
});
