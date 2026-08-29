# Changelog

All notable work on **HYDRA-UMC-MTCONNECT-ADAPTER** is summarized here, newest first. Full
session-by-session detail (including dates) lives in a private,
unpublished internal log - this file is public, so it intentionally
omits calendar dates.

## Versioning scheme

`scripts/bump-version.mjs` bumps `package.json`'s `version` field
automatically as the first step of every real `npm run build` (same
mechanism HYDRA-UMC-SERVER/HYDRA-UMC-STUDIO already use) - no manual
version edits, no build that silently ships under the previous number.

It follows the ecosystem-wide base-10 "odometer" rule rather than
semantic-versioning judgment calls:

- `PATCH` +1 on every build
- when `PATCH` would exceed 9, it resets to 0 and `MINOR` +1 instead (e.g. `0.0.9` -> `0.1.0`, never `0.0.10`)
- the same carry cascades into `MAJOR` if `MINOR` would exceed 9

---

## Security - Real XML escaping on GET /current

- **`src/server.ts`** - fixed a real XML injection/corruption bug found in
  a live ecosystem bug audit: every value interpolated into the
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
