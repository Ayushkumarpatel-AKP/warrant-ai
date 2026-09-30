/** @type {import('next').NextConfig} */

// Security headers for every route.
//
// CSP notes — what is deliberately allowed and why:
//   default-src 'self'          no third-party scripts, styles, or frames.
//   script-src 'self' 'unsafe-inline' 'unsafe-eval'
//     Next.js injects inline bootstrap scripts, and `next dev` evaluates
//     generated code for React Fast Refresh, so both keywords are required for
//     the app to run at all. Dropping 'unsafe-eval' breaks dev; dropping
//     'unsafe-inline' breaks the app in both modes. A nonce-based policy
//     (per-request nonce threaded through middleware.ts) is the real fix and
//     needs middleware cooperation, so it is noted here rather than faked.
//   style-src 'self' 'unsafe-inline'
//     Tailwind plus the inline style attributes several views set.
//   img-src 'self' data: blob:   receipt QR codes are generated client-side as
//     data: URLs; avatars and pasted images can be blob: URLs.
//   media-src 'self' blob:        the TTS read-back streams PCM from /api/tts
//     and is played through the Web Audio API, which uses blob: URLs.
//   connect-src 'self' https: ws: wss:
//     Same-origin API calls, plus 'https:' for the hosted model/TTS gateways
//     and ws:/wss: for the dev server's HMR socket.
//   No upgrade-insecure-requests: it would rewrite the http://localhost dev
//     origin and break local runs.
//
// Permissions-Policy note: microphone is ALLOWED for the same origin
// (`microphone=(self)`), NOT blocked. The scenario composer and the live-call
// screen both use browser dictation (SpeechRecognition / getUserMedia); Firefox
// and Safari refuse to capture when the policy disables the microphone, so
// `microphone=()` would ship a dead Dictate button. Everything else that could
// prompt the user is switched off.

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // strict-origin-when-cross-origin, not no-referrer: a /verify/<fingerprint>
  // link carries the entire signed receipt in its ?receipt= query string, and
  // no-referrer would strip even the same-origin referrer that page relies on.
  // This still keeps the query string out of every cross-origin request.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(self), payment=(), usb=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
