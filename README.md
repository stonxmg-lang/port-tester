# Port Tester

A small, security-focused TCP/UDP port connectivity testing platform.
It lets you verify that a port you've forwarded on your own router is
genuinely reachable from the public internet — without needing a
second device or another person to check for you.

> **Scope note:** this tool is for testing infrastructure you own or
> are authorized to test. It performs one outbound connection attempt
> per request to a target and port you specify; it is not a port
> scanner and does not scan ranges, subnets, or lists of targets.

## How it works

```
INTERNET
   │
   ▼
┌─────────────────┐
│     VERCEL       │
│ Web Interface     │
│       │           │
│       ▼           │
│ Probe API (TCP/UDP)│
└────────┬──────────┘
         │  outbound test only
         ▼
┌─────────────────┐
│     ROUTER       │
│ Port Forwarding   │
└────────┬──────────┘
         ▼
┌─────────────────┐
│      AGENT        │
│ TCP / UDP Listener │
└─────────────────┘
```

- The **web app + API**, deployed on Vercel, is stateless and
  serverless: it never opens a listening socket, it only makes
  outbound connection attempts when you click a button.
- The **agent** runs on any device with Python 3 (Linux, macOS,
  Windows, ...) and answers those probes with a small deterministic
  response.
- Your **router** sits in between, forwarding the WAN port you choose
  to the agent device's LAN address.

## Project structure

```
port-tester/
├── app/
│   ├── api/
│   │   ├── test/tcp/route.ts     TCP probe endpoint
│   │   ├── test/udp/route.ts     UDP probe endpoint
│   │   ├── health/route.ts       Health check
│   │   └── whoami/route.ts       Detected public IP (CGNAT helper)
│   ├── page.tsx                  Main UI
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── SignalPath.tsx            Visual request-path indicator
│   └── StatusBadge.tsx
├── lib/
│   ├── config.ts                 Env-driven configuration
│   ├── validation.ts             Input validation + SSRF protection
│   ├── rateLimit.ts              In-memory rate limiter
│   ├── tcpProbe.ts                TCP probe engine
│   ├── udpProbe.ts                UDP probe engine
│   └── types.ts
├── agent/
│   ├── agent.py                  TCP/UDP listener (stdlib only)
│   ├── requirements.txt
│   └── README.md
├── tests/
│   ├── tcp/tcpProbe.test.ts
│   ├── udp/udpProbe.test.ts
│   └── validation/
├── .env.example
├── vercel.json
└── package.json
```

## Local development

Install dependencies and run the web app:

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

Run the test suite:

```bash
npm test
```

Start the agent (locally, or on the device behind your router):

```bash
cd agent
python3 agent.py --tcp 4444 --udp 4444
```

To test locally against a real router, your router's port forwarding
must point at whichever machine is actually running the agent — for a
true end-to-end test that machine should be the device on your
home network, reached from the outside via your public IP.

## Deploying to Vercel

```bash
npm install -g vercel   # if you don't already have the CLI
vercel login
vercel                  # first deploy / link project
vercel --prod           # production deploy
```

Or connect the repository in the Vercel dashboard and deploy from
there — no special build configuration is required beyond the default
Next.js preset.

### Environment variables

Copy `.env.example` to `.env.local` for local development, and set the
same variables in the Vercel project settings for production:

| Variable                  | Default | Purpose                                   |
|----------------------------|---------|--------------------------------------------|
| `TCP_TIMEOUT_MS`           | 5000    | TCP connect timeout                        |
| `UDP_TIMEOUT_MS`           | 5000    | UDP response timeout                       |
| `RATE_LIMIT_WINDOW_MS`     | 60000   | Rate-limit window                          |
| `RATE_LIMIT_MAX_REQUESTS`  | 20      | Max requests per client per window         |
| `ALLOW_HOSTNAMES`          | true    | Allow hostname targets (not just literal IPs) |

No database or external service is required.

## Running the agent

The web app's setup panel builds a ready-to-paste one-liner for your
deployed URL. The short version, on the device behind your router:

```bash
curl -sL https://your-app.vercel.app/agent.py | python3 - --tcp 4444 --udp 4444
```

(Any system with Python 3 works — Linux, macOS, Windows, and more.)

This streams the agent straight into Python, so nothing is installed
beyond Python itself. Prefer to keep the file? `agent.py` is also
served at `/agent.py` for download. See
[`agent/README.md`](agent/README.md) for full details.

## Configuring your router

1. Find your router's port forwarding page (varies by vendor).
2. Forward the external (WAN) port you plan to test, TCP and/or UDP,
   to your agent device's LAN IP address on the same port.
3. Confirm the device has a stable LAN IP (a DHCP reservation
   helps) so the forward doesn't silently point at the wrong device
   later.

```
WAN TCP 4444  →  LAN 192.168.x.x:4444
WAN UDP 4444  →  LAN 192.168.x.x:4444
```

## Running a test

1. Start the agent for the port(s) you want to test.
2. Confirm the router forward is in place.
3. Open the deployed web app.
4. Enter your public IP (or hostname) and the port.
5. Click **TCP TEST** or **UDP TEST**.

## Understanding results

### TCP

| Status        | Meaning                                                        |
|----------------|-----------------------------------------------------------------|
| `OPEN`         | A TCP connection was established — the port is reachable.       |
| `REFUSED`      | The remote host actively rejected the connection.                |
| `TIMEOUT`      | No response arrived within the timeout window.                   |
| `UNREACHABLE`  | A lower-level network error occurred before connecting.          |
| `INVALID_TARGET` | The supplied host/port failed validation.                      |

A successful TCP connection is strong evidence the port is reachable
and something is actively accepting connections on it.

### UDP

| Status         | Meaning                                                        |
|-----------------|-----------------------------------------------------------------|
| `RESPONDING`    | A response with a matching test ID was received.                |
| `NO_RESPONSE`   | No matching response arrived within the timeout.                |
| `NETWORK_ERROR` | A lower-level network error occurred.                            |
| `INVALID_TARGET`| The supplied host/port failed validation.                        |

**Important:** UDP has no connection state, so a silent
`NO_RESPONSE` does **not** prove the port is closed — firewalls
routinely drop UDP packets without any signal back to the sender. Only
treat `RESPONDING` as conclusive.

## CGNAT and troubleshooting

If your tests consistently fail even though the agent is
running and the router forward looks correct, compare your router's
reported WAN IPv4 against the "detected public IP" shown in the app's
CGNAT section. If they differ — or your router's WAN address falls in
`100.64.0.0/10` or another private range — your ISP is very likely
using Carrier-Grade NAT, which makes inbound port forwarding
impossible regardless of router configuration; you'd need to ask your
ISP for a public IPv4 address or use an alternative like a reverse
tunnel.

Other common causes of failure:

- Port forwarding pointing at the wrong LAN IP.
- A second NAT layer (e.g. an ISP-provided modem/router in front of
  your own router, both trying to do NAT).
- The ISP blocking specific inbound ports.
- The device's own firewall or the OS's background restrictions
  stopping the agent.
- Multiple layers of NAT between the device and the internet.

## Security design

- **No database, no accounts** — the service is stateless by design.
- **SSRF protection** — loopback, private, link-local, CGNAT, and other
  reserved ranges are rejected for both literal IPs and resolved
  hostnames (with every resolved address checked, not just the first,
  to close the DNS-rebinding gap).
- **One target, one port, one protocol per request** — no ranges, no
  subnet scanning, no concurrent mass testing.
- **Rate limiting** — configurable per-client request limits, returning
  HTTP 429 when exceeded.
- **Bounded timeouts** — server-side timeouts are configurable but
  hard-capped so no request can run indefinitely.
- **No raw error leakage** — all failures map to a small set of safe,
  documented error codes.
- **Minimal agent** — the agent only ever answers connectivity
  probes; it cannot execute commands, read files, or access device
  data.

## Known limitations

- IPv4 is fully implemented and tested; the networking layer is
  structured so IPv6 can be added without restructuring, but IPv6
  support is not claimed or guaranteed in this version.
- The in-memory rate limiter resets when a serverless function
  instance recycles. For strict, cluster-wide limits, back it with a
  shared store (e.g. Vercel KV or Upstash Redis) using the same `hit()`
  interface in `lib/rateLimit.ts`.
