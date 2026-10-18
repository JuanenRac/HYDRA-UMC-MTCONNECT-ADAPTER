// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - src/buffer.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0 - see LICENSE
//
// The observation buffer an MTConnect agent serves GET /current and
// GET /sample from. Every observation has its own, unique, increasing
// sequence number; a DataItem only gets a new observation when its value
// changed; the buffer keeps the newest `capacity` observations and reports
// the sequence range it really holds, so a client that resumes from the
// `nextSequence` of its last answer receives exactly what happened since.
// =============================================================================

export interface Observation {
  sequence: number;
  id: string;
  category: "EVENT" | "SAMPLE";
  type: string;
  /** The text of the observation; the literal "UNAVAILABLE" when there is no valid value. */
  value: string;
  timestampMs: number;
}

export type ObservationInput = Omit<Observation, "sequence">;

export class ObservationBuffer {
  private items: Observation[] = [];
  private next = 1;
  private readonly latestById = new Map<string, Observation>();

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("the observation buffer needs a capacity of at least 1");
    }
  }

  /** Sequence of the oldest observation still held (the next one to be assigned while the buffer is empty). */
  get firstSequence(): number {
    return this.items.length > 0 ? this.items[0].sequence : this.next;
  }

  /** Sequence of the newest observation ever recorded (0 before the first one). */
  get lastSequence(): number {
    return this.next - 1;
  }

  /** The sequence the next observation will get; what a client passes as `from` to receive only what is new. */
  get nextSequence(): number {
    return this.next;
  }

  /**
   * Adds an observation unless the DataItem already has exactly this value
   * (an agent records changes, not repetitions). Returns the new observation,
   * or null when nothing changed.
   */
  record(input: ObservationInput): Observation | null {
    const previous = this.latestById.get(input.id);
    if (previous && previous.value === input.value) return null;
    const observation: Observation = { ...input, sequence: this.next++ };
    this.items.push(observation);
    if (this.items.length > this.capacity) this.items.shift();
    this.latestById.set(input.id, observation);
    return observation;
  }

  /** The newest observation of every DataItem, in sequence order. */
  current(): Observation[] {
    return [...this.latestById.values()].sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * The observations with sequence >= `from` (inclusive, as MTConnect defines it), at most `count`
   * of them. `nextSequence` is where the client continues: right after the last observation returned.
   */
  since(from: number, count: number): { observations: Observation[]; nextSequence: number } {
    const observations = this.items.filter((item) => item.sequence >= from).slice(0, count);
    const nextSequence = observations.length > 0 ? observations[observations.length - 1].sequence + 1 : Math.max(from, this.firstSequence);
    return { observations, nextSequence: Math.min(nextSequence, this.next) };
  }
}
