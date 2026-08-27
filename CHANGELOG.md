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
