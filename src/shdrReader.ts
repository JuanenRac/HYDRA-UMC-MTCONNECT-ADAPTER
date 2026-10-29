// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - src/shdrReader.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// A machine source that is another adapter's SHDR stream, for example the one
// HYDRA-UMC-BRIDGE-CNC serves (`time|execution|ACTIVE`). The reader keeps one
// TCP connection to it, remembers the latest value of every DataItem this
// agent declares, and answers read() from that memory. Read only: the only line
// it ever sends is the `* PONG` that answers a `* PING`. When the connection
// is down read() fails with SourceUnavailableError, so the agent reports the
// source as unavailable instead of serving the last values as if they were live.
// =============================================================================

import net from "node:net";
import type { RawReading } from "./dataitem.js";
import { SourceUnavailableError, type MachineReader } from "./reader.js";

const MAX_LINE = 1024;
/** The DataItems of the agent that an SHDR source can feed, by id (the others of the source are ignored). */
const FEEDABLE: Readonly<Record<string, { category: "EVENT"; type: string }>> = {
  execution: { category: "EVENT", type: "EXECUTION" },
  avail: { category: "EVENT", type: "AVAILABILITY" },
};

export interface ShdrMachineReaderOptions {
  host: string;
  port: number;
  /** How long a connection attempt may take. Defaults to 3 s. */
  connectTimeoutMs?: number;
}

/** "host:port" (a bare port means the local machine), or null when the text is not one. */
export function parseShdrSource(text: string): { host: string; port: number } | null {
  const match = /^(?:(.+):)?(\d{1,5})$/.exec(text.trim());
  if (!match) return null;
  const port = Number(match[2]);
  if (port < 1 || port > 65_535) return null;
  return { host: match[1] || "127.0.0.1", port };
}

/** One SHDR line as [timestampMs, key, value], or null for a line that is not an observation (a heartbeat, a condition, garbage). */
export function parseShdrLine(line: string): [number, string, string] | null {
  if (line.length > MAX_LINE || line.startsWith("*")) return null;
  const parts = line.split("|");
  if (parts.length !== 3) return null;
  const timestampMs = Date.parse(parts[0]);
  if (!Number.isFinite(timestampMs) || !parts[1]) return null;
  return [timestampMs, parts[1], parts[2]];
}

export class ShdrMachineReader implements MachineReader {
  private socket: net.Socket | null = null;
  private connecting: Promise<void> | null = null;
  private pending = "";
  private readonly latest = new Map<string, RawReading>();

  constructor(private readonly options: ShdrMachineReaderOptions) {}

  async read(): Promise<RawReading[]> {
    if (!this.socket || this.socket.destroyed) await this.connect();
    if (this.latest.size === 0) throw new SourceUnavailableError("the SHDR source has not sent a value yet");
    return [...this.latest.values()];
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
  }

  private connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.connecting = new Promise<void>((resolve, reject) => {
      const socket = net.connect({ host: this.options.host, port: this.options.port });
      const timer = setTimeout(() => socket.destroy(new Error("connection timed out")), this.options.connectTimeoutMs ?? 3000);
      socket.setEncoding("utf8");
      socket.once("connect", () => {
        clearTimeout(timer);
        this.socket = socket;
        this.pending = "";
        resolve();
      });
      socket.on("data", (chunk: string) => this.onData(socket, chunk));
      socket.on("error", (error) => {
        clearTimeout(timer);
        if (this.socket === socket) this.socket = null;
        reject(new SourceUnavailableError(error));
      });
      socket.on("close", () => {
        clearTimeout(timer);
        if (this.socket === socket) {
          this.socket = null;
          // what a closed connection last said is no longer a live value
          this.latest.clear();
        }
      });
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private onData(socket: net.Socket, chunk: string): void {
    this.pending += chunk;
    let end = this.pending.indexOf("\n");
    while (end >= 0) {
      const line = this.pending.slice(0, end).replace(/\r$/, "");
      this.pending = this.pending.slice(end + 1);
      this.onLine(socket, line);
      end = this.pending.indexOf("\n");
    }
    // a line that never ends is not an observation: drop it instead of growing without limit
    if (this.pending.length > MAX_LINE) this.pending = "";
  }

  private onLine(socket: net.Socket, line: string): void {
    if (line.startsWith("* PING")) {
      socket.write("* PONG 60000\n");
      return;
    }
    const parsed = parseShdrLine(line);
    if (!parsed) return;
    const [timestampMs, key, value] = parsed;
    const item = FEEDABLE[key];
    if (!item) return;
    this.latest.set(key, { id: key, category: item.category, type: item.type, value: value === "" ? null : value, timestampMs });
  }
}
