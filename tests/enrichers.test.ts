// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - tests/enrichers.test.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// PartCount and Program from the job queue and the two conditions from the fault feed (src/enrichers.ts), through the real routes and checked
// against the official MTConnect 1.7 schemas. The sources are answered by a stand-in for each service on a real socket.
// =============================================================================
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { validateXML } from "xmllint-wasm";
import { buildApp } from "../src/server.js";
import { EnrichedReader, enrichersFromEnv, faultLevel, faultReadings, faultsEnricher, jobReadings, jobsEnricher, serverFaultsAsFeed, serverFaultsEnricher } from "../src/enrichers.js";
import type { MachineReader } from "../src/reader.js";
import { HydraServerMachineReader } from "../src/hydraServerReader.js";

const SCHEMA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../schemas/mtconnect-1.7");
const schema = (fileName: string) => ({ fileName, contents: readFileSync(path.join(SCHEMA_DIR, fileName), "utf-8") });
async function assertValid(xml: string, schemaFile: string): Promise<void> {
  const result = await validateXML({ xml: { fileName: "response.xml", contents: xml }, schema: schema(schemaFile), preload: [schema("xlink.xsd")] });
  if (!result.valid) throw new Error(`${schemaFile}: ${result.errors.map((e) => e.rawMessage).join("\n")}`);
}

const baseReader: MachineReader = {
  read: async () => [
    { id: "execution", category: "EVENT", type: "EXECUTION", value: "READY", timestampMs: Date.now() },
    { id: "avail", category: "EVENT", type: "AVAILABILITY", value: "AVAILABLE", timestampMs: Date.now() },
  ],
};

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A service on a real socket whose answer (and status) the test can change; it remembers the Authorization header it was asked with. */
async function service(initial: { status?: number; body: unknown }) {
  const state = { ...initial, authorization: undefined as string | undefined, paths: [] as string[] };
  const server = createServer((req, res) => {
    state.authorization = req.headers.authorization;
    state.paths.push(req.url ?? "");
    res.statusCode = state.status ?? 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(state.body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { state, url: `http://127.0.0.1:${(server.address() as any).port}` };
}

const JOBS = [
  { ID: "a", Status: "done", AssignedAtMs: 10 },
  { ID: "b", Status: "done", AssignedAtMs: 20 },
  { ID: "c", Status: "assigned", AssignedAtMs: 100 },
  { ID: "d", Status: "assigned", AssignedAtMs: 300 },
  { ID: "e", Status: "pending", AssignedAtMs: 0 },
];

describe("the job queue", () => {
  it("counts the finished jobs and names the program as the newest assigned job", () => {
    const readings = jobReadings(JOBS, 5);
    expect(readings).toEqual([
      { id: "part_count", category: "EVENT", type: "PART_COUNT", value: 2, timestampMs: 5 },
      { id: "program", category: "EVENT", type: "PROGRAM", value: "d", timestampMs: 5 },
    ]);
    // nothing assigned: there is no program, which is UNAVAILABLE and not an empty name
    expect(jobReadings([{ ID: "a", Status: "done" }], 5)[1].value).toBeNull();
    expect(() => jobReadings({ jobs: [] }, 5)).toThrow(/not a list/);
  });

  it("is served as PartCount and Program, declared in /probe, with the token of the dispatcher, and validates", async () => {
    const { url, state } = await service({ body: JOBS });
    const app = buildApp({ reader: baseReader, minPollIntervalMs: 0, enrichers: [jobsEnricher(url, "dispatcher-token-123")] });
    const probe = await request(app).get("/probe");
    expect(probe.text).toContain('type="PART_COUNT"');
    expect(probe.text).toContain('type="PROGRAM"');
    await assertValid(probe.text, "MTConnectDevices_1.7.xsd");
    const current = await request(app).get("/current");
    expect(current.text).toMatch(/<PartCount dataItemId="part_count"[^>]*>2<\/PartCount>/);
    expect(current.text).toMatch(/<Program dataItemId="program"[^>]*>d<\/Program>/);
    await assertValid(current.text, "MTConnectStreams_1.7.xsd");
    expect(state.authorization).toBe("Bearer dispatcher-token-123");
    expect(state.paths[0]).toBe("/jobs");
    // a job that ends moves the count on the next read
    state.body = [...JOBS.slice(0, 3), { ID: "d", Status: "done", AssignedAtMs: 300 }];
    const later = await request(app).get("/current");
    expect(later.text).toMatch(/<PartCount dataItemId="part_count"[^>]*>3<\/PartCount>/);
    expect(later.text).toMatch(/<Program dataItemId="program"[^>]*>c<\/Program>/);
  });

  it("turns only its own DataItems UNAVAILABLE when the dispatcher is down, and the rest of the device stays", async () => {
    const { url, state } = await service({ status: 503, body: {} });
    const app = buildApp({ reader: baseReader, minPollIntervalMs: 0, enrichers: [jobsEnricher(url)] });
    const current = await request(app).get("/current");
    expect(current.text).toMatch(/<PartCount dataItemId="part_count"[^>]*>UNAVAILABLE<\/PartCount>/);
    expect(current.text).toMatch(/<Execution dataItemId="execution"[^>]*>READY<\/Execution>/);
    expect(state.paths.length).toBeGreaterThan(0);
    await assertValid(current.text, "MTConnectStreams_1.7.xsd");
  });
});

describe("the fault feed", () => {
  const faults = (list: unknown[]) => ({ faults: list });

  it("maps the error codes to a level and lets the feed say it too", () => {
    for (const code of ["ESTOP_ACTIVE", "OUT_OF_RANGE", "TOOL_INCOMPATIBLE", "GRIP_LOST_SEAL", "estop_active"]) expect(faultLevel(code)).toBe("FAULT");
    for (const code of ["INVALID_STATE", "TIMEOUT", "UNSUPPORTED", "SOMETHING_NEW"]) expect(faultLevel(code)).toBe("WARNING");
    expect(faultLevel("TIMEOUT", "fault")).toBe("FAULT");
    expect(faultLevel("ESTOP_ACTIVE", "warning")).toBe("WARNING");
  });

  it("gives Normal with no fault, the worst and newest fault otherwise, and keeps the tool heads (URTC) on their own condition", () => {
    const none = faultReadings(faults([]), 1);
    expect(none.map((r) => [r.id, r.value])).toEqual([["mcu_condition", "normal"], ["urtc_condition", "normal"]]);
    const readings = faultReadings(
      faults([
        { component: "controller-1", error_code: "TIMEOUT", detail: "no answer", at_utc: "2026-01-01T00:00:10Z" },
        { component: "controller-1", error_code: "ESTOP_ACTIVE", detail: "button pressed", at_utc: "2026-01-01T00:00:05Z" },
        { component: "controller-2", error_code: "OUT_OF_RANGE", detail: "x too far", at_utc: "2026-01-01T00:00:20Z" },
        { component: "URTC-head-3", error_code: "TIMEOUT", detail: "no CAN reply", at_utc: "2026-01-01T00:00:01Z" },
        { component: "controller-1", error_code: "INVALID_STATE", detail: "gone", at_utc: "2026-01-01T00:00:30Z", active: false },
      ]),
      9,
    );
    const mcu = readings.find((r) => r.id === "mcu_condition")!;
    expect(mcu).toMatchObject({ value: "fault", nativeCode: "OUT_OF_RANGE" });
    expect(mcu.message).toContain("controller-2: x too far");
    expect(mcu.message).toContain("(+2 more)");
    const urtc = readings.find((r) => r.id === "urtc_condition")!;
    expect(urtc).toMatchObject({ value: "warning", nativeCode: "TIMEOUT" });
    expect(() => faultReadings({}, 1)).toThrow(/no faults list/);
  });

  it("is served as two conditions with the code and the message, follows the feed, and validates", async () => {
    const { url, state } = await service({ body: faults([{ component: "controller-1", error_code: "ESTOP_ACTIVE", detail: "button pressed" }]) });
    const app = buildApp({ reader: baseReader, minPollIntervalMs: 0, enrichers: [faultsEnricher(url, "faults-token-1234")] });
    let current = await request(app).get("/current");
    expect(current.text).toMatch(/<Fault dataItemId="mcu_condition"[^>]*type="SYSTEM" nativeCode="ESTOP_ACTIVE">controller-1: button pressed<\/Fault>/);
    expect(current.text).toMatch(/<Normal dataItemId="urtc_condition"/);
    await assertValid(current.text, "MTConnectStreams_1.7.xsd");
    expect(state.authorization).toBe("Bearer faults-token-1234");
    state.body = faults([]);
    current = await request(app).get("/current");
    expect(current.text).toMatch(/<Normal dataItemId="mcu_condition"/);
    state.status = 500;
    current = await request(app).get("/current");
    expect(current.text).toMatch(/<Unavailable dataItemId="mcu_condition"/);
    expect(current.text).toMatch(/<Unavailable dataItemId="urtc_condition"/);
  });

  it("also comes out as SHDR lines when the SHDR output is on, conditions with their code", async () => {
    const { formatShdrLine } = await import("../src/shdr.js");
    const [mcu] = faultReadings(faults([{ component: "c", error_code: "TIMEOUT", detail: "slow | link" }]), 0);
    const line = formatShdrLine({ sequence: 1, id: mcu.id, category: "CONDITION", type: "SYSTEM", value: "WARNING", timestampMs: 0, nativeCode: mcu.nativeCode, message: mcu.message });
    expect(line).toBe("1970-01-01T00:00:00.000Z|mcu_condition|WARNING|TIMEOUT|||c: slow \\| link");
  });
});

describe("the switches", () => {
  it("are off without an address: no extra DataItem and no request", async () => {
    expect(enrichersFromEnv({})).toHaveLength(0);
    const probe = await request(buildApp({ reader: baseReader, minPollIntervalMs: 0, enrichers: [] })).get("/probe");
    expect(probe.text).not.toContain("PART_COUNT");
    expect(probe.text).not.toContain('id="mcu_condition"');
  });

  it("read the addresses and tokens of the environment and refuse an address that is not http(s)", () => {
    const list = enrichersFromEnv({ HYDRA_UMC_MTCONNECT_JOBS_URL: "http://127.0.0.1:8090", HYDRA_UMC_MTCONNECT_FAULTS_URL: "https://x.example/faults" });
    expect(list.map((e) => e.items[0].id)).toEqual(["part_count", "mcu_condition"]);
    expect(() => enrichersFromEnv({ HYDRA_UMC_MTCONNECT_JOBS_URL: "ftp://x" })).toThrow(/http\(s\) URL/);
    expect(() => enrichersFromEnv({ HYDRA_UMC_MTCONNECT_FAULTS_URL: "not a url" })).toThrow(/http\(s\) URL/);
  });

  it("refuse to start with one Device per robot, which they do not serve", () => {
    expect(() => buildApp({ reader: baseReader, devicePerRobot: true, enrichers: [jobsEnricher("http://127.0.0.1:1")] })).toThrow(/single device/);
  });

  it("do not hide a base reader that is down: every DataItem is UNAVAILABLE, the feeds' too", async () => {
    const { url } = await service({ body: JOBS });
    const down: MachineReader = { read: async () => { throw new Error("down"); } };
    const reader = new EnrichedReader(down, [jobsEnricher(url)]);
    await expect(reader.read()).rejects.toThrow("down");
    const app = buildApp({ reader: down, minPollIntervalMs: 0, enrichers: [jobsEnricher(url)] });
    const current = await request(app).get("/current");
    expect(current.text).toMatch(/<PartCount dataItemId="part_count"[^>]*>UNAVAILABLE<\/PartCount>/);
  });
});

describe("the faults that HYDRA-UMC-SERVER keeps (GET /api/faults)", () => {
  const ACTIVE = {
    active: [
      { schema: "fault-event/1", source: "mcu", robotId: "1", code: "ESTOP_ACTIVE", severity: "critical", text: "stop", state: "raised", since: 1000 },
      { schema: "fault-event/1", source: "urtc-head", robotId: "1", code: "TEMP_HIGH", severity: "warning", text: "hot", state: "raised", since: 2000 },
      { schema: "fault-event/1", source: "mcu", robotId: null, code: "NOTE", severity: "info", text: "fyi", state: "raised", since: 3000 },
    ],
  };

  it("maps the severity to a level, leaves out what is only information and sends a tool-head source to its own condition", () => {
    const feed = serverFaultsAsFeed(ACTIVE);
    expect(feed.faults).toHaveLength(2);
    const readings = faultReadings(feed, 5);
    expect(readings.find((r) => r.id === "mcu_condition")).toMatchObject({ value: "fault", nativeCode: "ESTOP_ACTIVE" });
    expect(readings.find((r) => r.id === "urtc_condition")).toMatchObject({ value: "warning", nativeCode: "TEMP_HIGH" });
    expect(faultReadings(serverFaultsAsFeed({ active: [] }), 5).map((r) => r.value)).toEqual(["normal", "normal"]);
    expect(() => serverFaultsAsFeed({})).toThrow(/no list of active faults/);
  });

  it("reads the route with the identity of the adapter and turns the conditions UNAVAILABLE when the server refuses", async () => {
    const { url, state } = await service({ body: ACTIVE });
    const enricher = serverFaultsEnricher(new HydraServerMachineReader({ baseUrl: url, token: "tok" }));
    const readings = await enricher.read();
    expect(state.paths).toEqual(["/api/faults?active=1"]);
    expect(state.authorization).toBe("Bearer tok");
    expect(readings.find((r) => r.id === "mcu_condition")?.value).toBe("fault");
    state.status = 401;
    const app = buildApp({ reader: baseReader, minPollIntervalMs: 0, enrichers: [enricher] });
    const current = await request(app).get("/current");
    expect(current.text).toContain("Unavailable");
  });

  it("is off unless the switch is 1, and needs the address of the server", () => {
    expect(enrichersFromEnv({ HYDRA_UMC_SERVER_URL: "http://127.0.0.1:3000" })).toHaveLength(0);
    expect(enrichersFromEnv({ HYDRA_UMC_MTCONNECT_SERVER_FAULTS: "1", HYDRA_UMC_SERVER_URL: "http://127.0.0.1:3000", HYDRA_UMC_SERVER_TOKEN: "t" })).toHaveLength(1);
    expect(() => enrichersFromEnv({ HYDRA_UMC_MTCONNECT_SERVER_FAULTS: "1" })).toThrow(/needs HYDRA_UMC_SERVER_URL/);
    expect(() => enrichersFromEnv({ HYDRA_UMC_MTCONNECT_SERVER_FAULTS: "1", HYDRA_UMC_SERVER_URL: "http://x.example", HYDRA_UMC_MTCONNECT_FAULTS_URL: "http://y.example/f" })).toThrow(/set only one/);
  });
});
