// Maya Research text-to-speech. Server-side only — the API key never reaches
// the browser; the /api/tts route proxies for it.
//
// Contract (verified against the live API, model "Maya 2 Native"):
//   POST https://tts.mayaresearch.ai/v1/tts
//   Authorization: Bearer <key>
//   { text, voice, language }
//   200 -> raw PCM, 16-bit little-endian, mono, 24 kHz
//          content-type: audio/L16; rate=24000; channels=1
//   400 -> JSON { error, available_voices | available_languages, request_id }

const ENDPOINT = "https://tts.mayaresearch.ai/v1/tts";

export const SAMPLE_RATE = 24000;

export const VOICES = ["Ananya", "Arjun"] as const;
export type Voice = (typeof VOICES)[number];

// "auto" lets Maya detect; the rest are the 11 supported languages.
export const LANGUAGES = [
  "auto", "en", "hi", "bn", "gu", "kn", "ml", "mr", "or", "pa", "ta", "te",
] as const;
export type Language = (typeof LANGUAGES)[number];

// A read-back is a confirmation, not an audiobook. Cap it so a runaway draft
// can't turn into a minute of synthesis (and a minute of billing).
export const MAX_CHARS = 1200;

export class MayaError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MayaError";
  }
}

export function isVoice(v: unknown): v is Voice {
  return typeof v === "string" && (VOICES as readonly string[]).includes(v);
}

export function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);
}

export type SpeakOptions = {
  voice?: Voice;
  language?: Language;
};

// Returns raw PCM bytes. Callers stream these straight to the browser, which
// converts to float samples and plays them through the Web Audio API — an
// <audio> element can't read headerless PCM.
export async function speak(
  text: string,
  { voice = "Ananya", language = "en" }: SpeakOptions = {}
): Promise<ArrayBuffer> {
  const key = process.env.MAYA_API_KEY;
  if (!key) {
    throw new MayaError(
      "MAYA_API_KEY is not set. Add it to .env.local to enable voice.",
      500
    );
  }

  const trimmed = text.trim();
  if (!trimmed) throw new MayaError("Nothing to speak.", 400);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text: trimmed.slice(0, MAX_CHARS),
      voice,
      language,
    }),
  });

  if (!res.ok) {
    // Maya reports parameter problems as JSON; surface its message rather than
    // a bare status, since "invalid 'language'" is the actionable part.
    let detail = `Maya TTS failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) detail = `Maya TTS: ${body.error}`;
    } catch {
      /* non-JSON error body — keep the status-only message */
    }
    throw new MayaError(detail, res.status);
  }

  return res.arrayBuffer();
}
