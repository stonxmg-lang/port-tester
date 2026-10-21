import styles from "./StatusBadge.module.css";

type Kind = "open" | "refused" | "timeout" | "unreachable" | "invalid_target" | "responding" | "no_response" | "network_error";

const LABELS: Record<Kind, string> = {
  open: "OPEN",
  refused: "REFUSED",
  timeout: "TIMEOUT",
  unreachable: "UNREACHABLE",
  invalid_target: "INVALID TARGET",
  responding: "RESPONDING",
  no_response: "NO RESPONSE",
  network_error: "NETWORK ERROR",
};

const GLYPHS: Record<Kind, string> = {
  open: "\u2713",
  refused: "\u2715",
  timeout: "\u25F7",
  unreachable: "\u26A0",
  invalid_target: "\u26A0",
  responding: "\u2713",
  no_response: "?",
  network_error: "\u26A0",
};

const TONE: Record<Kind, "ok" | "err" | "warn" | "neutral"> = {
  open: "ok",
  refused: "err",
  timeout: "warn",
  unreachable: "err",
  invalid_target: "err",
  responding: "ok",
  no_response: "neutral",
  network_error: "err",
};

export default function StatusBadge({ kind }: { kind: Kind }) {
  const tone = TONE[kind];
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      <span aria-hidden="true" className={styles.glyph}>
        {GLYPHS[kind]}
      </span>
      {LABELS[kind]}
    </span>
  );
}
