#!/usr/bin/env python3
# =============================================================================
# HYDRA-UMC MTCONNECT ADAPTER - tools/cppagent_check.py
# Copyright (C) 2026 JuanenRac (Electro Hobby 3D) <electrohobby3d@gmail.com>
# GPL-3.0-or-later - see LICENSE
# =============================================================================
"""Compare what an off-the-shelf MTConnect agent (cppagent) serves with what this adapter serves.

    python tools/cppagent_check.py ADAPTER_URL AGENT_URL [--wait SECONDS]

The adapter feeds the agent over SHDR; this script then reads GET /current of both and checks that every DataItem the adapter reports
with a value is reported by the agent with the same value, and that the two devices declare the same DataItems. It needs nothing but the
standard library and is run by the manual workflow "cppagent", which starts a real cppagent in a container. Exit status 0 only when the
comparison passed; nothing here says anything about a real machine.
"""
from __future__ import annotations

import argparse
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

REQUIRED = ("avail", "execution")  # the DataItems that must be among the compared ones


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def fetch(url: str, timeout: float = 5.0) -> ET.Element:
    with urllib.request.urlopen(url, timeout=timeout) as response:  # noqa: S310 - the URLs come from the command line of the operator
        return ET.fromstring(response.read())


def observations(document: ET.Element) -> dict[str, str]:
    """dataItemId -> value of the newest observation of every DataItem in a Streams document."""
    found: dict[str, str] = {}
    for element in document.iter():
        data_item = element.attrib.get("dataItemId")
        if data_item and _local(element.tag) not in ("ComponentStream", "DeviceStream"):
            found[data_item] = (element.text or "").strip() or element.attrib.get("type", "") or _local(element.tag)
    return found


def declared(document: ET.Element) -> set[str]:
    """The ids of the DataItems a Devices document declares."""
    return {element.attrib["id"] for element in document.iter() if _local(element.tag) == "DataItem" and "id" in element.attrib}


def compare(adapter: dict[str, str], agent: dict[str, str]) -> list[str]:
    """What differs: a value of the adapter that the agent does not show the same way."""
    problems = []
    for key, value in sorted(adapter.items()):
        if value.upper() == "UNAVAILABLE":
            continue
        if key not in agent:
            problems.append(f"{key}: the agent does not report it (adapter: {value})")
        elif agent[key] != value:
            problems.append(f"{key}: adapter {value!r}, agent {agent[key]!r}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("adapter_url")
    parser.add_argument("agent_url")
    parser.add_argument("--wait", type=float, default=30.0, help="seconds to wait for the agent to take over the values")
    args = parser.parse_args(argv)
    adapter_base, agent_base = args.adapter_url.rstrip("/"), args.agent_url.rstrip("/")

    adapter_ids = declared(fetch(adapter_base + "/probe"))
    agent_ids = declared(fetch(agent_base + "/probe"))
    missing = sorted(adapter_ids - agent_ids)
    print(f"DataItems declared: adapter {len(adapter_ids)}, agent {len(agent_ids)}")
    if missing:
        print("DECLARED_MISSING " + ", ".join(missing))
        return 1

    deadline = time.monotonic() + args.wait
    problems: list[str] = ["no answer yet"]
    compared = 0
    while time.monotonic() < deadline:
        adapter = observations(fetch(adapter_base + "/current"))
        agent = observations(fetch(agent_base + "/current"))
        problems = compare(adapter, agent)
        compared = sum(1 for value in adapter.values() if value.upper() != "UNAVAILABLE")
        if not problems and compared and all(key in agent and agent[key].upper() != "UNAVAILABLE" for key in REQUIRED if key in adapter):
            break
        time.sleep(1.0)
    for line in problems:
        print("DIFFERENT " + line)
    print(f"compared {compared} DataItems with a value")
    if problems or compared < len(REQUIRED):
        print("CPPAGENT_CHECK=FAIL")
        return 1
    print("CPPAGENT_CHECK=PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
