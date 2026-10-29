// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/shdrReader.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// A real TCP server standing in for the SHDR stream of another adapter, and a
// real ShdrMachineReader connected to it.
// =============================================================================

import { afterEach, describe, expect, it } from "vitest";
import net from "node:net";
import { parseShdrLine, parseShdrSource, ShdrMachineReader } from "../src/shdrReader.js";
import { SourceUnavailableError } from "../src/reader.js";

let server: net.Server | undefined;
let reader: ShdrMachineReader | undefined;
const sockets: net.Socket[] = [];

afterEach(async () => {
  reader?.close();
  reader = undefined;
  for (const socket of sockets.splice(0)) socket.destroy();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

async function serve(onConnection: (socket: net.Socket) => void): Promise<number> {
  server = net.createServer((socket) => {
    sockets.push(socket);
    onConnection(socket);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
  return (server!.address() as net.AddressInfo).port;
}

async function eventually<T>(attempt: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 100; i++) {
    try {
      return await attempt();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw last;
}

describe("SHDR source parsing", () => {
  it("reads host:port, a bare port and refuses the rest", () => {
    expect(parseShdrSource("cnc.local:7878")).toEqual({ host: "cnc.local", port: 7878 });
    expect(parseShdrSource("7878")).toEqual({ host: "127.0.0.1", port: 7878 });
    expect(parseShdrSource("host:0")).toBeNull();
    expect(parseShdrSource("host:70000")).toBeNull();
    expect(parseShdrSource("not a source")).toBeNull();
  });

  it("reads observation lines and skips heartbeats, conditions and garbage", () => {
    expect(parseShdrLine("2026-01-01T00:00:00.000Z|execution|ACTIVE")).toEqual([Date.parse("2026-01-01T00:00:00.000Z"), "execution", "ACTIVE"]);
    expect(parseShdrLine("* PING")).toBeNull();
    expect(parseShdrLine("2026-01-01T00:00:00.000Z|cond|FAULT|E1|||text")).toBeNull();
    expect(parseShdrLine("nonsense|execution|ACTIVE")).toBeNull();
    expect(parseShdrLine("x".repeat(2000))).toBeNull();
  });
});

describe("ShdrMachineReader", () => {
  it("serves the latest value of the DataItems it can feed and ignores the others", async () => {
    const port = await serve((socket) => {
      socket.write("2026-01-01T00:00:00.000Z|execution|READY\n2026-01-01T00:00:00.000Z|spindle_speed|1200\n2026-01-01T00:00:01.000Z|avail|AVAILABLE\n");
      socket.write("2026-01-01T00:00:02.000Z|execution|ACTIVE\r\n");
    });
    reader = new ShdrMachineReader({ host: "127.0.0.1", port });
    const readings = await eventually(async () => {
      const got = await reader!.read();
      if (!got.some((r) => r.id === "execution" && r.value === "ACTIVE")) throw new Error("not yet");
      return got;
    });
    expect(readings.map((r) => r.id).sort()).toEqual(["avail", "execution"]);
    const execution = readings.find((r) => r.id === "execution")!;
    expect(execution).toMatchObject({ category: "EVENT", type: "EXECUTION", value: "ACTIVE", timestampMs: Date.parse("2026-01-01T00:00:02.000Z") });
  });

  it("answers a heartbeat", async () => {
    let answer = "";
    const port = await serve((socket) => {
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => (answer += chunk));
      socket.write("* PING\n2026-01-01T00:00:00.000Z|avail|AVAILABLE\n");
    });
    reader = new ShdrMachineReader({ host: "127.0.0.1", port });
    await eventually(() => reader!.read());
    await eventually(async () => {
      if (!answer.startsWith("* PONG")) throw new Error("no answer yet");
    });
  });

  it("fails as an unavailable source when nothing listens", async () => {
    const port = await serve(() => undefined);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    reader = new ShdrMachineReader({ host: "127.0.0.1", port });
    await expect(reader.read()).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it("is unavailable until the source has said something", async () => {
    const port = await serve(() => undefined);
    reader = new ShdrMachineReader({ host: "127.0.0.1", port });
    await expect(reader.read()).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it("is unavailable again once the connection is lost", async () => {
    let dropped: net.Socket | undefined;
    const port = await serve((socket) => {
      dropped = socket;
      socket.write("2026-01-01T00:00:00.000Z|avail|AVAILABLE\n");
    });
    reader = new ShdrMachineReader({ host: "127.0.0.1", port });
    await eventually(() => reader!.read());
    const closing = new Promise<void>((resolve) => server!.close(() => resolve()));
    dropped!.destroy();
    await closing;
    server = undefined;
    await eventually(async () => {
      await reader!.read().then(
        () => {
          throw new Error("still serving the old value");
        },
        (error) => {
          if (!(error instanceof SourceUnavailableError)) throw error;
        },
      );
    });
  });
});
