// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - src/reader.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// Real polling-frequency limit and cache in front of a MachineReader - the
// promotion audit's own "limitar frecuencia de polling y cache para no
// sobrecargar equipos antiguos". A real source (once one exists) may be a
// slow, decades-old controller that cannot take a fresh read on every
// single HTTP /current request; this wrapper
// is generic over any MachineReader, so it's testable today with a real
// fixture/fake one, without needing that hardware to exist yet.
// =============================================================================

import type { RawReading } from "./dataitem.js";

export interface MachineReader {
  read(): Promise<RawReading[]>;
}

/** Real, honest signal that the underlying source could not be reached at
 * all for this poll - distinct from a reading that came back with an
 * individual invalid value (see dataitem.ts's NO_DATA). */
export class SourceUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`machine source unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "SourceUnavailableError";
  }
}

/**
 * Wraps a MachineReader with a real minimum interval between actual reads:
 * a call within `minPollIntervalMs` of the last real read returns the
 * cached readings instead of hitting the source again. A real failed read
 * clears the cache and propagates SourceUnavailableError - the caller
 * (server.ts) renders that as a real degraded/UNAVAILABLE response rather
 * than serving readings that might be arbitrarily stale.
 */
export class CachedReader {
  private cachedReadings: RawReading[] | null = null;
  private lastReadAtMs = -Infinity;

  constructor(
    private readonly reader: MachineReader,
    private readonly minPollIntervalMs: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isFinite(minPollIntervalMs) || minPollIntervalMs < 0) {
      throw new RangeError("minPollIntervalMs must be a finite non-negative number");
    }
  }

  async getReadings(): Promise<RawReading[]> {
    const nowMs = this.now();
    if (this.cachedReadings !== null && nowMs - this.lastReadAtMs < this.minPollIntervalMs) {
      return this.cachedReadings;
    }
    try {
      const readings = await this.reader.read();
      this.cachedReadings = readings;
      this.lastReadAtMs = nowMs;
      return readings;
    } catch (err) {
      this.cachedReadings = null;
      throw new SourceUnavailableError(err);
    }
  }
}
