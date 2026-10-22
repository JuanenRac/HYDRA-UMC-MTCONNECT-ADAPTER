// =============================================================================
// HYDRA-UMC MTCONNECT ADAPTER - src/xml.ts
// Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
// GPL-3.0-or-later - see LICENSE
//
// The one place where text becomes XML. Every value that reaches a document (a device name, a reading, a message) goes
// through escapeXml; elements are written by element(), which escapes every attribute value and the text, so a caller
// cannot forget to. Standard XML 1.0 predefined entities; `&` first, or a later `&lt;` would itself be re-escaped.
// =============================================================================

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // characters XML 1.0 does not allow at all (control characters other than tab, newline and carriage return) are dropped
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
}

export type XmlAttributes = ReadonlyArray<readonly [name: string, value: string | number | undefined]>;

/** `<name a="1" b="2">text</name>`, or `<name a="1"/>` without text. An attribute whose value is undefined is left out. */
export function element(name: string, attributes: XmlAttributes = [], text?: string): string {
  const attrs = attributes
    .filter((entry): entry is readonly [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`)
    .join("");
  return text === undefined || text === "" ? `<${name}${attrs}/>` : `<${name}${attrs}>${escapeXml(text)}</${name}>`;
}
