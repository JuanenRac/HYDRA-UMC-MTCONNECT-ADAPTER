// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/simulation-bench.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// Simulation bench: the real SHDR reader and the real SHDR server against a simulated machine that speaks SHDR (a TCP feed with a seeded cycle of states) and
// misbehaves on command: it refuses the connection, accepts and says nothing, sends its lines one byte at a time, sends garbage and a line that never ends,
// hangs up in the middle of a cycle, and comes back. No hardware is involved. What the bench proves is that the adapter never shows a value the machine did not
// send, forgets a value when the connection that carried it is gone, and recovers by itself when the machine comes back.
// =============================================================================

import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ObservationBuffer } from "../src/buffer.js";
import { SourceUnavailableError } from "../src/reader.js";
import { escapeShdr, formatShdrLine, ShdrServer } from "../src/shdr.js";
import { parseShdrCondition, parseShdrLine, parseShdrSource, ShdrMachineReader } from "../src/shdrReader.js";

const SEED = 20260101;

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

async function waitFor(condition: () => boolean | Promise<boolean>, what: string, timeoutMs = 6000): Promise<void> {
  const started = Date.now();
  while (!(await condition())) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

const line = (id: string, value: string, at = 1_767_225_600_000) => `${new Date(at).toISOString()}|${id}|${value}\n`;

class SimulatedMachine {
  readonly server: net.Server;
  readonly sockets = new Set<net.Socket>();
  received: string[] = [];
  onConnect: (socket: net.Socket) => void = () => undefined;

  constructor() {
    this.server = net.createServer((socket) => {
      this.sockets.add(socket);
      socket.on("error", () => undefined);
      socket.on("close", () => this.sockets.delete(socket));
      socket.on("data", (chunk) => this.received.push(chunk.toString("utf8")));
      this.onConnect(socket);
    });
  }

  listen(port = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, "127.0.0.1", () => resolve((this.server.address() as net.AddressInfo).port));
    });
  }

  hangUp(): void {
    for (const socket of this.sockets) socket.destroy();
  }

  broadcast(text: string): void {
    for (const socket of this.sockets) socket.write(text);
  }

  async close(): Promise<void> {
    this.hangUp();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

const machines: SimulatedMachine[] = [];
const readers: ShdrMachineReader[] = [];
const servers: ShdrServer[] = [];
const sockets: net.Socket[] = [];

afterEach(async () => {
  for (const reader of readers.splice(0)) reader.close();
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const server of servers.splice(0)) await server.close();
  for (const machine of machines.splice(0)) await machine.close();
});

async function machine(): Promise<{ sim: SimulatedMachine; port: number }> {
  const sim = new SimulatedMachine();
  machines.push(sim);
  return { sim, port: await sim.listen() };
}

function reader(port: number, extra: Partial<ConstructorParameters<typeof ShdrMachineReader>[0]> = {}): ShdrMachineReader {
  const created = new ShdrMachineReader({ host: "127.0.0.1", port, connectTimeoutMs: 500, ...extra });
  readers.push(created);
  return created;
}

const valueOf = async (r: ShdrMachineReader, id: string) => (await r.read()).find((reading) => reading.id === id)?.value;

describe("a machine that behaves", () => {
  it("follows a seeded cycle of states, one change at a time", async () => {
    const { sim, port } = await machine();
    sim.onConnect = (socket) => socket.write("* shdrVersion: 2\n" + line("execution", "READY") + line("avail", "AVAILABLE"));
    const r = reader(port);
    await waitFor(async () => (await r.read().catch(() => [])).length === 2, "the first values");
    const random = seeded(SEED);
    const states = ["ACTIVE", "READY", "INTERRUPTED", "STOPPED", "FEED_HOLD"];
    for (let step = 0; step < 25; step++) {
      const state = states[Math.floor(random() * states.length)];
      sim.broadcast(line("execution", state, 1_767_225_600_000 + step * 1000));
      await waitFor(async () => (await valueOf(r, "execution")) === state, `the state ${state}`);
    }
    expect(await valueOf(r, "avail")).toBe("AVAILABLE");
  });

  it("answers the heartbeat of the source and reads CRLF line ends", async () => {
    const { sim, port } = await machine();
    sim.onConnect = (socket) => socket.write("* PING\r\n" + line("execution", "ACTIVE").replace(/\n/g, "\r\n"));
    const r = reader(port);
    await waitFor(async () => (await r.read().catch(() => [])).length === 1, "the value");
    await waitFor(() => sim.received.join("").includes("* PONG 60000"), "the pong");
    expect(await valueOf(r, "execution")).toBe("ACTIVE");
  });

  it("assembles a line that arrives one byte at a time", async () => {
    const { sim, port } = await machine();
    const text = line("execution", "ACTIVE");
    sim.onConnect = (socket) => {
      void (async () => {
        for (const ch of text) {
          socket.write(ch);
          await sleep(2);
        }
      })();
    };
    const r = reader(port);
    await waitFor(async () => (await r.read().catch(() => [])).length === 1, "the slow line", 8000);
    expect(await valueOf(r, "execution")).toBe("ACTIVE");
  });
});

describe("a machine that fails", () => {
  it("is unavailable, not silent and not invented, when nothing listens", async () => {
    const free = new net.Server();
    await new Promise<void>((resolve) => free.listen(0, "127.0.0.1", resolve));
    const port = (free.address() as net.AddressInfo).port;
    await new Promise<void>((resolve) => free.close(() => resolve()));
    await expect(reader(port).read()).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it("is unavailable until the machine has said something, even though the connection is up", async () => {
    const { port } = await machine();
    await expect(reader(port).read()).rejects.toThrow(/has not sent a value/);
  });

  it("ignores garbage, overlong lines, unknown items and non-observations, and still reads the next good line", async () => {
    const { sim, port } = await machine();
    const random = seeded(SEED + 1);
    const noise = Array.from({ length: 30 }, () => Array.from({ length: 1 + Math.floor(random() * 60) }, () => String.fromCharCode(33 + Math.floor(random() * 90))).join("").replace(/\n/g, "")).join("\n");
    sim.onConnect = (socket) =>
      socket.write(
        [
          noise,
          "no pipes at all",
          "a|b",
          "not-a-time|execution|ACTIVE",
          `${new Date(1_767_225_600_000).toISOString()}||ACTIVE`,
          line("unknown_item", "7").trim(),
          "* some comment",
          "x".repeat(5000),
          line("execution", "ACTIVE").trim(),
          "",
        ].join("\n") + "\n",
      );
    const r = reader(port);
    await waitFor(async () => (await valueOf(r, "execution").catch(() => undefined)) === "ACTIVE", "the good line after the garbage");
    const readings = await r.read();
    expect(readings.map((reading) => reading.id)).toEqual(["execution"]);
  });

  it("drops a line that never ends instead of growing without limit, then recovers on the next line", async () => {
    const { sim, port } = await machine();
    sim.onConnect = (socket) => socket.write("y".repeat(4000));
    const r = reader(port);
    await r.read().catch(() => undefined); // opens the connection
    await waitFor(() => sim.sockets.size === 1, "the connection");
    await sleep(200);
    sim.broadcast("\n" + line("execution", "READY"));
    await waitFor(async () => (await valueOf(r, "execution").catch(() => undefined)) === "READY", "the line after the endless one");
  });

  it("forgets what the connection said when the connection is gone, and reconnects by itself", async () => {
    const { sim, port } = await machine();
    sim.onConnect = (socket) => socket.write(line("execution", "ACTIVE"));
    const r = reader(port);
    await waitFor(async () => (await valueOf(r, "execution").catch(() => undefined)) === "ACTIVE", "the first value");
    sim.onConnect = () => undefined; // the machine comes back silent
    sim.hangUp();
    await waitFor(async () => (await r.read().then(() => false).catch(() => true)), "the value to be forgotten");
    sim.broadcast(line("execution", "STOPPED")); // now the machine speaks again, on the connection the reader opened by itself
    await waitFor(async () => (await valueOf(r, "execution").catch(() => undefined)) === "STOPPED", "the value after the machine came back");
  });

  it("survives a machine that flaps ten times", async () => {
    const { sim, port } = await machine();
    let generation = 0;
    sim.onConnect = (socket) => socket.write(line("execution", `GEN${generation}`));
    const r = reader(port);
    for (generation = 1; generation <= 10; generation++) {
      const expected = `GEN${generation}`;
      sim.hangUp();
      await waitFor(async () => (await valueOf(r, "execution").catch(() => undefined)) === expected, expected);
    }
  });

  it("times out on a machine that accepts the connection at the network level but is not there", async () => {
    // a listener that is full: the connect does not complete before the timeout
    const blackhole = reader(1, { host: "10.255.255.1", connectTimeoutMs: 300 });
    const started = Date.now();
    await expect(blackhole.read()).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("keeps a numeric item as a number and turns UNAVAILABLE and text into no value", async () => {
    const { sim, port } = await machine();
    sim.onConnect = (socket) => socket.write(line("temp", "41.5") + line("temp", "UNAVAILABLE", 1_767_225_601_000) + line("temp", "hot", 1_767_225_602_000) + line("temp", "42.25", 1_767_225_603_000));
    const r = reader(port, { feedable: { temp: { category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "CELSIUS" } } });
    await waitFor(async () => (await valueOf(r, "temp").catch(() => undefined)) === 42.25, "the last number");
  });

  it("reads a condition with an escaped pipe in its message", async () => {
    const { sim, port } = await machine();
    sim.onConnect = (socket) => socket.write(`${new Date(1_767_225_600_000).toISOString()}|spindle|FAULT|E42|||over\\|temperature\n`);
    const r = reader(port, { feedable: { spindle: { category: "CONDITION", type: "TEMPERATURE" } } });
    await waitFor(async () => ((await r.read().catch(() => [])).length === 1), "the condition");
    const [reading] = await r.read();
    expect(reading).toMatchObject({ value: "FAULT", nativeCode: "E42", message: "over|temperature" });
  });
});

describe("the parsers on hostile input", () => {
  it("never throw and only accept what is an observation", () => {
    const random = seeded(SEED + 2);
    for (let i = 0; i < 500; i++) {
      const text = Array.from({ length: Math.floor(random() * 80) }, () => String.fromCharCode(Math.floor(random() * 128))).join("");
      expect(() => parseShdrLine(text)).not.toThrow();
      expect(() => parseShdrCondition(text)).not.toThrow();
    }
    expect(parseShdrLine("2026-01-01T00:00:00.000Z|a|b")).toEqual([Date.parse("2026-01-01T00:00:00.000Z"), "a", "b"]);
    expect(parseShdrLine("* PING")).toBeNull();
    expect(parseShdrLine("2026-01-01T00:00:00.000Z|a|b|c")).toBeNull();
    expect(parseShdrLine("x".repeat(1025))).toBeNull();
    expect(parseShdrSource("9")).toEqual({ host: "127.0.0.1", port: 9 });
    expect(parseShdrSource("plant-cnc:7878")).toEqual({ host: "plant-cnc", port: 7878 });
    for (const bad of ["", "0", "65536", "host:", "host:abc", ":80x", "1.2.3.4:99999"]) expect(parseShdrSource(bad)).toBeNull();
  });

  it("round-trips what the server writes: a message with a pipe or a line break comes back as the same text", () => {
    const random = seeded(SEED + 3);
    const alphabet = ["a", "Z", "0", " ", "|", "\n", "\r", "é", "-"];
    for (let i = 0; i < 300; i++) {
      const message = Array.from({ length: Math.floor(random() * 24) }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
      const written = formatShdrLine({ sequence: 1, id: "spindle", category: "CONDITION", type: "TEMPERATURE", value: "WARNING", timestampMs: 1_767_225_600_000, message, nativeCode: "C" });
      expect(written.includes("\n")).toBe(false);
      const parsed = parseShdrCondition(written);
      expect(parsed).not.toBeNull();
      expect(parsed?.[4]).toBe(message.replace(/\r\n|\r|\n/g, " "));
    }
    expect(escapeShdr("a|b")).toBe("a\\|b");
  });
});

describe("the SHDR server against agents that misbehave", () => {
  async function serve(): Promise<{ buffer: ObservationBuffer; server: ShdrServer; port: number }> {
    const buffer = new ObservationBuffer(100);
    const server = new ShdrServer(buffer, { heartbeatMs: 5000, device: "Sim_1" });
    servers.push(server);
    return { buffer, server, port: await server.listen(0, "127.0.0.1") };
  }

  function agent(port: number): { socket: net.Socket; text: () => string } {
    const socket = net.connect(port, "127.0.0.1");
    sockets.push(socket);
    let received = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => (received += chunk));
    socket.on("error", () => undefined);
    return { socket, text: () => received };
  }

  it("greets an agent with the device and the current values, and streams what changes", async () => {
    const { buffer, server, port } = await serve();
    buffer.record({ id: "execution", category: "EVENT", type: "EXECUTION", value: "READY", timestampMs: 1_767_225_600_000 });
    const a = agent(port);
    await waitFor(() => a.text().includes("|execution|READY"), "the current value");
    expect(a.text().startsWith("* shdrVersion: 2\n* device: Sim_1\n")).toBe(true);
    buffer.record({ id: "execution", category: "EVENT", type: "EXECUTION", value: "ACTIVE", timestampMs: 1_767_225_601_000 });
    server.flush();
    await waitFor(() => a.text().includes("|execution|ACTIVE"), "the change");
  });

  it("answers the heartbeat and ignores every other thing an agent sends", async () => {
    const { buffer, port } = await serve();
    buffer.record({ id: "execution", category: "EVENT", type: "EXECUTION", value: "READY", timestampMs: 1_767_225_600_000 });
    const a = agent(port);
    await waitFor(() => a.text().includes("|execution|READY"), "the greeting");
    a.socket.write("* PING\n2026-01-01T00:00:00.000Z|execution|HACKED\n");
    await waitFor(() => a.text().includes("* PONG 5000"), "the pong");
    expect(buffer.current().map((o) => o.value)).toEqual(["READY"]);
  });

  it("closes an agent that sends a line that never ends and keeps serving the others", async () => {
    const { port, server } = await serve();
    const rude = agent(port);
    const polite = agent(port);
    await waitFor(() => server.clientCount === 2, "both agents");
    rude.socket.write("z".repeat(4000));
    await waitFor(() => server.clientCount === 1, "the rude agent to be dropped");
    polite.socket.write("* PING\n");
    await waitFor(() => polite.text().includes("* PONG"), "the polite agent to be served");
  });

  it("refuses the seventeenth agent and serves the sixteen", async () => {
    const { port, server } = await serve();
    const agents = Array.from({ length: 16 }, () => agent(port));
    await waitFor(() => server.clientCount === 16, "sixteen agents");
    const extra = agent(port);
    const closed = new Promise<void>((resolve) => extra.socket.once("close", () => resolve()));
    await closed;
    expect(server.clientCount).toBe(16);
    expect(agents.every((a) => !a.socket.destroyed)).toBe(true);
  });
});
