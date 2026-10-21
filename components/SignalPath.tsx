"use client";

import styles from "./SignalPath.module.css";

export type PathState = "idle" | "testing" | "success" | "fail" | "unknown";

interface SignalPathProps {
  state: PathState;
  protocol: "tcp" | "udp";
}

const NODES = ["SERVER", "ROUTER", "AGENT"] as const;

/**
 * The one signature element of this UI: a literal rendering of the
 * request path described in the architecture (probe -> router -> agent).
 * Its state communicates real test progress/outcome rather than decorating.
 */
export default function SignalPath({ state, protocol }: SignalPathProps) {
  return (
    <div className={styles.wrap} role="img" aria-label={`Signal path, currently ${state}`}>
      <div className={`${styles.track} ${styles[state]}`}>
        <div className={styles.segment} data-seg="a" />
        <div className={styles.segment} data-seg="b" />
        {state === "testing" && <div className={styles.pulse} data-protocol={protocol} />}
      </div>
      <div className={styles.nodes}>
        {NODES.map((n) => (
          <span key={n} className={styles.node}>
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}
