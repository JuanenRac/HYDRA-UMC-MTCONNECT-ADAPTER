# Changelog

All notable changes to this project are documented here.

## [Unreleased]

- A `CONDITION` DataItem is now rendered (`Normal`, `Warning`, `Fault` or `Unavailable`, with the message and the native code) and declared in `/probe` when the device has one, instead of being dropped without a word; the output is checked against the official schema.
- The device declares `ASSET_CHANGED` and `ASSET_REMOVED`, which MTConnect asks of every Device since 1.2; they stay `UNAVAILABLE` because the device has no assets.
- `/HydraNode_1/probe`, `/current` and `/sample` (by name or uuid) answer for one device; another name is a `NO_DEVICE` error.
- `HYDRA_UMC_MTCONNECT_HTTP_ERRORS=1` answers an MTConnectError with HTTP 400 or 404 instead of 200; off by default.
- All XML is written through one helper that escapes every attribute and text and drops characters XML cannot carry.
- The READMEs say that the documents follow version 1.7 and that the device reports execution, availability and spindle temperature (not tool positions), and count 115 tests.
- Building no longer changes the version; raising it is the explicit `bump` command (`python tools/hydra_project_tool.py bump`). The build scripts only report the version they built, and CI fails if a build script runs a bump.
- The banner follows the animated style of the ecosystem banners, with the name, the kind and the technologies of the project.
- Added `tools/hydra_project_tool.py`: the same `validate`, `test`, `version`, `status` and `bump` commands in every repository. The checks run with `HYDRA_UMC_CI=1` and fail if the version changes; only `bump` changes it.

## [0.1.8]

- Maturity is functional: nothing here has been verified on real hardware yet.
- The READMEs say, in the eight languages, what is planned and what has only been tested against fakes, emulators or fixtures, and carry a short safety and security status note.

## [0.1.7]

- Build version synchronized with `hydra-umc.project.json` and the repository-native version source.
- The licence is written as GPL-3.0-or-later in every header and in the package metadata.

## [0.1.6] - A real observation buffer, valid documents on every path, no invented machine

- **`GET /sample` now works for a client.** It used to compare the `from` of a client with the sequence of a buffer that moved on every read, so a client that continued from the `nextSequence` of its last answer never received a single observation. The agent now keeps a real buffer: every change of a DataItem is an observation with its own, unique, increasing sequence number (a repeated value is not a new observation), `from` is inclusive, `count` pages the answer (default 100, at most 1000), `from` older than the buffer or beyond `nextSequence` is `OUT_OF_RANGE`, and the headers report the range the buffer really holds and its real `bufferSize` (`MTCONNECT_BUFFER_SIZE`, default 10000). A test runs the loop every MTConnect client runs (`/current`, then `/sample?from=<nextSequence>`) and checks that each change arrives exactly once.
- **Every response validates against the official 1.7 schema.** The documents for a source that is down, a reading with no value, a stale reading, an empty `/sample` and a robot read from HYDRA-UMC-SERVER used to break it (an `errorCode` attribute the schema does not have, sequence numbers of 0, empty `Events`/`Samples`). The `errorCode` attribute is gone (the reason a DataItem is `UNAVAILABLE` is not part of the document), sequences start at 1, empty groups are left out, and the agent is reported in its own `DeviceStream` (`agent_avail` was declared in `/probe` but never observed). Tests validate all of these paths against the schema.
- **No invented machine.** Without `HYDRA_UMC_SERVER_URL` the agent served a machine that was `AVAILABLE`, `READY` and at 60 degrees, indistinguishable from a real one. Now every DataItem is `UNAVAILABLE`; the synthetic values are served only with `HYDRA_UMC_MTCONNECT_DEMO=1`, and then the device description says `DEMONSTRATION DATA` and its uuid is different.
- A robot that is not available no longer reports its execution state (`execution` is `UNAVAILABLE` while `avail` is).
- `PORT`, `POLL_INTERVAL_MS`, `MAX_SAMPLE_AGE_MS` and `MTCONNECT_BUFFER_SIZE` that are set but not valid stop the start instead of being replaced by a default (`POLL_INTERVAL_MS=0` now means "read on every request"); the response of HYDRA-UMC-SERVER is counted in bytes as it arrives; the agent closes on `SIGTERM`/`SIGINT`; `X-Powered-By` is off; the version is read once and also found when the process starts from another directory; the tests are type-checked.
- **Container:** the image runs as an unprivileged user, checks its own `/probe`, installs from the lockfile and builds on Node 24.
- Documentation: `docs/API.md` is rewritten (valid examples, the buffer, the sources), and the README no longer claims a build that bumps the version. 100 tests.

## [0.1.5] - Credentials for the live machine source, bounded responses

- **The live machine source could never read a real Server:** `HydraServerMachineReader` asked `GET /api/settings` with no credential, but HYDRA-UMC-SERVER only answers that route to a logged-in account, so against a real Server `/current` always reported `SOURCE_UNAVAILABLE` (the tests only ever used a fake server with no login). The reader now takes `HYDRA_UMC_SERVER_TOKEN`, or `HYDRA_UMC_SERVER_USER` and `HYDRA_UMC_SERVER_PASSWORD` (it logs in with `POST /api/login` and logs in again, once, when the session is refused with 401/403, so a long-running adapter survives the expiry of its session). Checked end to end against a real HYDRA-UMC-SERVER process: without a credential the source was unavailable, with an account `/current` reported the robot as `AVAILABLE`/`ACTIVE`.
- **Bounded responses:** a response from the Server larger than 4 MiB is refused instead of being read whole into memory.
- **Listen address:** `HYDRA_UMC_MTCONNECT_HOST` narrows the address the HTTP server listens on (default `0.0.0.0`, unchanged), for example to `127.0.0.1` behind a local reverse proxy.
- **Tests:** 7 new tests cover a guarded fake Server (no credential, token, wrong token, login and session reuse, login again after expiry, a refused login, the size cap), 75 in total. `.env.example` and `docs/API.md` document the new variables.
- **Docs:** a README in Portuguese (`README_por.md`) joins the other translations, and the test count in the README is corrected.

## [0.1.4] - Stale readings are never shown as live

- New `STALE` error code and `markStale()`: a good reading whose own timestamp is older
  than the allowed age is rendered UNAVAILABLE / STALE instead of as a live value. The age
  comes from `maxSampleAgeMs` (option) or `MAX_SAMPLE_AGE_MS`; unset or 0 keeps the previous
  behaviour. Applied to both /current and /sample. Five new tests, unit and through the HTTP
  route.

## [0.1.3]

- Added real XSD schema validation: every endpoint's generated XML is now checked against the official, vendored MTConnect 1.7 schemas (`schemas/mtconnect-1.7/`, Apache-2.0) using `xmllint-wasm` (a devDependency only, never shipped in the built adapter).
- Fixed several real spec-compliance gaps that validation caught: the Devices document now includes the required `Agent` device alongside the `HydraNode`, `ComponentStream` now carries its required `componentId`, stream sample values no longer repeat the `units` attribute (a DataItem-definition-only attribute), the `Header` element now uses the correct shape per document type (Devices/Streams vs. Error), and `CELSIUS`/`REVOLUTION/MINUTE` replace the previously invalid `DEGREE_CELSIUS`/`REVOLUTION_PER_MINUTE` unit strings.

## [0.1.2]

- Build version synchronized with `hydra-umc.project.json` and the repository-native version source.

## [0.1.1] - concurrent reads could race, letting a slower-but-earlier read overwrite a fresher one

`CachedReader.getReadings()` checked the cache-expiry condition, then
`await`ed `this.reader.read()` - two concurrent callers that both saw the
cache as expired each started their own independent real read. Whichever
resolved LAST won the `cachedReadings`/`lastReadAtMs`/`sequence` write,
even if it was the one that started EARLIER (real network/device jitter
routinely reorders completion vs. start order) - overwriting a fresher
result a second, later-started read had already written, and defeating
`minPollIntervalMs`'s whole point (never more than one real read in
flight) via the race itself. Fixed: concurrent callers now share one
`inFlight` promise instead of each starting their own read. 2 new
regression tests (57/57 total).

## [0.1.0] - real sequence numbers, and a new GET /sample honoring MTConnect's own OUT_OF_RANGE contract

`sequence` on every DataItem, and `nextSequence`/`firstSequence`/`lastSequence`
in every response's own Header, were hardcoded to the literal `"1"`
regardless of how many times this process had actually polled its
source - no consumer could ever detect a gap, a restart, or "what's
actually new" from them.

New `CachedReader.sequence` (`src/reader.ts`) is a real, monotonic
counter - advances by exactly 1 for each real, distinct batch of
readings actually fetched from the source (never on a cache hit, never
on a failed read). `server.ts`'s own `bufferBounds()` derives
`firstSequence`/`lastSequence` from it for every response
(`/probe`/`/current`/the new `/sample`); `firstSequence` is pinned to
`1` the moment a first real read ever succeeds (never chasing
`lastSequence` upward on every new poll - the real fix for a self-
inflicted race an early version of this change hit in its own tests).

New `GET /sample?from=<sequence>` (a consumer requesting from a sequence
older than the buffer must get a response coherent with the contract,
never a silently mixed one):
`from` omitted or below `lastSequence` returns the current batch (the
honest answer to "what's new", even when this adapter's own narrow,
single-slot buffer couldn't retain every intermediate reading);
`from` at or past `lastSequence` returns a real, valid, empty result;
`from` below `firstSequence` (before this process ever produced any
data) returns a real `MTConnectError` document (`errorCode="OUT_OF_RANGE"`)
- the same real Header (and therefore the same real `instanceId`) every
other response carries, so a consumer immediately sees whether it's
talking to the same agent instance it was before. A malformed `from`
returns a real `errorCode="INVALID_REQUEST"` instead of a guessed
default.

10 new tests (`tests/reader.test.ts`'s new sequence-tracking describe
block, new `tests/server-sample.test.ts`), `docs/API.md` and README x7
updated with the new endpoint's real contract.

Verified: 55/55 tests, `tsc --noEmit` clean, `tools/ci_validate.py` PASS.

## [0.0.9] - Honesty check section in every README

Added a "Honesty check" paragraph right after the badges in `README.md`
and all 6 translated READMEs, naming the real, tested modules
(`src/units.ts`, `src/dataitem.ts`, `src/reader.ts`,
`src/hydraServerReader.ts`, `src/server.ts`) and the real test count
(45 passing across 6 files). States plainly that the device model is
hardcoded to exactly one HydraNode, and that the emitted XML has only
been verified for spec-correct shape - never yet tested live against a
real third-party MTConnect Agent or collector. Documents the real,
current state of what's implemented vs. planned; no behavior changed.

## [0.0.8] - A real MachineReader, not just FixtureMachineReader forever

- Found on code review: this repo's
  only `MachineReader` was ever `FixtureMachineReader` - a fixed
  synthetic reading, unconditionally, with no real machine source
  wired in anywhere. A related, deeper bug found in the same pass:
  `GET /current`'s own `Execution`/`Availability` were hardcoded XML
  literals, so even a real reader would have changed nothing about that
  part of the response.
- **`src/hydraServerReader.ts`** (new) - `HydraServerMachineReader`, a
  real `MachineReader` polling a live HYDRA-UMC-SERVER's own
  `GET /api/settings` (the same real, live roster HYDRA-UMC-TOOL-CLI's
  own `robots` command reads). Derives real `avail` from the target
  robot's own `online` flag and real `execution`
  (`ACTIVE`/`INTERRUPTED`/`STOPPED`/`READY`) from its own real
  `playbackState` - see that file's own doc comment for the exact
  mapping. Honestly reports `spindle_temp` as `NO_DATA`: no field in
  HYDRA-UMC-SERVER's own robot/controller shape corresponds to a real
  temperature sensor yet.
- **`src/server.ts`** - `FixtureMachineReader` now also produces
  `execution`/`avail` readings (previously only `spindle_temp`); new
  `buildReader()` picks `HydraServerMachineReader` when
  `HYDRA_UMC_SERVER_URL` is set, otherwise the same honest fixture
  fallback as before. `GET /current` now renders `<Events>` AND
  `<Samples>` from the SAME real reader output (split by
  `DataItemReading.category`) instead of two hardcoded literals - a
  real downtime now degrades every DataItem it would have reported
  (execution/avail included), not just `spindle_temp`.
- Verified for real, end to end: built and ran this adapter against a
  real, live HYDRA-UMC-SERVER instance (real `data/settings.json`,
  a real robot) with `HYDRA_UMC_SERVER_URL` set - `GET /current`
  correctly reported that robot's own real `AVAILABLE`/`STOPPED` state,
  not a fixture.
- **`tests/hydraServerReader.test.ts`** (new, 12 tests) - real HTTP
  against a real `node:http` server standing in for HYDRA-UMC-SERVER's
  own `/api/settings` shape: every real Execution/Availability mapping,
  multi-robot `HYDRA_UMC_ROBOT_ID` selection, and honest failure modes
  (unknown robot, empty roster, non-2xx status, unreachable server).
  Existing tests updated to match the new, more correct downtime
  behavior. `npm run typecheck` and the full `npm test` (45 tests
  across 6 files) both pass.
- `.env.example`/`docs/API.md`/README (all 7 languages) updated to
  describe the real, now-implemented behavior instead of the
  placeholder one.

## [0.0.7] - Fixed the Docker image: MODULE_NOT_FOUND on every real run

- **`Dockerfile`'s runtime stage never installed dependencies** - real bug
  found live building and running this image for the first time (as part
  of HYDRA-UMC-GATEWAY-INDUSTRIAL's own `docker-compose.yml`): the build
  stage bundles with esbuild's own `--packages=external` (deliberate -
  keeps real npm dependencies as real `require()` calls rather than
  inlining them), so the runtime stage needed them installed separately -
  it never was, so the container crashed immediately with
  `MODULE_NOT_FOUND` on every real start. Now copies `package-lock.json`
  too and runs `npm ci --omit=dev` in the runtime stage, the same pattern
  HYDRA-UMC-OS's own `install_server.sh` already uses for
  HYDRA-UMC-SERVER (also esbuild + `--packages=external`). Verified live:
  the container now starts and stays up, and
  `HYDRA-UMC-GATEWAY-INDUSTRIAL`'s own `GET /status` reports this service
  reachable with a real measured latency.

## [0.0.6] - Reject negative and non-finite polling intervals

- **`CachedReader`** - rejected negative and non-finite `minPollIntervalMs`
  instead of accepting a configuration that could repeatedly poll a legacy
  controller. Also fixed this CHANGELOG's own stale "Versioning scheme"
  section, which claimed `scripts/bump-version.mjs` wires into `npm run
  build` - it never has; that script is a legacy helper nothing calls,
  and `bump_manifest_version.py` alone owns the version.
- 33/33 tests passing.

## [0.0.5] - Real ecosystem live-status opt-in

- **`hydra-umc.project.json`** declares its real `service.port` (5000)
  and `health_path` (`/probe`) - HYDRA-UMC-SERVER's ecosystem status
  endpoint now does a real HTTP GET against it (expecting 2xx) instead
  of only reporting static manifest metadata.

## [0.0.4]

- Build version synchronized with `hydra-umc.project.json` and the repository-native version source.

## [0.0.3] - Real, versioned DataItem mapping: units, quality, UTC, degraded mode

- **`src/units.ts`** (new) - real, pure unit conversion (Fahrenheit->Celsius, radians/second->RPM, inches->millimeters) from a source's native unit to the MTConnect-standard one, testable without any hardware. Throws `UnitConversionError` for a native unit it doesn't know, rather than passing an unconverted number through under the wrong unit label.
- **`src/dataitem.ts`** (new) - `toDataItemReading()`: the real, versioned mapping from a raw machine reading to an MTConnect DataItem - unit, quality (`GOOD`/`UNAVAILABLE`), a real UTC timestamp, and an `errorCode` (`NO_DATA`, `UNIT_CONVERSION_ERROR`) when the value isn't real/valid. A `null`/`NaN` value or an unconvertible unit renders MTConnect's own real `UNAVAILABLE` value, never a silently-wrong number or the literal string `"NaN"`.
- **`src/reader.ts`** (new) - `CachedReader` wraps any `MachineReader` with a real minimum interval between actual reads (`minPollIntervalMs`/`POLL_INTERVAL_MS`), so a busy `/current` doesn't hammer an old controller. A real read failure clears the cache and throws `SourceUnavailableError` rather than serving arbitrarily stale data.
- **`GET /current`** gained a real `<Samples>` block for a new `spindle_temp` DataItem, going through the full real pipeline above - source down or invalid renders it `UNAVAILABLE` with a `SOURCE_UNAVAILABLE` error code, a real degraded (still `200`) response, not a crash. `execution`/`avail` are untouched, still today's placeholder values.
- **`buildApp(options)`** gained an optional `{ reader, minPollIntervalMs }` for tests - defaults to a real, honest `FixtureMachineReader` (no live HydraNode exists yet, same real-vs-placeholder split as `execution`/`avail`).
- 27 new tests (`units.test.ts`, `dataitem.test.ts`, `reader.test.ts` - pure, hardware-free; `server-dataitems.test.ts` - real HTTP round trips with a fixture machine reporting mixed units, invalid data, and real downtime, confirming degraded MTConnect output and a correct UTC timestamp) = 31 total, all passing. Verified live beyond the test suite: built `dist/server.cjs`, ran it for real, and confirmed a real 140°F fixture reading rendered as exactly `60` `DEGREE_CELSIUS` in `/current`.
- `.env.example` documents `POLL_INTERVAL_MS`; `docs/API.md` documents the new `<Samples>` block and degraded-mode shape.

## [0.0.2] - Real HTTP test coverage

- **`tests/server.test.ts`** - 4 real tests (via `supertest`, a real HTTP request over a real listening socket, not a hand-rolled call into the route handler) verifying `GET /probe` and `GET /current` return spec-shaped XML (correct namespaces, `Device`/`DataItem` ids matching between the two documents, a shared `instanceId`), plus a 404 check for an unknown path.
- **`src/server.ts`** refactored: the Express app is now built by an exported `buildApp()` so tests can exercise real routes without binding a port; `main()` is the only thing that calls `app.listen()`.
- **`src/version.ts`** - the MTConnect header's `version` attribute now reads `package.json`'s real, current version at runtime instead of the hardcoded `"0.0.0"` placeholder.
- **`build.sh`/`build.bat`** - now run the real test suite (`npm test`, vitest) as a required step before compiling; a failing test fails the build.

## [0.0.1] - Automatic version bump on build

- Added `scripts/bump-version.mjs` (copied/adapted from HYDRA-UMC-SERVER's
  own) and wired it into `package.json`'s `build` script - this project
  no longer relies on a manual version edit before each real build, like
  every other Node project in the ecosystem.

## [0.0.0] - Initial scaffolding

- **`src/server.ts`** - minimal real entry point. No adapter logic yet - translating this cell's own robot/controller state into a real MTConnect device/agent feed lands in a later pass.
- **`package.json`** - project metadata, no runtime dependencies yet.
- **`build.sh` / `build.bat`** - `npm install && npm run build`.
- **`dev.sh` / `dev.bat`** - run against source directly (no build step) for local development.

## Earlier history

### Real request timeout on the HYDRA-UMC-SERVER poll

`HydraServerMachineReader.read()` used to call `fetch()` against HYDRA-UMC-SERVER's own
`GET /api/settings` with no timeout or `AbortController` at all - a server that accepted the TCP
connection but never wrote a response left this adapter's own poll loop stuck waiting indefinitely on
one `read()`, instead of surfacing a real, actionable error. `read()` now aborts after a configurable
timeout (5 seconds by default) and reports a clear message naming it, distinguishable from a genuine
non-2xx response or connection refusal. New test proves it against a real server that deliberately
never responds.

### Documentation - Linked docs/API.md, fixed stale example values and CONTRIBUTING.md

- **README (all 7 languages)** - `docs/API.md` was never actually linked from any
  README despite existing since the "Real HTTP API reference" entry below; added
  it to the directory-structure tree and a real, translated sentence pointing to
  it, in all 7 languages.
- **`docs/API.md`** - its example `Header`/`DataItem` timestamps were hardcoded
  to a stray real-looking calendar date; replaced with the conventional
  non-dated placeholder (the Unix epoch, `1970-01-01T00:00:00.000Z`) - real
  output uses `new Date().toISOString()` at request time, never a fixed value. Its
  example `version="0.0.3"` attribute was also stale (several releases behind);
  updated to the current real version, verified live against a running instance
  of this adapter (`GET /probe`/`GET /current` over a real HTTP request).
- **`CONTRIBUTING.md`** - corrected three real inaccuracies: claimed this adapter
  speaks MTConnect "over SHDR" (it doesn't - `src/server.ts` implements the
  `GET /probe`/`GET /current` HTTP/XML surface directly, no SHDR anywhere in the
  codebase); referenced a `schemas/` directory and a `scripts/validate_xml.py`
  tool that do not exist in this repo; listed "Python 3.12" as a language even
  though `src/` is 100% TypeScript (the repo's few `.py` files are ecosystem-wide
  tooling, not part of the adapter itself). Testing guidance now points at the
  real Vitest suite instead of a nonexistent script.
  Documentation-only - no code changed, no version bump.

### Security - Real XML escaping on GET /current

- **`src/server.ts`** - fixed a real XML injection/corruption bug found on code review: every value interpolated into the
  hand-built `/current` XML (a DataItem's `id`, `units`, `errorCode`, and
  its own reading value) went straight into the string with zero
  escaping. A device-reported value containing `<`, `&`, `"` or `'`
  (a real, legitimate shape for an EVENT-category string reading, e.g. an
  alarm/status message) would corrupt the MTConnect document for every
  real Agent/collector parsing it, or inject XML into the response. Added
  a proper `escapeXml()` helper (the 5 XML 1.0 predefined entities, `&`
  escaped first) and applied it at all four interpolation points.
  Covered by a new real HTTP regression test in
  `tests/server-dataitems.test.ts` asserting a raw
  `<injected>&"'` reading value is rendered fully escaped and never
  appears unescaped in the response body.
- Removed a handful of source-comment/doc references to a private,
  unpublished file that should never have been cited from
  public source - no functional change, just an accurate, self-contained
  set of comments and docs.

### Documentation - Real HTTP API reference

- **`docs/API.md`** (new) - `GET /probe` and `GET /current` documented
  from the actual `server.ts` code, including the full real XML envelope
  each one returns and a clear callout of what's still a placeholder
  (single hardcoded `HydraNode`, `Availability`/`Execution` not yet wired
  to real robot state). Verified against the real test suite
  (`tests/server.test.ts` - 4/4 passing). Documentation-only - no code
  changed, no version bump.

---
