// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/mqttMachineReader.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
// =============================================================================
import { afterEach, describe, expect, it } from "vitest";
import { startFakeBroker, type FakeBroker } from "./fakeBroker.js";
import { DEFAULT_EXECUTION_TOPIC, MqttMachineReader, mqttReaderOptionsFromEnv, parseExecutionMessage } from "../src/mqttMachineReader.js";
import { SourceUnavailableError } from "../src/reader.js";
import { parseShdrSource } from "../src/shdrReader.js";

const message = (body: unknown) => Buffer.from(typeof body === "string" ? body : JSON.stringify(body));

describe("parseExecutionMessage", () => {
  it("accepts the message of the bridge", () => {
    expect(parseExecutionMessage(message({ execution: "ACTIVE", state: "RUNNING", observed_at: 1700000000000 }))).toEqual({ execution: "ACTIVE", observedAtMs: 1700000000000 });
    expect(parseExecutionMessage(message({ execution: "READY" }))).toEqual({ execution: "READY", observedAtMs: null });
  });
  it("drops anything else", () => {
    for (const bad of ["", "not json", "[1]", "null", { execution: "RUNNING" }, { execution: 1 }, { state: "IDLE" }]) {
      expect(parseExecutionMessage(message(bad))).toBeNull();
    }
    expect(parseExecutionMessage(Buffer.alloc(2000, 0x20))).toBeNull();
  });
});

describe("MqttMachineReader", () => {
  let broker: FakeBroker | null = null;
  afterEach(async () => {
    await broker?.close();
    broker = null;
  });

  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 100; i++) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("timed out");
  };

  it("is unavailable until the bridge has published", async () => {
    broker = await startFakeBroker();
    const reader = new MqttMachineReader({ host: "127.0.0.1", port: broker.port });
    await expect(reader.read()).rejects.toBeInstanceOf(SourceUnavailableError);
    reader.close();
  });

  it("reports the execution of the broker and subscribes to one topic only", async () => {
    broker = await startFakeBroker();
    const reader = new MqttMachineReader({ host: "127.0.0.1", port: broker.port });
    await reader.read().catch(() => undefined);
    await waitFor(async () => broker!.filters.length > 0);
    expect(broker.filters).toEqual([DEFAULT_EXECUTION_TOPIC]);
    broker.publish(DEFAULT_EXECUTION_TOPIC, message({ execution: "INTERRUPTED", state: "HOLDING", observed_at: Date.now() }));
    let readings: Awaited<ReturnType<typeof reader.read>> = [];
    await waitFor(async () => {
      try {
        readings = await reader.read();
        return true;
      } catch {
        return false;
      }
    });
    expect(readings.find((r) => r.id === "execution")?.value).toBe("INTERRUPTED");
    expect(readings.find((r) => r.id === "avail")?.value).toBe("AVAILABLE");
    reader.close();
  });

  it("ignores a message that is not an execution and another topic", async () => {
    broker = await startFakeBroker();
    const reader = new MqttMachineReader({ host: "127.0.0.1", port: broker.port });
    await reader.read().catch(() => undefined);
    await waitFor(async () => broker!.filters.length > 0);
    broker.publish(DEFAULT_EXECUTION_TOPIC, message({ execution: "NONSENSE" }));
    broker.publish("hydra/bridges/other/execution", message({ execution: "ACTIVE", observed_at: Date.now() }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    await expect(reader.read()).rejects.toBeInstanceOf(SourceUnavailableError);
    reader.close();
  });

  it("goes unavailable when the last value is older than the window", async () => {
    broker = await startFakeBroker();
    let now = 1_000_000;
    const reader = new MqttMachineReader({ host: "127.0.0.1", port: broker.port, staleMs: 5000, now: () => now });
    await reader.read().catch(() => undefined);
    await waitFor(async () => broker!.filters.length > 0);
    broker.publish(DEFAULT_EXECUTION_TOPIC, message({ execution: "ACTIVE", observed_at: now }));
    await waitFor(async () => {
      try {
        await reader.read();
        return true;
      } catch {
        return false;
      }
    });
    now += 6000;
    await expect(reader.read()).rejects.toThrow(/old/);
    reader.close();
  });

  it("does not believe a retained old value: the time in the message counts", async () => {
    broker = await startFakeBroker();
    const reader = new MqttMachineReader({ host: "127.0.0.1", port: broker.port, staleMs: 5000 });
    await reader.read().catch(() => undefined);
    await waitFor(async () => broker!.filters.length > 0);
    broker.publish(DEFAULT_EXECUTION_TOPIC, message({ execution: "ACTIVE", observed_at: Date.now() - 3_600_000 }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    await expect(reader.read()).rejects.toBeInstanceOf(SourceUnavailableError);
    reader.close();
  });
});

describe("mqttReaderOptionsFromEnv", () => {
  const options = (env: Record<string, string>, files: Record<string, string> = {}) => mqttReaderOptionsFromEnv(env, parseShdrSource, (p) => files[p] ?? "");

  it("is off unless the source is set", () => {
    expect(options({})).toBeNull();
    expect(options({ HYDRA_UMC_MTCONNECT_MQTT_SOURCE: "  " })).toBeNull();
  });
  it("reads host, port, topic and window", () => {
    expect(options({ HYDRA_UMC_MTCONNECT_MQTT_SOURCE: "broker:1884", HYDRA_UMC_MTCONNECT_MQTT_TOPIC: "hydra/bridges/p2/execution", HYDRA_UMC_MTCONNECT_MQTT_STALE_MS: "9000" })).toEqual({
      host: "broker",
      port: 1884,
      topic: "hydra/bridges/p2/execution",
      staleMs: 9000,
    });
    expect(options({ HYDRA_UMC_MTCONNECT_MQTT_SOURCE: "1883" })).toMatchObject({ host: "127.0.0.1", port: 1883, topic: DEFAULT_EXECUTION_TOPIC, staleMs: 30000 });
  });
  it("reads the password from a file and refuses a wrong setting", () => {
    expect(options({ HYDRA_UMC_MTCONNECT_MQTT_SOURCE: "1883", HYDRA_UMC_MTCONNECT_MQTT_USERNAME: "adapter", HYDRA_UMC_MTCONNECT_MQTT_PASSWORD_FILE: "/pw" }, { "/pw": " secret-value \n" })).toMatchObject({ username: "adapter", password: "secret-value" });
    expect(() => options({ HYDRA_UMC_MTCONNECT_MQTT_SOURCE: "1883", HYDRA_UMC_MTCONNECT_MQTT_PASSWORD_FILE: "/pw" })).toThrow(/USERNAME/);
    expect(() => options({ HYDRA_UMC_MTCONNECT_MQTT_SOURCE: "not a source" })).toThrow(/host:port/);
    expect(() => options({ HYDRA_UMC_MTCONNECT_MQTT_SOURCE: "1883", HYDRA_UMC_MTCONNECT_MQTT_TOPIC: "hydra/#" })).toThrow(/wildcard/);
    expect(() => options({ HYDRA_UMC_MTCONNECT_MQTT_SOURCE: "1883", HYDRA_UMC_MTCONNECT_MQTT_STALE_MS: "10" })).toThrow(/STALE_MS/);
  });
});
