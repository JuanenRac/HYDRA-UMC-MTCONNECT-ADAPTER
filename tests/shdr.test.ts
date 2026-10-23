import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ObservationBuffer } from "../src/buffer.js";
import { escapeShdr, formatShdrLine, ShdrServer } from "../src/shdr.js";
import { buildApp } from "../src/server.js";
import type { MachineReader } from "../src/reader.js";
import type { RawReading } from "../src/dataitem.js";

const T = Date.parse("2026-01-01T00:00:00.000Z");

/** A simulated agent: connects, collects the lines it receives and can send lines. */
function connect(port: number): Promise<{ socket: net.Socket; lines: string[]; waitFor: (n: number) => Promise<void> }> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    let pending = "";
    const socket = net.connect(port, "127.0.0.1");
    socket.on("data", (d) => {
      pending += d.toString();
      const parts = pending.split("\n");
      pending = parts.pop() ?? "";
      lines.push(...parts);
    });
    const waitFor = async (n: number) => {
      for (let i = 0; i < 100 && lines.length < n; i++) await new Promise((r) => setTimeout(r, 10));
    };
    socket.on("connect", () => resolve({ socket, lines, waitFor }));
  });
}

describe("SHDR formatting", () => {
  it("writes a plain observation as time|key|value", () => {
    expect(formatShdrLine({ sequence: 1, id: "execution", category: "EVENT", type: "EXECUTION", value: "READY", timestampMs: T })).toBe("2026-01-01T00:00:00.000Z|execution|READY");
  });
  it("escapes pipes and line breaks", () => {
    expect(escapeShdr("a|b\nc")).toBe("a\\|b c");
  });
  it("writes a condition with its native code and message", () => {
    const line = formatShdrLine({ sequence: 1, id: "cond", category: "CONDITION", type: "TEMPERATURE", value: "FAULT", timestampMs: T, nativeCode: "E12", message: "too hot" });
    expect(line).toBe("2026-01-01T00:00:00.000Z|cond|FAULT|E12|||too hot");
  });
  it("writes an unavailable condition without fields", () => {
    expect(formatShdrLine({ sequence: 1, id: "cond", category: "CONDITION", type: "TEMPERATURE", value: "UNAVAILABLE", timestampMs: T })).toBe("2026-01-01T00:00:00.000Z|cond|UNAVAILABLE||||");
  });
});

describe("SHDR server against a simulated agent", () => {
  let server: ShdrServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("sends the current state on connect and then only changes", async () => {
    const buffer = new ObservationBuffer(100);
    buffer.record({ id: "execution", category: "EVENT", type: "EXECUTION", value: "READY", timestampMs: T });
    server = new ShdrServer(buffer);
    const port = await server.listen(0, "127.0.0.1");
    const agent = await connect(port);
    await agent.waitFor(3);
    expect(agent.lines).toEqual(["* shdrVersion: 2", "* device: HydraNode_1", "2026-01-01T00:00:00.000Z|execution|READY"]);

    buffer.record({ id: "execution", category: "EVENT", type: "EXECUTION", value: "READY", timestampMs: T + 1 });
    buffer.record({ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", value: "60", timestampMs: T + 2 });
    server.flush();
    server.flush();
    await agent.waitFor(4);
    await new Promise((r) => setTimeout(r, 50));
    expect(agent.lines.slice(3)).toEqual(["2026-01-01T00:00:00.002Z|spindle_temp|60"]);
    agent.socket.destroy();
  });

  it("answers the heartbeat and ignores anything else a client sends", async () => {
    const buffer = new ObservationBuffer(100);
    buffer.record({ id: "avail", category: "EVENT", type: "AVAILABILITY", value: "AVAILABLE", timestampMs: T });
    server = new ShdrServer(buffer, { heartbeatMs: 5000 });
    const port = await server.listen(0, "127.0.0.1");
    const agent = await connect(port);
    await agent.waitFor(3);
    agent.socket.write("2026-01-01T00:00:00.000Z|avail|UNAVAILABLE\n* PING\n");
    await agent.waitFor(4);
    expect(agent.lines[3]).toBe("* PONG 5000");
    expect(buffer.current()[0].value).toBe("AVAILABLE");
    agent.socket.destroy();
  });

  it("serves the readings of the adapter app through the same buffer", async () => {
    let temperature = 140;
    const reader: MachineReader = {
      async read(): Promise<RawReading[]> {
        return [{ id: "spindle_temp", category: "SAMPLE", type: "TEMPERATURE", nativeUnit: "FAHRENHEIT", value: temperature, timestampMs: T }];
      },
    };
    const app = buildApp({ reader, minPollIntervalMs: 0 });
    server = new ShdrServer(app.locals.buffer);
    const port = await server.listen(0, "127.0.0.1");
    const agent = await connect(port);
    await agent.waitFor(2);
    await app.locals.refresh();
    server.flush();
    await agent.waitFor(8);
    await new Promise((r) => setTimeout(r, 50));
    expect(agent.lines.some((l) => l.endsWith("|spindle_temp|60"))).toBe(true);
    temperature = 212;
    await app.locals.refresh();
    server.flush();
    await agent.waitFor(9);
    await new Promise((r) => setTimeout(r, 50));
    expect(agent.lines.some((l) => l.endsWith("|spindle_temp|100"))).toBe(true);
    agent.socket.destroy();
  });
});
