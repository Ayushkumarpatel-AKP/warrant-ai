// Browser-side speech: dictation in, Maya audio out.
//
// Maya has no speech-to-text, so dictation uses the browser's built-in
// SpeechRecognition (Chrome and Edge; absent in Firefox and Safari). Every
// caller must handle the unsupported case — the composer falls back to typing.
//
// Playback can't use an <audio> element: Maya returns headerless PCM, so we
// convert to float samples and push them through the Web Audio API.

/* ---------- dictation (speech -> text) ---------- */

// Minimal shape of the Web Speech API; TS's DOM lib doesn't ship it reliably.
type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: SpeechRecognitionResultLike;
  };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isDictationSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export type DictationHandlers = {
  // Fires continuously while speaking: the settled text so far, plus the
  // in-flight phrase the engine hasn't committed to yet.
  onTranscript: (settled: string, interim: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
};

export type Dictation = { stop: () => void };

const ERRORS: Record<string, string> = {
  "not-allowed":
    "Microphone access was blocked. Allow it in your browser's site settings and try again.",
  "service-not-allowed":
    "Microphone access was blocked. Allow it in your browser's site settings and try again.",
  "no-speech": "I didn't catch anything — try again a bit closer to the mic.",
  "audio-capture":
    "No microphone found. Check that one is connected and selected.",
  network: "The speech service could not be reached. Check your connection.",
  aborted: "",
};

export function startDictation(
  lang: string,
  { onTranscript, onError, onEnd }: DictationHandlers
): Dictation | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = true; // keep listening through natural pauses
  rec.interimResults = true;

  let settled = "";
  let stopped = false;

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const text = r[0]?.transcript ?? "";
      if (r.isFinal) settled += text;
      else interim += text;
    }
    onTranscript(settled.trim(), interim.trim());
  };

  rec.onerror = (e) => {
    const msg = ERRORS[e.error] ?? `Dictation error: ${e.error}`;
    if (msg) onError(msg);
  };

  rec.onend = () => {
    // Chrome ends the session on its own after a silence; restart unless the
    // user asked to stop, so a thinking pause doesn't cut them off.
    if (stopped) {
      onEnd();
      return;
    }
    try {
      rec.start();
    } catch {
      onEnd();
    }
  };

  try {
    rec.start();
  } catch (err) {
    onError((err as Error).message);
    return null;
  }

  return {
    stop() {
      stopped = true;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

/* ---------- playback (Maya PCM -> speakers) ---------- */

let ctx: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;

function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

export function stopPlayback() {
  if (playing) {
    try {
      playing.stop();
    } catch {
      /* already finished */
    }
    playing = null;
  }
}

// Plays raw 16-bit little-endian mono PCM. Resolves when playback finishes,
// or immediately if it is superseded by a later call.
export async function playPcm(
  data: ArrayBuffer,
  sampleRate = 24000
): Promise<void> {
  stopPlayback();

  // An odd byte length would misalign every sample after the truncation point.
  const usable = data.byteLength - (data.byteLength % 2);
  if (usable <= 0) return;

  const pcm = new Int16Array(data, 0, usable / 2);
  const floats = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) floats[i] = pcm[i] / 32768;

  const audio = audioContext();
  // Browsers suspend the context until a user gesture unlocks it.
  if (audio.state === "suspended") await audio.resume();

  const buffer = audio.createBuffer(1, floats.length, sampleRate);
  buffer.copyToChannel(floats, 0);

  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  playing = source;

  await new Promise<void>((resolve) => {
    source.onended = () => {
      if (playing === source) playing = null;
      resolve();
    };
    source.start();
  });
}

// Fetches speech from the server-side Maya proxy and plays it.
export async function speakAloud(
  text: string,
  opts: { voice?: string; language?: string } = {}
): Promise<void> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...opts }),
  });

  if (!res.ok) {
    let message = `Voice failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep the status-only message */
    }
    throw new Error(message);
  }

  await playPcm(await res.arrayBuffer());
}
