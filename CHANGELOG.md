# Changelog

All notable work on **HYDRA-UMC-MTCONNECT-ADAPTER** is summarized here, newest first.
This file intentionally omits calendar dates from individual entries.

## Versioning scheme

`bump_manifest_version.py` (root of the workspace) is the single owner
of both `hydra-umc.project.json` and `package.json`'s `version` field -
`npm run build` is deliberately compilation-only so it can never create
drift between them. `scripts/bump-version.mjs` is a legacy native-only
helper kept for reference; nothing in this repo calls it.

It follows the ecosystem-wide base-10 "odometer" rule rather than
semantic-versioning judgment calls:

- `PATCH` +1 on every build
- when `PATCH` would exceed 9, it resets to 0 and `MINOR` +1 instead (e.g. `0.0.9` -> `0.1.0`, never `0.0.10`)
- the same carry cascades into `MAJOR` if `MINOR` would exceed 9

---

## Documentation - Linked docs/API.md, fixed stale example values and CONTRIBUTING.md

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

## Security - Real XML escaping on GET /current

- **`src/server.ts`** - fixed a real XML injection/corruption bug found
  while auditing the code: every value interpolated into the
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
  unpublished internal notes file that should never have been cited from
  public source - no functional change, just an accurate, self-contained
  set of comments and docs.

## Documentation - Real HTTP API reference

- **`docs/API.md`** (new) - `GET /probe` and `GET /current` documented
  from the actual `server.ts` code, including the full real XML envelope
  each one returns and a clear callout of what's still a placeholder
  (single hardcoded `HydraNode`, `Availability`/`Execution` not yet wired
  to real robot state). Verified against the real test suite
  (`tests/server.test.ts` - 4/4 passing). Documentation-only - no code
  changed, no version bump.

---

## [0.0.8] - A real MachineReader, not just FixtureMachineReader forever

- Found while auditing the code: this repo's
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
