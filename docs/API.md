# HTTP API Reference

Real Express server implemented in
[`src/server.ts`](../src/server.ts). In MTConnect terms this process is an
**agent**: it serves the three read-only requests every MTConnect client
expects (`/probe`, `/current`, `/sample`) over HTTP, with MTConnect 1.7
documents. It does not speak SHDR (the TCP protocol an adapter uses to feed an
agent), so a stock `cppagent` cannot use it as an adapter. No XML library: the
documents are built by hand, since the payload shape is fixed and small. Every
response is validated against the official MTConnect 1.7 schemas in
`tests/xsd-validation.test.ts`.

Listens on `0.0.0.0:5000` by default (`PORT` and `HYDRA_UMC_MTCONNECT_HOST` env vars to override; a `PORT` or interval setting that is not a valid number stops the start instead of being replaced by a default). No authentication on its own routes - this mirrors how real MTConnect agents are deployed on a factory LAN. (The adapter itself authenticates *to* HYDRA-UMC-SERVER: see below.)

All endpoints share one `Header` block (`creationTime`, `instanceId`, `bufferSize`, ...). `instanceId` is fixed per process; the Streams header also carries the sequence range the agent really holds.

---

## `GET /probe`

The static device model: the agent itself (the schema models it as a device of its own, with an `agent_avail` DataItem) and the HydraNodes with the `DataItem`s each one exposes. **Currently exactly one HydraNode** (`hydra_umc_1`); a deployment that monitors several robots would generate one device per robot from HYDRA-UMC-SERVER's roster, which is not done yet.

**Response** - `200`, `Content-Type: application/xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MTConnectDevices xmlns="urn:mtconnect.org:MTConnectDevices:1.7">
  <Header creationTime="2000-01-01T00:00:00.000Z" sender="HYDRA-UMC-MTCONNECT-ADAPTER" instanceId="1234567890" version="X.Y.Z" bufferSize="10000" deviceModelChangeTime="2000-01-01T00:00:00.000Z" assetBufferSize="1" assetCount="0"/>
  <Devices>
    <Agent id="agent" name="Agent" uuid="hydra-umc-mtconnect-adapter">
      <Description manufacturer="JuanenRac (Electro Hobby 3D)">HYDRA-UMC-MTCONNECT-ADAPTER process</Description>
      <DataItems>
        <DataItem id="agent_avail" category="EVENT" type="AVAILABILITY"/>
      </DataItems>
    </Agent>
    <Device id="hydra_umc_1" name="HydraNode_1" uuid="hydra-umc-node-1">
      <Description manufacturer="JuanenRac (Electro Hobby 3D)">HYDRA-UMC multi-robot micro-factory cell</Description>
      <DataItems>
        <DataItem id="execution" category="EVENT" type="EXECUTION"/>
        <DataItem id="avail" category="EVENT" type="AVAILABILITY"/>
        <DataItem id="spindle_temp" category="SAMPLE" type="TEMPERATURE" units="CELSIUS" nativeUnits="FAHRENHEIT"/>
      </DataItems>
    </Device>
  </Devices>
</MTConnectDevices>
```

`Header@version` is the version of this agent (the package version).

---

## Where the data comes from

[`src/reader.ts`](../src/reader.ts)'s `CachedReader` polls the configured `MachineReader` at most once every `POLL_INTERVAL_MS` (default `1000`; `0` reads on every request). [`src/dataitem.ts`](../src/dataitem.ts) converts a numeric value's native unit to the MTConnect one ([`src/units.ts`](../src/units.ts)) and classifies its quality; a string EVENT value passes through. A value that is missing, not a number, of an unknown unit, or older than `MAX_SAMPLE_AGE_MS` (when set) is reported as MTConnect's own `UNAVAILABLE` value. The reason (no data, unit conversion, source down, stale) is not part of the document: the schema has no attribute for it.

Three sources exist (see [`.env.example`](../.env.example)):

- **No source configured** (the default): nothing is known about any machine, so **every DataItem is `UNAVAILABLE`**. A deployment that is not connected to a HYDRA-UMC-SERVER never presents a machine as available.
- **`HYDRA_UMC_MTCONNECT_DEMO=1`**: a synthetic `FixtureMachineReader` (`execution: READY`, `avail: AVAILABLE`, `spindle_temp: 140 F`) for a demonstration. The device's description says `DEMONSTRATION DATA` and its `uuid` is `hydra-umc-node-demo`, so the data cannot be mistaken for a machine.
- **`HydraServerMachineReader`** ([`src/hydraServerReader.ts`](../src/hydraServerReader.ts), `HYDRA_UMC_SERVER_URL` set): polls a live HYDRA-UMC-SERVER's `GET /api/settings` and derives `avail`/`execution` from one robot's state (`HYDRA_UMC_ROBOT_ID`, default: the first robot in the roster):
  - HYDRA-UMC-SERVER only answers `GET /api/settings` to a logged-in account, so the reader needs a credential: `HYDRA_UMC_SERVER_TOKEN` (a token the server already issued), or `HYDRA_UMC_SERVER_USER` + `HYDRA_UMC_SERVER_PASSWORD` (it logs in with `POST /api/login`, and logs in again once when the session is refused with 401/403). With none, or with a refused one, the read fails and every DataItem is `UNAVAILABLE`. A response larger than 4 MiB is refused (counted in bytes as it arrives).
  - `avail` is `AVAILABLE` when the robot's `online` flag is true. That flag is the one HYDRA-UMC-SERVER keeps for the robot and the operator interface toggles: it says the robot is enabled there, not that its controller answered.
  - `execution` is `UNAVAILABLE` while the robot is not available; otherwise it is derived from the robot's `playbackState`: playing+paused -> `INTERRUPTED`; playing -> `ACTIVE`; finished -> `STOPPED`; otherwise `READY`.
  - `spindle_temp` is `UNAVAILABLE`: nothing in HYDRA-UMC-SERVER's robot shape corresponds to a temperature sensor yet.
  - A robot that cannot be found in the roster, or the server being unreachable, both make every DataItem `UNAVAILABLE`.

---

## The observation buffer

Every change of a DataItem is an **observation** with its own, unique, increasing `sequence` number. A DataItem gets a new observation only when its value changed (a repeated value is not a new observation). The agent keeps the newest `MTCONNECT_BUFFER_SIZE` observations (default `10000`; the same number is `bufferSize` in the headers) and reports the range it really holds in the Streams header: `firstSequence` (oldest held), `lastSequence` (newest), `nextSequence` (`lastSequence + 1`: what to pass as `from` to receive only what is new).

When the process starts, every DataItem has an `UNAVAILABLE` observation (and `agent_avail` an `AVAILABLE` one), as an MTConnect agent reports before its first data; so the buffer is never empty and a client never meets a DataItem without an observation.

---

## `GET /current`

The newest observation of every DataItem, grouped in a `DeviceStream` for the agent and one for the HydraNode.

**Response** - `200`, `Content-Type: application/xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MTConnectStreams xmlns="urn:mtconnect.org:MTConnectStreams:1.7">
  <Header creationTime="2000-01-01T00:00:00.000Z" sender="HYDRA-UMC-MTCONNECT-ADAPTER" instanceId="1234567890" version="X.Y.Z" bufferSize="10000" deviceModelChangeTime="2000-01-01T00:00:00.000Z" nextSequence="8" firstSequence="1" lastSequence="7"/>
  <Streams>
    <DeviceStream name="Agent" uuid="hydra-umc-mtconnect-adapter">
      <ComponentStream componentId="agent" component="Device" name="Agent">
        <Events>
          <Availability dataItemId="agent_avail" timestamp="2000-01-01T00:00:00.000Z" sequence="1">AVAILABLE</Availability>
        </Events>
      </ComponentStream>
    </DeviceStream>
    <DeviceStream name="HydraNode_1" uuid="hydra-umc-node-1">
      <ComponentStream componentId="hydra_umc_1" component="Device" name="HydraNode_1">
        <Events>
          <Availability dataItemId="avail" timestamp="2000-01-01T00:00:05.000Z" sequence="5">AVAILABLE</Availability>
          <Execution dataItemId="execution" timestamp="2000-01-01T00:00:05.000Z" sequence="6">READY</Execution>
        </Events>
        <Samples>
          <Temperature dataItemId="spindle_temp" timestamp="2000-01-01T00:00:06.000Z" sequence="7">UNAVAILABLE</Temperature>
        </Samples>
      </ComponentStream>
    </DeviceStream>
  </Streams>
</MTConnectStreams>
```

(`units` is declared once in `/probe`; a stream value never repeats it.) A source that is down makes every DataItem `UNAVAILABLE` and the response stays a `200`.

---

## `GET /sample?from=<sequence>&count=<n>`

The observations with `sequence >= from` (`from` is **inclusive**), in sequence order, at most `count` (default `100`, at most `1000`). A client that continues from the `nextSequence` of its previous answer receives every change exactly once:

```text
GET /current                 -> nextSequence="8"
GET /sample?from=8           -> the observations 8, 9, 10 ... nextSequence="11"
GET /sample?from=11          -> (nothing new yet) empty Streams, nextSequence="11"
```

- **`from` omitted**: starts at `firstSequence`.
- **`from` equal to `nextSequence`**: a valid, empty `<Streams/>`: nothing new has happened.
- **`from` below `firstSequence`** (older than the buffer holds, or `0`) or **above `nextSequence`** (a sequence this agent has not produced, for example a cursor from a previous instance): an `OUT_OF_RANGE` error, never a silent mix of old and new data. A restart changes `instanceId` and starts the sequence again.
- **`count` above the maximum**: `OUT_OF_RANGE`.
- **A malformed `from` or `count`** (not a non-negative / positive integer): `INVALID_REQUEST`.

**Response (data)** - the same `MTConnectStreams` shape `/current` uses, with only the `DeviceStream`s that have observations in the range (none, when empty). Its `nextSequence` is the sequence right after the last observation returned, so a client that asked for `count` observations continues where the page ended.

**Response (error)** - `200` (errors are signalled by the XML root element, like every other response here, not by the HTTP status), `Content-Type: application/xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MTConnectError xmlns="urn:mtconnect.org:MTConnectError:1.7">
  <Header creationTime="2000-01-01T00:00:00.000Z" sender="HYDRA-UMC-MTCONNECT-ADAPTER" instanceId="1234567890" version="X.Y.Z" bufferSize="10000"/>
  <Errors>
    <Error errorCode="OUT_OF_RANGE">requested sequence 0 is older than this agent's retained buffer (firstSequence=1, instanceId=1234567890) - resynchronize from firstSequence</Error>
  </Errors>
</MTConnectError>
```

---

## Errors

`GET /sample` reports its protocol-level errors as an `MTConnectError` document (see above) - `OUT_OF_RANGE` and `INVALID_REQUEST`. Any other path (not `/probe`, `/current` or `/sample`) returns Express's default `404`. The response never announces the framework (`X-Powered-By` is off).
