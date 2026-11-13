# Simulation bench

Runs the real SHDR reader and the real SHDR server against a simulated machine that speaks SHDR (a TCP feed with a seeded cycle of states) and misbehaves on command.

Scenarios:

- the reader follows a seeded cycle of 25 state changes, answers the heartbeat, reads CRLF line ends and a line that arrives one byte at a time;
- a refused connection, a connection that says nothing, garbage, overlong lines, unknown items and a line that never ends never produce a value the machine did not send;
- a value is forgotten when the connection that carried it is gone, and the reader reconnects by itself, also when the machine flaps ten times;
- numbers stay numbers, UNAVAILABLE and text become no value, and a condition with an escaped pipe keeps its message;
- the parsers never throw on hostile input, and what the server writes reads back as the same message;
- the SHDR server greets an agent with the device and the current values, answers the heartbeat, ignores every other input, drops an agent that sends a line that never ends and refuses the seventeenth agent.

The evidence of this project is `simulator`: it says nothing about real machines, real networks or real load.
