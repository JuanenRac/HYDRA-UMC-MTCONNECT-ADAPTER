// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/simulation-bench-sources.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// Simulation bench, part two: the two machine sources that are not a machine on SHDR. The reader of HYDRA-UMC-SERVER runs against a host twin of the server's
// GET /api/settings that is off, answers 500, sends a page that is not JSON, a JSON cut in the middle or an empty roster, never answers, forgets the session and
// loses the robot; the reader of the MQTT broker runs against a broker that refuses, drops its clients, and a bridge that publishes garbage, a wrong topic, an
// execution the standard does not know and a value that is old. On a fixed seed. No server, no broker of the ecosystem, no machine. What the bench proves is that
// a read either shows what the source really said or fails, that a failed read never leaves an old value behind, and that the reader recovers by itself.
// =============================================================================

import { afterEach, describe, expect, it } from "vitest";
import { startFakeBroker, type FakeBroker } from "./fakeBroker.js";
import { HydraServerMachineReader } from "../src/hydraServerReader.js";
import { DEFAULT_EXECUTION_TOPIC, EXECUTION_VALUES, MqttMachineReader } from "../src/mqttMachineReader.js";
import { CachedReader, SourceUnavailableError } from "../src/reader.js";

const SEED = 20260102;

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean | Promise<boolean>, what: string, timeoutMs = 8000): Promise<void> {
  const started = Date.now();
  while (!(await condition())) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// The host twin of GET /api/settings and POST /api/login of HYDRA-UMC-SERVER
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

type Playback = "idle" | "playing" | "paused" | "finished";
type Fault = "down" | "hang" | "http500" | "http503" | "junk" | "cut" | "liar" | "empty";
const FAULTS: Fault[] = ["down", "hang", "http500", "http503", "junk", "cut", "liar", "empty"];

const EXECUTION_OF: Record<Playback, string> = { idle: "READY", playing: "ACTIVE", paused: "INTERRUPTED", finished: "STOPPED" };

class SimulatedHydraServer {
  playback: Playback = "idle";
  online = true;
  robotListed = true;
  /** The fault of the next request, once. */
  nextFault: Fault | null = null;
  /** The sessions the server accepts. */
  sessions = new Set<string>();
  loginDown = false;
  logins = 0;
  settingsRequests = 0;

  readonly fetchImpl = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/api/login")) return this.login(init);
    this.settingsRequests += 1;
    const fault = this.nextFault;
    this.nextFault = null;
    if (fault === "down") throw new TypeError("fetch failed");
    if (fault === "hang") {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")), { once: true });
      });
    }
    if (fault === "http500") return new Response(JSON.stringify({ error: "database is locked" }), { status: 500 });
    if (fault === "http503") return new Response("starting", { status: 503 });
    if (fault === "junk") return new Response("<html>starting...</html>", { status: 200, headers: { "content-type": "text/html" } });
    if (fault === "liar") return new Response('{"controllers":[{"id":"c1","robots":[{"id":1,"onl', { status: 200 });
    if (fault === "empty") return new Response(JSON.stringify({ controllers: [] }), { status: 200 });
    if (fault === "cut") {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"controllers":['));
          controller.error(new TypeError("terminated"));
        },
      });
      return new Response(stream, { status: 200 });
    }
    const header = new Headers(init?.headers).get("authorization") ?? "";
    if (this.sessions.size > 0 || header !== "") {
      if (!this.sessions.has(header.replace(/^Bearer /, ""))) return new Response(JSON.stringify({ error: "Access denied: invalid token" }), { status: 403 });
    }
    return new Response(JSON.stringify(this.settings()), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  private async login(init?: RequestInit): Promise<Response> {
    if (this.loginDown) throw new TypeError("fetch failed");
    const { username, password } = JSON.parse(String(init?.body ?? "{}")) as { username?: string; password?: string };
    if (username !== "operator" || password !== "right-password") return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
    this.logins += 1;
    const token = `session-${this.logins}`;
    this.sessions.add(token);
    return new Response(JSON.stringify({ success: true, token }), { status: 200 });
  }

  settings(): unknown {
    const state = { isPlaying: this.playback === "playing", isPaused: this.playback === "paused", isFinished: this.playback === "finished" };
    const robots = this.robotListed ? [{ id: 1, online: this.online, playbackState: state }] : [];
    return { controllers: [{ id: "c1", name: "Master", robots }] };
  }

  /** What a good read must show for the state of the server now. */
  expected(): { avail: string; execution: string } {
    return { avail: this.online ? "AVAILABLE" : "UNAVAILABLE", execution: this.online ? EXECUTION_OF[this.playback] : "UNAVAILABLE" };
  }
}

const valueOf = (readings: { id: string; value: unknown }[], id: string) => readings.find((reading) => reading.id === id)?.value;

describe("the reader of HYDRA-UMC-SERVER against a server that behaves", () => {
  it("follows the playback of the robot and its online flag", async () => {
    const server = new SimulatedHydraServer();
    const reader = new HydraServerMachineReader({ baseUrl: "http://sim", fetchImpl: server.fetchImpl });
    for (const playback of ["idle", "playing", "paused", "finished"] as Playback[]) {
      server.playback = playback;
      const readings = await reader.read();
      expect(valueOf(readings, "execution")).toBe(EXECUTION_OF[playback]);
      expect(valueOf(readings, "avail")).toBe("AVAILABLE");
    }
    server.online = false;
    const offline = await reader.read();
    expect(valueOf(offline, "execution")).toBe("UNAVAILABLE");
    expect(valueOf(offline, "avail")).toBe("UNAVAILABLE");
  });
});

describe("the reader of HYDRA-UMC-SERVER against a server that fails", () => {
  for (const fault of FAULTS) {
    it(`ends the read, with no value, when the server ${fault === "hang" ? "never answers" : `fails with ${fault}`}, and reads again when it is back`, async () => {
      const server = new SimulatedHydraServer();
      server.playback = "playing";
      const reader = new HydraServerMachineReader({ baseUrl: "http://sim", fetchImpl: server.fetchImpl, requestTimeoutMs: 40 });
      expect(valueOf(await reader.read(), "execution")).toBe("ACTIVE");
      server.nextFault = fault;
      await expect(reader.read()).rejects.toThrow();
      expect(valueOf(await reader.read(), "execution")).toBe("ACTIVE");
    });
  }

  it("says that the source is unavailable and does not advance the sequence, then advances it when the server is back", async () => {
    const server = new SimulatedHydraServer();
    const cached = new CachedReader(new HydraServerMachineReader({ baseUrl: "http://sim", fetchImpl: server.fetchImpl, requestTimeoutMs: 40 }), 0);
    await cached.getReadings();
    expect(cached.sequence).toBe(1);
    server.nextFault = "down";
    await expect(cached.getReadings()).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(cached.sequence).toBe(1);
    server.nextFault = "junk";
    await expect(cached.getReadings()).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(cached.sequence).toBe(1);
    await cached.getReadings();
    expect(cached.sequence).toBe(2);
  });

  it("fails when the robot leaves the roster of a reachable server, and recovers when it comes back", async () => {
    const server = new SimulatedHydraServer();
    const reader = new HydraServerMachineReader({ baseUrl: "http://sim", fetchImpl: server.fetchImpl, robotId: 1 });
    await reader.read();
    server.robotListed = false;
    await expect(reader.read()).rejects.toThrow(/no robot with id 1/);
    server.robotListed = true;
    expect(valueOf(await reader.read(), "avail")).toBe("AVAILABLE");
  });

  it("logs in again once when the session is forgotten, and survives a login that is off", async () => {
    const server = new SimulatedHydraServer();
    const reader = new HydraServerMachineReader({ baseUrl: "http://sim", fetchImpl: server.fetchImpl, username: "operator", password: "right-password" });
    await reader.read();
    expect(server.logins).toBe(1);
    server.sessions.clear();
    server.sessions.add("some-other-session");
    server.loginDown = true;
    await expect(reader.read()).rejects.toThrow();
    expect(server.logins).toBe(1);
    server.loginDown = false;
    await reader.read();
    expect(server.logins).toBe(2);
    await reader.read();
    expect(server.logins).toBe(2);
  });

  function storm(seed: number) {
    return (async () => {
      const server = new SimulatedHydraServer();
      const random = seeded(seed);
      const reader = new HydraServerMachineReader({ baseUrl: "http://sim", fetchImpl: server.fetchImpl, requestTimeoutMs: 25 });
      const playbacks: Playback[] = ["idle", "playing", "paused", "finished"];
      const outcomes: string[] = [];
      for (let tick = 0; tick < 120; tick += 1) {
        server.playback = playbacks[Math.floor(random() * playbacks.length)]!;
        server.online = random() < 0.85;
        const fault = random() < 0.4 ? FAULTS[Math.floor(random() * FAULTS.length)]! : null;
        server.nextFault = fault;
        try {
          const readings = await reader.read();
          // a read that came back shows exactly what the server said now, never an old state
          expect(fault).toBeNull();
          const want = server.expected();
          expect(valueOf(readings, "avail")).toBe(want.avail);
          expect(valueOf(readings, "execution")).toBe(want.execution);
          outcomes.push(`ok:${want.execution}`);
        } catch (error) {
          expect(fault).not.toBeNull();
          expect((error as Error).name).not.toBe("AssertionError");
          outcomes.push(`fail:${String(fault)}`);
        }
      }
      return outcomes;
    })();
  }

  it("on a fixed seed never shows a state the server did not say, and does the same thing twice", async () => {
    const first = await storm(SEED);
    expect(first.filter((entry) => entry.startsWith("fail")).length).toBeGreaterThan(20);
    expect(first.filter((entry) => entry.startsWith("ok")).length).toBeGreaterThan(40);
    expect(await storm(SEED)).toEqual(first);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// The reader of the MQTT broker
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

describe("the reader of the MQTT broker", () => {
  let broker: FakeBroker | null = null;
  const readers: MqttMachineReader[] = [];
  afterEach(async () => {
    for (const reader of readers.splice(0)) reader.close();
    await broker?.close();
    broker = null;
  });

  const message = (body: unknown) => Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  const open = (port: number, extra: Partial<ConstructorParameters<typeof MqttMachineReader>[0]> = {}) => {
    const reader = new MqttMachineReader({ host: "127.0.0.1", port, ...extra });
    readers.push(reader);
    return reader;
  };
  const executionOf = async (reader: MqttMachineReader): Promise<string | null> => {
    try {
      return String(valueOf(await reader.read(), "execution"));
    } catch (error) {
      expect(error).toBeInstanceOf(SourceUnavailableError);
      return null;
    }
  };

  it("is unavailable, and does not crash, while the broker refuses the connection", async () => {
    broker = await startFakeBroker({ refuse: true });
    const reader = open(broker.port);
    await expect(reader.read()).rejects.toBeInstanceOf(SourceUnavailableError);
    await sleep(150);
    await expect(reader.read()).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(broker.filters).toEqual([]);
  });

  it("forgets the value when the broker drops it, and follows the bridge again after it reconnects by itself", async () => {
    broker = await startFakeBroker();
    const reader = open(broker.port);
    await reader.read().catch(() => undefined);
    await waitFor(() => broker!.filters.length > 0, "the subscription");
    const publishUntilSeen = async (execution: string) => {
      await waitFor(async () => {
        broker!.publish(DEFAULT_EXECUTION_TOPIC, message({ execution, observed_at: Date.now() }));
        await sleep(30);
        return (await executionOf(reader)) === execution;
      }, `the value ${execution}`);
    };
    await publishUntilSeen("ACTIVE");
    broker.dropClients();
    await waitFor(async () => (await executionOf(reader)) === null, "the value to be forgotten");
    await publishUntilSeen("FEED_HOLD");
    expect(broker.connects.length).toBeGreaterThanOrEqual(2);
  });

  it("on a fixed seed, shows only the last good message and never one that is garbage, on another topic, unknown or old", async () => {
    broker = await startFakeBroker();
    // a time the bridge could really have written: an observed_at that is not positive is ignored and the arrival time counts instead
    const clock = 10_000_000;
    const reader = open(broker.port, { staleMs: 5000, now: () => clock });
    await reader.read().catch(() => undefined);
    await waitFor(() => broker!.filters.length > 0, "the subscription");
    const random = seeded(SEED);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
    const known = [...EXECUTION_VALUES];
    const junk = (): (() => void) =>
      pick<() => void>([
        () => broker!.publish(DEFAULT_EXECUTION_TOPIC, message("not json at all")),
        () => broker!.publish(DEFAULT_EXECUTION_TOPIC, message([1, 2, 3])),
        () => broker!.publish(DEFAULT_EXECUTION_TOPIC, message({ execution: "RUNNING", observed_at: clock })),
        () => broker!.publish(DEFAULT_EXECUTION_TOPIC, message({ execution: 7, observed_at: clock })),
        () => broker!.publish(DEFAULT_EXECUTION_TOPIC, Buffer.alloc(2000, 0x20)),
        () => broker!.publish(DEFAULT_EXECUTION_TOPIC, Buffer.alloc(0)),
        () => broker!.publish("hydra/bridges/other/execution", message({ execution: "ACTIVE", observed_at: clock })),
      ]);
    let state: string | null = null;
    for (let chunk = 0; chunk < 30; chunk += 1) {
      for (let count = Math.floor(random() * 5); count > 0; count -= 1) junk()();
      let target: string | null;
      if (state !== null && random() < 0.25) {
        broker.publish(DEFAULT_EXECUTION_TOPIC, message({ execution: pick(known), observed_at: clock - 3_600_000 }));
        target = null;
      } else {
        const choices = known.filter((value) => value !== state);
        target = pick(choices);
        broker.publish(DEFAULT_EXECUTION_TOPIC, message({ execution: target, observed_at: clock }));
      }
      for (let count = Math.floor(random() * 4); count > 0; count -= 1) junk()();
      await waitFor(async () => (await executionOf(reader)) === target, `the state ${String(target)}`);
      state = target;
    }
    await sleep(200);
    expect(await executionOf(reader)).toBe(state);
  }, 30_000);
});
