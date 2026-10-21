#!/usr/bin/env python3
"""
Port Test Agent
----------------
A minimal, dedicated TCP/UDP listener for verifying router port
forwarding. Runs anywhere Python 3 is available (Linux, macOS,
Windows, and more), using only the standard library (no dependencies).

This agent does exactly one thing: answer connectivity probes from the
Vercel-hosted Port Tester with a small, deterministic response. It does
NOT execute shell commands, read files, access device sensors, or do
anything beyond accepting a connection / packet and replying.

Usage:
    python3 agent.py --tcp 4444
    python3 agent.py --udp 4444
    python3 agent.py --tcp 4444 --udp 4444
    python3 agent.py --tcp 4444 --udp 4444 --bind 0.0.0.0
"""

from __future__ import annotations

import argparse
import re
import socket
import sys
import threading
import time
from dataclasses import dataclass

AGENT_ID = "port-test-agent"
AGENT_VERSION = "1.0.0"

ID_RE = re.compile(r"^id=(.+)$", re.MULTILINE)
PORT_RE = re.compile(r"^port=(\d+)$", re.MULTILINE)


@dataclass
class Options:
    tcp_port: int | None
    udp_port: int | None
    bind: str


def parse_args(argv: list[str]) -> Options:
    parser = argparse.ArgumentParser(description="Port Test Agent — TCP/UDP connectivity listener")
    parser.add_argument("--tcp", type=int, default=None, metavar="PORT", help="Port to listen on for TCP tests")
    parser.add_argument("--udp", type=int, default=None, metavar="PORT", help="Port to listen on for UDP tests")
    parser.add_argument("--bind", type=str, default="0.0.0.0", help="Address to bind to (default: 0.0.0.0)")
    args = parser.parse_args(argv)

    if args.tcp is None and args.udp is None:
        parser.error("specify at least one of --tcp PORT or --udp PORT")

    for label, value in (("--tcp", args.tcp), ("--udp", args.udp)):
        if value is not None and not (1 <= value <= 65535):
            parser.error(f"{label} must be between 1 and 65535")

    return Options(tcp_port=args.tcp, udp_port=args.udp, bind=args.bind)


def log(line: str) -> None:
    timestamp = time.strftime("%H:%M:%S")
    print(f"[{timestamp}] {line}", flush=True)


def banner(opts: Options) -> None:
    print("=" * 40)
    print("        PORT TEST AGENT")
    print("=" * 40)
    print()
    if opts.tcp_port:
        print(f"TCP Listener : {opts.tcp_port}")
    if opts.udp_port:
        print(f"UDP Listener : {opts.udp_port}")
    print()
    print("Status: LISTENING")
    print()
    print("Waiting for external tests...")
    print()


class TcpListener(threading.Thread):
    def __init__(self, bind: str, port: int, stop_event: threading.Event):
        super().__init__(daemon=True)
        self.bind = bind
        self.port = port
        self.stop_event = stop_event
        self.sock: socket.socket | None = None

    def run(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((self.bind, self.port))
        sock.listen(8)
        sock.settimeout(1.0)  # allows periodic check of stop_event
        self.sock = sock

        while not self.stop_event.is_set():
            try:
                conn, addr = sock.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            threading.Thread(target=self._handle, args=(conn, addr), daemon=True).start()

        try:
            sock.close()
        except OSError:
            pass

    def _handle(self, conn: socket.socket, addr: tuple) -> None:
        try:
            conn.settimeout(5.0)
            log(f"[TCP] Test received from {addr[0]}")
            response = (
                "PORT_TEST_AGENT\n"
                "PROTOCOL: TCP\n"
                "STATUS: OK\n"
                f"PORT: {self.port}\n"
                f"AGENT: {AGENT_ID}/{AGENT_VERSION}\n"
            )
            conn.sendall(response.encode("utf-8"))
            log("[TCP] Response sent")
        except OSError as exc:
            log(f"[TCP] Error handling connection from {addr[0]}: {exc}")
        finally:
            try:
                conn.close()
            except OSError:
                pass

    def stop(self) -> None:
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass


class UdpListener(threading.Thread):
    def __init__(self, bind: str, port: int, stop_event: threading.Event):
        super().__init__(daemon=True)
        self.bind = bind
        self.port = port
        self.stop_event = stop_event
        self.sock: socket.socket | None = None

    def run(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((self.bind, self.port))
        sock.settimeout(1.0)
        self.sock = sock

        while not self.stop_event.is_set():
            try:
                data, addr = sock.recvfrom(2048)
            except socket.timeout:
                continue
            except OSError:
                break
            self._handle(data, addr, sock)

        try:
            sock.close()
        except OSError:
            pass

    def _handle(self, data: bytes, addr: tuple, sock: socket.socket) -> None:
        try:
            text = data.decode("utf-8", errors="ignore")
        except Exception:
            return

        log(f"[UDP] Test received from {addr[0]}")

        id_match = ID_RE.search(text)
        if not id_match:
            # Not a recognized request — ignore silently rather than
            # replying to arbitrary traffic.
            return

        test_id = id_match.group(1).strip()
        response = (
            "PORT_TEST_RESPONSE\n"
            f"id={test_id}\n"
            f"port={self.port}\n"
            "status=ok\n"
            f"agent={AGENT_ID}/{AGENT_VERSION}\n"
        )
        try:
            sock.sendto(response.encode("utf-8"), addr)
            log("[UDP] Response sent")
        except OSError as exc:
            log(f"[UDP] Failed to send response: {exc}")

    def stop(self) -> None:
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass


def main(argv: list[str]) -> int:
    opts = parse_args(argv)
    banner(opts)

    stop_event = threading.Event()
    threads: list[threading.Thread] = []

    if opts.tcp_port:
        tcp_thread = TcpListener(opts.bind, opts.tcp_port, stop_event)
        tcp_thread.start()
        threads.append(tcp_thread)

    if opts.udp_port:
        udp_thread = UdpListener(opts.bind, opts.udp_port, stop_event)
        udp_thread.start()
        threads.append(udp_thread)

    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print()
        log("Shutting down (Ctrl+C received)...")
        stop_event.set()
        for t in threads:
            if hasattr(t, "stop"):
                t.stop()  # type: ignore[attr-defined]
        for t in threads:
            t.join(timeout=2.0)
        log("Stopped cleanly. Goodbye.")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
