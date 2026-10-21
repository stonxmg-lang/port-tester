# Port Test Agent

A minimal, dependency-free TCP/UDP listener that answers connectivity
probes from the Port Tester web app. Runs on any machine with Python 3
— Linux, macOS, Windows, a Raspberry Pi, an old laptop, whatever is
behind your router. Only the Python 3 standard library is used.

## Quick start (one line)

The web app's setup panel builds this command for your deployed URL:

```bash
curl -sL https://your-app.vercel.app/agent.py | python3 - --tcp 4444 --udp 4444
```

It streams the agent straight into Python — nothing is saved. Leave it
running while you test from the web app. Press `Ctrl+C` to stop.

## Run from a saved file

```bash
curl -sL https://your-app.vercel.app/agent.py -o agent.py
python3 agent.py --tcp 4444 --udp 4444
```

On Windows, download `agent.py` (it is also served at `/agent.py` on
the deployed app) and run:

```
python agent.py --tcp 4444 --udp 4444
```

Other examples:

```bash
python3 agent.py --tcp 4444
python3 agent.py --udp 4444
python3 agent.py --tcp 4444 --udp 4444 --bind 0.0.0.0
```

You should see:

```
========================================
        PORT TEST AGENT
========================================

TCP Listener : 4444
UDP Listener : 4444

Status: LISTENING

Waiting for external tests...
```

## What it does and does not do

The agent:

- Listens on the TCP and/or UDP port(s) you specify.
- Replies to a TCP connection with a small fixed banner.
- Replies to a recognized UDP `PORT_TEST_REQUEST` by echoing the
  request's test ID back in a `PORT_TEST_RESPONSE`.
- Logs only the remote IP, protocol, and outcome — nothing else.

The agent never:

- Executes shell commands or arbitrary code.
- Reads files, contacts, camera, or microphone.
- Persists itself or phones home.
- Forwards or proxies arbitrary traffic.

## Keeping it running

Some operating systems suspend background apps or services to save
power. For a live test, keep the terminal in the foreground; on a
server you can run it under `systemd`, `screen`, or `tmux` instead.
