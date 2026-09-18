# Vendored MTConnect 1.7 XSD Schemas

`MTConnectDevices_1.7.xsd`, `MTConnectStreams_1.7.xsd`, `MTConnectError_1.7.xsd`
and their `xlink.xsd` dependency are vendored unmodified from the official
MTConnect Institute schema repository:

https://github.com/mtconnect/schema

Distributed under the Apache License 2.0 (see that repository's own
`LICENSE`). Used here only to validate this adapter's own generated XML
against the real ANSI/MTC1.4 standard shape - they are not shipped in the
built/bundled adapter (`npm run build`'s output), only used by the test
suite (`tests/xsd-validation.test.ts`).
