// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - src/shdr.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// SHDR (Simple Hierarchical Data Representation) output: the plain-text line
// protocol an MTConnect agent such as cppagent reads from an adapter over TCP.
// This is the adapter side. Read only: it only ever sends observations, and
// the single thing it accepts from a client is the `* PING` heartbeat; every
// other line a client sends is ignored.
//
//   2026-01-01T00:00:00.000Z|execution|READY
//   2026-01-01T00:00:00.000Z|spindle_temp|60
//   2026-01-01T00:00:00.000Z|cond|FAULT|E12|||spindle overheated
//
// On connect a client first receives the latest value of every DataItem, then
// each change as it is recorded. A condition line is
// `time|key|LEVEL|nativeCode|nativeSeverity|qualifier|message`.
// =============================================================================

import net from "node:net";
import type { Observation, ObservationBuffer } from "./buffer.js";

const MAX_CLIENTS = 16;
const MAX_INPUT_LINE = 1024;

/** SHDR is line and pipe separated: a pipe in a value is escaped, a line break becomes a space. */
export function escapeShdr(text: string): string {
  return text.replace(/\r\n|\r|\n/g, " ").replace(/\|/g, "\\|");
}

/** One observation as one SHDR line (no line terminator). */
export function formatShdrLine(observation: Observation): string {
  const time = new Date(observation.timestampMs).toISOString();
  const key = escapeShdr(observation.id);
  if (observation.category === "CONDITION") {
    if (observation.value === "UNAVAILABLE") return `${time}|${key}|UNAVAILABLE||||`;
    return `${time}|${key}|${observation.value}|${escapeShdr(observation.nativeCode ?? "")}|||${escapeShdr(observation.message ?? "")}`;
  }
  return `${time}|${key}|${escapeShdr(observation.value)}`;
}

export interface ShdrServerOptions {
  /** Heartbeat interval announced in answer to `* PING`, in milliseconds. */
  heartbeatMs?: number;
  /** Device name announced with `* device:` so the agent files the data under it. */
  device?: string;
}

/** A read-only SHDR adapter: serves the observations of an ObservationBuffer to every connected agent. */
export class ShdrServer {
  private readonly server: net.Server;
  private readonly clients = new Set<net.Socket>();
  private lastSent: number;
  private readonly heartbeatMs: number;
  private readonly device: string;

  constructor(private readonly buffer: ObservationBuffer, options: ShdrServerOptions = {}) {
    this.heartbeatMs = options.heartbeatMs ?? 10_000;
    this.device = options.device ?? "HydraNode_1";
    this.lastSent = buffer.lastSequence;
    this.server = net.createServer((socket) => this.accept(socket));
  }

  get clientCount(): number {
    return this.clients.size;
  }

  listen(port: number, host: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, host, () => {
        this.server.off("error", reject);
        const address = this.server.address();
        resolve(typeof address === "object" && address ? address.port : port);
      });
    });
  }

  close(): Promise<void> {
    for (const socket of this.clients) socket.destroy();
    this.clients.clear();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  /** Sends to every client what the buffer recorded since the last call. Call it after each refresh of the source. */
  flush(): void {
    const fresh = this.buffer.since(this.lastSent + 1, Number.MAX_SAFE_INTEGER).observations;
    if (fresh.length === 0) return;
    this.lastSent = fresh[fresh.length - 1].sequence;
    const text = fresh.map((o) => formatShdrLine(o) + "\n").join("");
    for (const socket of this.clients) socket.write(text);
  }

  private accept(socket: net.Socket): void {
    if (this.clients.size >= MAX_CLIENTS) {
      socket.destroy();
      return;
    }
    this.clients.add(socket);
    socket.setNoDelay(true);
    socket.on("error", () => socket.destroy());
    socket.on("close", () => this.clients.delete(socket));
    socket.write(`* shdrVersion: 2\n* device: ${this.device}\n`);
    socket.write(this.buffer.current().map((o) => formatShdrLine(o) + "\n").join(""));
    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      let index = pending.indexOf("\n");
      while (index >= 0) {
        const line = pending.slice(0, index).trim();
        pending = pending.slice(index + 1);
        // the only input honoured: the heartbeat; nothing a client sends can change a value
        if (line === "* PING") socket.write(`* PONG ${this.heartbeatMs}\n`);
        index = pending.indexOf("\n");
      }
      if (pending.length > MAX_INPUT_LINE) socket.destroy();
    });
  }
}
