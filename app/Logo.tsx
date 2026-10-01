/* ================================================================
   Warrant brand marks — purpose-built SVG, no icon-font dependency.
   WarrantMark  : the logo (shield + verified seal + canary dot)
   ReceiptSeal  : hero illustration of a signed safety receipt
   ================================================================ */

/** The wordmark glyph. Inherits currentColor so it works on amber or navy. */
export function WarrantMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 2.4 4.6 5.3v6.1c0 4.6 3.1 8 7.4 9.9 4.3-1.9 7.4-5.3 7.4-9.9V5.3L12 2.4Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m8.4 12.1 2.6 2.6 5-5.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18.4" cy="6.1" r="2.1" fill="currentColor" />
    </svg>
  );
}

/**
 * Hero panel art: the deterministic referee. A canary radar sweeping for
 * planted secrets, with a sealed receipt at the centre. Deliberately
 * data-viz rather than decoration — it shows what the product does.
 */
export function ReceiptSeal(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 400 210" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id="ws-shield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1B2CC1" />
          <stop offset="100%" stopColor="#091540" />
        </linearGradient>
        <radialGradient id="ws-sweep" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#FA8112" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FA8112" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ws-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FA8112" stopOpacity="0" />
          <stop offset="100%" stopColor="#FA8112" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      {/* radar rings */}
      <g stroke="#7692FF" strokeOpacity="0.34">
        <circle cx="118" cy="105" r="82" />
        <circle cx="118" cy="105" r="58" />
        <circle cx="118" cy="105" r="34" />
      </g>
      <circle cx="118" cy="105" r="82" fill="url(#ws-sweep)" />

      {/* sweeping beam */}
      <g transform="translate(118 105)">
        <path d="M0 0 L78 -30 A84 84 0 0 1 82 8 Z" fill="url(#ws-beam)" opacity="0.5">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 0 0"
            to="360 0 0"
            dur="6s"
            repeatCount="indefinite"
          />
        </path>
      </g>

      {/* canary hits */}
      <circle cx="76" cy="72" r="3.4" fill="#FA8112">
        <animate attributeName="opacity" values="1;0.25;1" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="150" cy="140" r="3.4" fill="#FA8112">
        <animate attributeName="opacity" values="1;0.25;1" dur="3.1s" repeatCount="indefinite" />
      </circle>
      <circle cx="164" cy="66" r="3.4" fill="#ABD2FA" />
      <circle cx="86" cy="146" r="3.4" fill="#ABD2FA" />

      {/* sealed shield badge */}
      <g transform="translate(268 105)">
        <circle r="56" fill="#FFFCF4" stroke="#FA8112" strokeOpacity="0.35" />
        <circle r="56" fill="none" stroke="#FA8112" strokeOpacity="0.2" strokeDasharray="4 7" />
        <path
          d="M0 -30 22 -19.6v15.2C22 6.4 12.4 15.4 0 21c-12.4-5.6-22-14.6-22-25.4v-15.2L0-30Z"
          fill="url(#ws-shield)"
        />
        <path
          d="m-10.5 1.4 7.4 7.4L12.4-3.6"
          stroke="#ABD2FA"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>

      {/* receipt ticks */}
      <g stroke="#222222" strokeOpacity="0.3" strokeLinecap="round">
        <path d="M228 52h-26" />
        <path d="M228 66h-16" />
        <path d="M228 144h-20" />
        <path d="M228 158h-30" />
      </g>
    </svg>
  );
}
