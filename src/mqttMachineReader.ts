// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - The execution state of a bridge, read from the MQTT broker: src/mqttMachineReader.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// With HYDRA_UMC_MTCONNECT_MQTT_SOURCE=host:port (off by default; used only when neither HYDRA_UMC_SERVER_URL nor HYDRA_UMC_MTCONNECT_SHDR_SOURCE is set) the machine
// source is the broker: the adapter follows one topic, by default `hydra/bridges/printer3d/execution`, that HYDRA-UMC-BRIDGE-PRINTER3D publishes with
//   {"execution": "ACTIVE", "state": "RUNNING", "observed_at": <ms>}
// and reports the `execution` DataItem from it, and `avail` as AVAILABLE while a fresh value exists. A message that is not that, or whose execution is not one of
// the values of the MTConnect standard, is dropped. When nothing has arrived, or the last value is older than HYDRA_UMC_MTCONNECT_MQTT_STALE_MS (default 30000),
// every DataItem is UNAVAILABLE (SOURCE_UNAVAILABLE). The adapter only subscribes: it never publishes to the broker.
// =============================================================================
import fs from "node:fs";
import type { RawReading } from "./dataitem.js";
import { subscribe, type MqttOptions, type MqttSubscriber } from "./mqttClient.js";
import { SourceUnavailableError, type MachineReader } from "./reader.js";

export const DEFAULT_EXECUTION_TOPIC = "hydra/bridges/printer3d/execution";
export const DEFAULT_STALE_MS = 30_000;
const MAX_PAYLOAD = 1024;

/** The Execution values of the MTConnect standard. */
export const EXECUTION_VALUES: ReadonlySet<string> = new Set([
  "READY",
  "ACTIVE",
  "INTERRUPTED",
  "FEED_HOLD",
  "STOPPED",
  "OPTIONAL_STOP",
  "PROGRAM_STOPPED",
  "PROGRAM_COMPLETED",
  "UNAVAILABLE",
]);

export interface ExecutionMessage {
  execution: string;
  /** When the bridge read the printer, in milliseconds since the epoch, or null when the message does not say. */
  observedAtMs: number | null;
}

/** The execution in a message of the bridge, or null for anything that is not one. */
export function parseExecutionMessage(payload: Buffer): ExecutionMessage | null {
  if (payload.length === 0 || payload.length > MAX_PAYLOAD) return null;
  let body: unknown;
  try {
    body = JSON.parse(payload.toString("utf8"));
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { execution, observed_at: observed } = body as { execution?: unknown; observed_at?: unknown };
  if (typeof execution !== "string" || !EXECUTION_VALUES.has(execution)) return null;
  return { execution, observedAtMs: typeof observed === "number" && Number.isFinite(observed) && observed > 0 ? observed : null };
}

export interface MqttMachineReaderOptions {
  host: string;
  port: number;
  topic?: string;
  username?: string;
  password?: string;
  staleMs?: number;
  now?: () => number;
  /** For the tests. */
  subscribeFn?: typeof subscribe;
}

export class MqttMachineReader implements MachineReader {
  private subscription: MqttSubscriber | null = null;
  private last: { execution: string; atMs: number } | null = null;
  private readonly topic: string;
  private readonly staleMs: number;
  private readonly now: () => number;

  constructor(private readonly options: MqttMachineReaderOptions) {
    this.topic = options.topic ?? DEFAULT_EXECUTION_TOPIC;
    this.staleMs = options.staleMs ?? DEFAULT_STALE_MS;
    this.now = options.now ?? Date.now;
  }

  private start(): void {
    if (this.subscription) return;
    const options: MqttOptions = {
      host: this.options.host,
      port: this.options.port,
      clientId: `hydra-mtconnect-${process.pid}-${Math.floor(Math.random() * 1e6)}`,
      ...(this.options.username !== undefined ? { username: this.options.username } : {}),
      ...(this.options.password !== undefined ? { password: this.options.password } : {}),
    };
    this.subscription = (this.options.subscribeFn ?? subscribe)(
      options,
      [this.topic],
      (topic, payload) => {
        if (topic !== this.topic) return;
        const message = parseExecutionMessage(payload);
        if (message === null) return;
        // the time the bridge read the printer when it says so (a retained old value must not look fresh), else the time it arrived
        this.last = { execution: message.execution, atMs: message.observedAtMs ?? this.now() };
      },
      (connected) => {
        // what a lost connection last said is no longer a live value
        if (!connected) this.last = null;
      },
    );
  }

  async read(): Promise<RawReading[]> {
    this.start();
    if (this.last === null) throw new SourceUnavailableError("the bridge has not published an execution state yet");
    const age = this.now() - this.last.atMs;
    if (age > this.staleMs) throw new SourceUnavailableError(`the last execution state is ${Math.round(age / 1000)} s old`);
    const timestampMs = this.last.atMs;
    return [
      { id: "execution", category: "EVENT", type: "EXECUTION", value: this.last.execution, timestampMs },
      { id: "avail", category: "EVENT", type: "AVAILABILITY", value: "AVAILABLE", timestampMs },
    ];
  }

  close(): void {
    this.subscription?.stop();
    this.subscription = null;
    this.last = null;
  }
}

/** The settings from the environment, or null while HYDRA_UMC_MTCONNECT_MQTT_SOURCE is not set. The password is read from the file named by HYDRA_UMC_MTCONNECT_MQTT_PASSWORD_FILE. */
export function mqttReaderOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  parseSource: (text: string) => { host: string; port: number } | null,
  readFile: (path: string) => string = (p) => fs.readFileSync(p, "utf8"),
): MqttMachineReaderOptions | null {
  const source = (env.HYDRA_UMC_MTCONNECT_MQTT_SOURCE ?? "").trim();
  if (!source) return null;
  const parsed = parseSource(source);
  if (!parsed) throw new Error(`HYDRA-UMC-MTCONNECT-ADAPTER: HYDRA_UMC_MTCONNECT_MQTT_SOURCE must be host:port or a port, got ${source}`);
  const topic = (env.HYDRA_UMC_MTCONNECT_MQTT_TOPIC ?? "").trim() || DEFAULT_EXECUTION_TOPIC;
  if (/[#+]/.test(topic) || topic.length > 256) throw new Error("HYDRA-UMC-MTCONNECT-ADAPTER: HYDRA_UMC_MTCONNECT_MQTT_TOPIC must name one topic, with no wildcard");
  const staleRaw = (env.HYDRA_UMC_MTCONNECT_MQTT_STALE_MS ?? "").trim();
  const staleMs = staleRaw === "" ? DEFAULT_STALE_MS : Number(staleRaw);
  if (!Number.isInteger(staleMs) || staleMs < 1000 || staleMs > 3_600_000) throw new Error("HYDRA-UMC-MTCONNECT-ADAPTER: HYDRA_UMC_MTCONNECT_MQTT_STALE_MS must be a whole number from 1000 to 3600000");
  const username = (env.HYDRA_UMC_MTCONNECT_MQTT_USERNAME ?? "").trim();
  const passwordFile = (env.HYDRA_UMC_MTCONNECT_MQTT_PASSWORD_FILE ?? "").trim();
  if (passwordFile && !username) throw new Error("HYDRA-UMC-MTCONNECT-ADAPTER: HYDRA_UMC_MTCONNECT_MQTT_PASSWORD_FILE needs HYDRA_UMC_MTCONNECT_MQTT_USERNAME");
  return {
    ...parsed,
    topic,
    staleMs,
    ...(username ? { username } : {}),
    ...(passwordFile ? { password: readFile(passwordFile).trim() } : {}),
  };
}
