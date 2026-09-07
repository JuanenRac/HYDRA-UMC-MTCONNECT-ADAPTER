# Contributing to HYDRA-UMC-MTCONNECT-ADAPTER 🦾

We welcome contributions to the machine tool monitoring bridge of the HYDRA-UMC ecosystem.

## Technology Stack
- **Runtime**: Node.js 20+ (TypeScript), Express.
- **Protocol**: MTConnect (ANSI/MTC1.4) `GET /probe` and `GET /current` over plain HTTP - no SHDR, no framework beyond Express (the XML is hand-built, see `src/server.ts`).
- **Formats**: XML, HTTP.

## Guidelines
1. **XML Schema Compliance**: Generated XML must keep the spec-correct `MTConnectDevices`/`MTConnectStreams` envelope shape (namespace, shared `Header`, matching `Device`/`DataItem` ids) - `tests/server.test.ts` checks this with real HTTP requests (`supertest`), not a hand inspection.
2. **Data Item Mapping**: Ensure that new robotic telemetry is mapped to the most appropriate standard MTConnect DataItems (e.g., `POSITION`, `VELOCITY`, `AMPERAGE`), with real unit conversion/quality classification in `src/units.ts`/`src/dataitem.ts`.
3. **HTTP Performance**: The adapter server should handle rapid polling cycles from industrial agents without significant CPU spikes - `src/reader.ts`'s `CachedReader` already rate-limits how often the underlying `MachineReader` is actually polled.
4. **Testing**: Run the real Vitest suite (`npm test`, `tests/*.test.ts`) before submitting changes - it exercises unit conversion, data-item mapping, the reader's polling/caching, and real HTTP round-trips against `GET /probe`/`GET /current`.
