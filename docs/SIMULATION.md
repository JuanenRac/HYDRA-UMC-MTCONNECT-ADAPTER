# Simulation bench

Runs the real SHDR reader and the real SHDR server against a simulated machine that speaks SHDR (a TCP feed with a seeded cycle of states) and misbehaves on command.

Scenarios:

- the reader follows a seeded cycle of 25 state changes, answers the heartbeat, reads CRLF line ends and a line that arrives one byte at a time;
- a refused connection, a connection that says nothing, garbage, overlong lines, unknown items and a line that never ends never produce a value the machine did not send;
- a value is forgotten when the connection that carried it is gone, and the reader reconnects by itself, also when the machine flaps ten times;
- numbers stay numbers, UNAVAILABLE and text become no value, and a condition with an escaped pipe keeps its message;
- the parsers never throw on hostile input, and what the server writes reads back as the same message;
- the SHDR server greets an agent with the device and the current values, answers the heartbeat, ignores every other input, drops an agent that sends a line that never ends and refuses the seventeenth agent.

Part two (`tests/simulation-bench-sources.test.ts`) runs the other two machine sources:

- the reader of HYDRA-UMC-SERVER follows the playback and the online flag of the robot of a host twin of `GET /api/settings`; when the twin is off, answers 500 or 503, sends a page that is not JSON, a JSON cut in the middle or at the end, an empty roster, or never answers, the read ends with an error and no value, and the next read after the server is back shows the real state; the sequence of the cache does not advance on a failed read;
- a robot that leaves the roster of a reachable server fails the read and is read again when it comes back; a session that the server forgets is logged in again once, and a login that is off fails the read without a loop;
- a hundred and twenty reads on a fixed seed, with a state and a fault drawn for each, never show a state the server did not say and give the same outcomes twice;
- the reader of the MQTT broker stays unavailable and does not crash while the broker refuses the connection, forgets its value when the broker drops it and follows the bridge again after it reconnects by itself;
- thirty groups of messages on a fixed seed (garbage, a JSON array, an execution the standard does not know, a number, a payload that is too large, an empty payload, another topic, a value that is old) never change what the reader shows; only the last good message does.

The evidence of this project is `simulator`: it says nothing about real machines, real networks or real load.

Physical tests still pending:

- a real machine that speaks SHDR: switch it off in the middle of a cycle and on again; expected: every DataItem is UNAVAILABLE while it is off and the real values come back by themselves within the reconnect wait;
- a running HYDRA-UMC-SERVER with a real robot: stop the server for ten seconds, then start it; expected: `GET /current` of the adapter shows UNAVAILABLE during the stop and the real Execution and Availability of the robot afterwards;
- a real broker and HYDRA-UMC-BRIDGE-PRINTER3D: restart the broker; expected: UNAVAILABLE until the bridge publishes again, then the real Execution.
