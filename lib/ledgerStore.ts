// INTERFACE FOR INTEGRATION
// getLatestLedgerRow(identity) returns the current pointer; advanceLedger(receipt) appends history.
// Both functions use Upstash Redis REST when LEDGER_KV_URL is configured, otherwise .warrant/ledger.jsonl.

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { LedgerRow, SignedReceipt } from "./receiptShared";

const localLedgerPath = path.join(process.cwd(), ".warrant", "ledger.jsonl");

export async function getLatestLedgerRow(identity: string): Promise<LedgerRow | null> {
  const baseUrl = process.env.LEDGER_KV_URL?.trim();
  if (baseUrl) return getRedisRow(baseUrl, identity);
  return getLocalRow(identity);
}

export async function advanceLedger(receipt: SignedReceipt): Promise<LedgerRow | null> {
  const previous = await getLatestLedgerRow(receipt.identity);
  const row: LedgerRow = {
    identity: receipt.identity,
    fingerprint: receipt.fingerprint,
    issued_at: receipt.issued_at,
  };
  const baseUrl = process.env.LEDGER_KV_URL?.trim();
  if (baseUrl) await setRedisRow(baseUrl, row);
  else await appendLocalRow(row);
  return previous;
}

function redisHeaders(): HeadersInit {
  const token = process.env.LEDGER_KV_TOKEN?.trim() ?? process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function redisKey(identity: string): string {
  return `warrant:ledger:${identity}`;
}

async function getRedisRow(baseUrl: string, identity: string): Promise<LedgerRow | null> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/get/${encodeURIComponent(redisKey(identity))}`, {
    headers: redisHeaders(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Ledger GET failed (${response.status})`);
  const body = (await response.json()) as { result?: string | null };
  return body.result ? (JSON.parse(body.result) as LedgerRow) : null;
}

async function setRedisRow(baseUrl: string, row: LedgerRow): Promise<void> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/set/${encodeURIComponent(redisKey(row.identity))}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...redisHeaders() },
    body: JSON.stringify(JSON.stringify(row)),
  });
  if (!response.ok) throw new Error(`Ledger SET failed (${response.status})`);
}

async function getLocalRow(identity: string): Promise<LedgerRow | null> {
  try {
    const content = await readFile(localLedgerPath, "utf8");
    let latest: LedgerRow | null = null;
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as LedgerRow;
      if (row.identity === identity) latest = row;
    }
    return latest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function appendLocalRow(row: LedgerRow): Promise<void> {
  await mkdir(path.dirname(localLedgerPath), { recursive: true });
  await appendFile(localLedgerPath, `${JSON.stringify(row)}\n`, "utf8");
}
