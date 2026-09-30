import { strFromU8, strToU8, unzlibSync, zlibSync } from "fflate";

export const RECEIPT_VERSION = "warrant.receipt.v1" as const;

export type ReceiptControl = {
  trials: number;
  violations: number;
  upper_bound_95: number;
  attack_library_version: string;
  bound_scope: string;
};

export type AgentIdentity = {
  name: string;
  system_prompt?: string;
};

export type ReceiptPayload = {
  version: typeof RECEIPT_VERSION;
  identity: string;
  fingerprint: string;
  issued_at: string;
  previous_fingerprint?: string;
  supersedes?: string;
  head_sha?: string;
  controls: Record<string, ReceiptControl>;
  not_covered: string[];
  claim: string;
  key_note: string;
  public_key: string;
};

export type SignedReceipt = ReceiptPayload & {
  signature: string;
};

export type LedgerRow = {
  identity: string;
  fingerprint: string;
  issued_at: string;
};

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function receiptPayload(receipt: SignedReceipt): ReceiptPayload {
  const { signature: _signature, ...payload } = receipt;
  return payload;
}

export function encodeReceipt(receipt: SignedReceipt): string {
  const bytes = zlibSync(strToU8(JSON.stringify(receipt)), { level: 9 });
  return bytesToBase64Url(bytes);
}

export function decodeReceipt(encoded: string): SignedReceipt {
  const bytes = base64UrlToBytes(encoded);
  try {
    return JSON.parse(strFromU8(unzlibSync(bytes))) as SignedReceipt;
  } catch {
    return JSON.parse(strFromU8(bytes)) as SignedReceipt;
  }
}

export async function verifyReceiptSignature(receipt: SignedReceipt): Promise<boolean> {
  const publicKey = base64ToBytes(receipt.public_key);
  const signature = base64ToBytes(receipt.signature);
  const signed = new TextEncoder().encode(canonicalJson(receiptPayload(receipt)));
  for (const format of keyFormats(publicKey)) {
    try {
      const key = await crypto.subtle.importKey(format, publicKey, { name: "Ed25519" }, false, [
        "verify",
      ]);
      return await crypto.subtle.verify("Ed25519", key, signature, signed);
    } catch {
      continue;
    }
  }
  return false;
}

// Producers publish the key as 44-byte SPKI DER, but raw 32-byte keys are also
// accepted so previously issued receipts keep verifying.
function keyFormats(publicKey: Uint8Array): ("spki" | "raw")[] {
  return publicKey.byteLength === 32 ? ["raw", "spki"] : ["spki", "raw"];
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64ToBytes(value: string) {
  return base64UrlToBytes(value);
}
