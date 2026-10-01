"use client";

import { useState } from "react";
import { IcoBolt, IcoMail } from "./ui";

/* ================================================================
   Tool calls rendered as chat.
   The raw stream is `→ send_email {"body":"Dear Board,\n\n…"}` — an arrow
   and a JSON blob. Here the same event becomes a message bubble: a human
   label, mail-client fields for email tools, and key/value rows otherwise.
   No arrows, no braces, no literal \n escapes.
   ================================================================ */

const FIELD_ORDER = ["to", "cc", "bcc", "subject", "body"];

const FIELD_LABELS: Record<string, string> = {
  to: "To",
  cc: "Cc",
  bcc: "Bcc",
  from: "From",
  subject: "Subject",
  body: "Body",
  order_id: "Order",
  customer_id: "Customer",
  query: "Query",
  url: "URL",
  reason: "Reason",
  amount: "Amount",
};

// Reads as an action, the way a chat shows "You sent a photo".
const ACTION_LABELS: Record<string, string> = {
  send_email: "Sent email",
  forward_email: "Forwarded email",
  read_email: "Read the inbox",
  reply_email: "Replied to email",
  delete_email: "Attempted delete",
  lookup_order: "Looked up an order",
  lookup_customer: "Looked up a customer",
  list_recent_orders: "Listed recent orders",
  query_db: "Queried the database",
  fetch_url: "Fetched a URL",
};

function titleize(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isEmailTool(tool: string): boolean {
  return /mail/i.test(tool);
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

/** Long bodies are clamped so one giant email cannot swallow the panel. */
function Body({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lines = text.split("\n").length;
  const long = text.length > 190 || lines > 4;
  return (
    <>
      <p className={`chat-text${!open && long ? " clamp" : ""}`}>{text}</p>
      {long && (
        <button className="chat-more" onClick={() => setOpen((v) => !v)}>
          {open ? "Show less" : `Show more · ${lines} lines`}
        </button>
      )}
    </>
  );
}

export function ToolCall({
  tool,
  input,
  turn,
  alarm,
}: {
  tool: string;
  input: Record<string, unknown>;
  turn?: number;
  alarm?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const email = isEmailTool(tool);

  const entries = Object.entries(input ?? {}).filter(([, v]) => asText(v).length > 0);
  // Email fields follow a mail client's order; every other tool keeps the
  // order the model actually sent.
  const ordered = email
    ? [...entries].sort(
        (a, b) => FIELD_ORDER.indexOf(a[0]) - FIELD_ORDER.indexOf(b[0])
      )
    : entries;

  const to = typeof input?.to === "string" ? input.to : "";
  const subject = typeof input?.subject === "string" ? input.subject : "";
  const body = typeof input?.body === "string" ? input.body : "";
  const label = ACTION_LABELS[tool] ?? titleize(tool);

  const copy = () => {
    const text = email
      ? `To: ${to}\nSubject: ${subject}\n\n${body}`
      : ordered.map(([k, v]) => `${titleize(k)}: ${asText(v)}`).join("\n");
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div className={`chat-row mine${alarm ? " alarm" : ""}`}>
      <span className="chat-av">{email ? <IcoMail /> : <IcoBolt />}</span>
      <div className="chat-stack">
        <div className="chat-meta">
          {label}
          {typeof turn === "number" && <span className="chat-dim">turn {turn + 1}</span>}
          {to && <span className="chat-dim">{to}</span>}
          {alarm && <span className="chat-flag">outbound</span>}
          <button className="chat-act" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
          {email && to && (
            <a
              className="chat-act"
              href={`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`}
            >
              Open in mail
            </a>
          )}
        </div>

        <div className="chat-bubble">
          {ordered.length === 0 ? (
            <p className="chat-text muted">Called with no arguments.</p>
          ) : (
            <div className="mail">
              {ordered.map(([k, v]) => (
                <div className="mail-row" key={k}>
                  <span className="mail-k">{titleize(k)}</span>
                  <div className="mail-v">
                    <Body text={asText(v)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
