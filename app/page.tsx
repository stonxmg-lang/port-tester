"use client";

import { useEffect, useState } from "react";
import SignalPath, { PathState } from "@/components/SignalPath";
import StatusBadge from "@/components/StatusBadge";
import styles from "./page.module.css";

type Protocol = "tcp" | "udp";

interface ApiResult {
  success: boolean;
  protocol?: Protocol;
  host?: string;
  resolvedIp?: string;
  port?: number;
  status?: string;
  latency_ms?: number | null;
  message?: string;
  test_id?: string;
  error?: string;
}

const EXPLANATIONS: Record<string, string> = {
  open: "Connection established — this port is reachable from the internet.",
  refused: "The host answered, but nothing is listening on that port.",
  timeout: "No response before the timeout — the port is likely filtered or the forward is misconfigured.",
  unreachable: "A network-level error occurred before a connection could be attempted.",
  invalid_target: "The target is malformed, unresolvable, or a private/reserved address.",
  responding: "A matching UDP response arrived — packets reach your listener and replies come back.",
  no_response: "No reply arrived. This does not prove the port is closed — UDP packets are often dropped silently.",
  network_error: "A network-level error occurred while sending or waiting for the UDP packet.",
};

function toPathState(status?: string, success?: boolean): PathState {
  if (!status) return "idle";
  if (status === "open" || status === "responding") return "success";
  if (status === "no_response" || status === "timeout") return "unknown";
  return "fail";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button type="button" className={styles.copyBtn} onClick={copy}>
      {copied ? "Copied \u2713" : "Copy"}
    </button>
  );
}

export default function Page() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [publicIp, setPublicIp] = useState<string | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/whoami")
      .then((r) => r.json())
      .then((d) => {
        const ip = d.detected_public_ip ?? null;
        setPublicIp(ip);
        if (ip) setHost(ip);
      })
      .catch(() => setPublicIp(null));
  }, []);

  const runTest = async (proto: Protocol) => {
    setFormError(null);

    const trimmedHost = host.trim();
    const portNum = Number(port);

    if (!trimmedHost) {
      setFormError("Enter a target IP address or hostname.");
      return;
    }
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setFormError("Enter a port between 1 and 65535.");
      return;
    }

    setProtocol(proto);
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/test/${proto}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: trimmedHost, port: portNum }),
      });
      const data: ApiResult = await res.json();
      if (!res.ok && !data.status) {
        setFormError(data.message ?? "Request failed.");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setFormError("Could not reach the test API. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // The agent command mirrors whatever port is typed in the test form,
  // so the user configures a single number across the whole flow.
  const portNum = Number(port);
  const agentPort = Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535 ? portNum : 4444;
  const agentUrl = origin ? `${origin}/agent.py` : "https://your-app.vercel.app/agent.py";
  const runCmd = `curl -sL ${agentUrl} | python3 - --tcp ${agentPort} --udp ${agentPort}`;
  const saveCmd = `curl -sL ${agentUrl} -o agent.py && python3 agent.py --tcp ${agentPort} --udp ${agentPort}`;

  const pathState: PathState = loading ? "testing" : toPathState(result?.status, result?.success);
  const badgeKind = (result?.status ?? null) as
    | "open"
    | "refused"
    | "timeout"
    | "unreachable"
    | "invalid_target"
    | "responding"
    | "no_response"
    | "network_error"
    | null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>OUTBOUND PROBE · SERVERLESS · NO ACCOUNT NEEDED</div>
        <h1 className={styles.title}>Port Tester</h1>
        <p className={styles.subtitle}>
          Verify your router&rsquo;s TCP / UDP port forwarding from the outside — no friend or second device needed.
        </p>
      </header>

      <SignalPath state={pathState} protocol={protocol ?? "tcp"} />

      <section className={styles.panel}>
        <div className={styles.field}>
          <label htmlFor="host">Target IP / hostname</label>
          <input
            id="host"
            className="mono"
            placeholder={publicIp ?? "89.147.157.190"}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="port">Port</label>
          <input
            id="port"
            className="mono"
            placeholder="4444"
            inputMode="numeric"
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))}
            disabled={loading}
            autoComplete="off"
          />
        </div>

        {formError && <div className={styles.formError}>{formError}</div>}

        <div className={styles.actions}>
          <button
            className={styles.testBtn}
            onClick={() => runTest("tcp")}
            disabled={loading}
            aria-label="Run TCP test"
          >
            {loading && protocol === "tcp" ? "Testing TCP…" : "TCP TEST"}
          </button>
          <button
            className={styles.testBtn}
            onClick={() => runTest("udp")}
            disabled={loading}
            aria-label="Run UDP test"
          >
            {loading && protocol === "udp" ? "Testing UDP…" : "UDP TEST"}
          </button>
        </div>

        {loading && (
          <p className={styles.loadingLine}>
            Connecting to {host || "target"}:{port || "port"}…
          </p>
        )}
      </section>

      {result && (
        <section className={styles.resultPanel} aria-live="polite">
          <div className={styles.resultHead}>
            <span className={styles.resultProto}>{(result.protocol ?? protocol ?? "").toUpperCase()}</span>
            {badgeKind && <StatusBadge kind={badgeKind} />}
          </div>

          <dl className={styles.resultGrid}>
            <div>
              <dt>Target</dt>
              <dd className="mono">
                {result.host}
                {result.port ? `:${result.port}` : ""}
              </dd>
            </div>
            {result.resolvedIp && (
              <div>
                <dt>Resolved IP</dt>
                <dd className="mono">{result.resolvedIp}</dd>
              </div>
            )}
            <div>
              <dt>Latency</dt>
              <dd className="mono">{result.latency_ms != null ? `${result.latency_ms} ms` : "—"}</dd>
            </div>
            <div>
              <dt>Test ID</dt>
              <dd className="mono">{result.test_id ?? "—"}</dd>
            </div>
          </dl>

          <p className={styles.explanation}>
            {result.message || (result.status && EXPLANATIONS[result.status]) || ""}
          </p>
        </section>
      )}

      <section className={styles.setupPanel}>
        <h2>Set up your device</h2>
        <p className={styles.setupLead}>
          On the machine behind your router, paste this one line — it streams the listener straight into Python 3 and
          starts it on port {agentPort} (taken from the field above):
        </p>

        <div className={styles.codeBlock}>
          <code className="mono">{runCmd}</code>
          <CopyButton text={runCmd} />
        </div>

        <details className={styles.altOptions}>
          <summary>Other ways to run it</summary>
          <div className={styles.codeBlock}>
            <code className="mono">{saveCmd}</code>
            <CopyButton text={saveCmd} />
          </div>
          <p className={styles.note}>
            No Python yet? Install it with your package manager (e.g. <code className="mono">sudo apt install python3</code>
            or <code className="mono">brew install python</code>). Windows: <a href="/agent.py" download>download agent.py</a> and
            run <code className="mono">python agent.py --tcp {agentPort} --udp {agentPort}</code>.
          </p>
        </details>

        <ol className={styles.steps}>
          <li>Run the command above on the device and leave it running.</li>
          <li>
            Forward WAN port <strong>{agentPort}</strong> (TCP and/or UDP) to that device&rsquo;s LAN IP in your router.
          </li>
          <li>
            Enter your public IP and the port above, then hit <strong>TCP TEST</strong> or <strong>UDP TEST</strong>.
          </li>
        </ol>
      </section>

      <section className={styles.infoPanel}>
        <h2>CGNAT check</h2>
        <p className={styles.publicIp}>
          Public IP seen by this server: <span className="mono">{publicIp ?? "unavailable"}</span>
        </p>
        <p className={styles.note}>
          Compare it with the WAN address in your router&rsquo;s admin page. If they differ — or the router shows a
          100.64.x.x address — your ISP uses CGNAT and inbound forwarding will not work.
        </p>
      </section>

      <section className={styles.infoPanel}>
        <button
          className={styles.disclosure}
          onClick={() => setShowTroubleshooting((v) => !v)}
          aria-expanded={showTroubleshooting}
        >
          {showTroubleshooting ? "Hide" : "Show"} troubleshooting
        </button>
        {showTroubleshooting && (
          <ul className={styles.troubleshootList}>
            <li>Your ISP uses CGNAT (see the check above).</li>
            <li>The router forward points to the wrong LAN device or port.</li>
            <li>Double NAT — an ISP modem in front of your own router.</li>
            <li>The OS put the listener to sleep (battery saver / background restrictions) — keep the terminal in the foreground.</li>
          </ul>
        )}
      </section>

      <footer className={styles.footer}>Connectivity testing utility for infrastructure you own or are authorized to test.</footer>
    </main>
  );
}
