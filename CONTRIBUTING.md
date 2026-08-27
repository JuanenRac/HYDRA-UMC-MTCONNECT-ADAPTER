# Contributing to HYDRA-UMC-MTCONNECT-ADAPTER 🦾

We welcome contributions to the machine tool monitoring bridge of the HYDRA-UMC ecosystem.

## Technology Stack
- **Languages**: Node.js 20+, Python 3.12.
- **Protocol**: MTConnect (ANSI/MTC1.4) over SHDR.
- **Formats**: XML, HTTP, JSON.
- **Environment**: Linux (Ubuntu 22.04).

## Guidelines
1. **XML Schema Compliance**: All generated XML streams must be validated against the official MTConnect XSD schemas included in the `schemas/` directory.
2. **Data Item Mapping**: Ensure that new robotic telemetry is mapped to the most appropriate standard MTConnect DataItems (e.g., `POSITION`, `VELOCITY`, `AMPERAGE`).
3. **HTTP Performance**: The adapter server should handle rapid polling cycles from industrial agents without significant CPU spikes.
4. **Testing**: Validate the XML output using the `scripts/validate_xml.py` tool before submitting changes.
