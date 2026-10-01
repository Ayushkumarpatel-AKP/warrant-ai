import React from "react";

/* ---------------- icons (inline SVG, no deps) ---------------- */
const s = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const mk = (path: React.ReactNode, box = 24) => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox={`0 0 ${box} ${box}`} {...s} {...props}>
      {path}
    </svg>
  );
  Icon.displayName = "Icon";
  return Icon;
};

export const IcoHome = mk(<path d="M4 11 12 4l8 7M6 10v9h12v-9" />);
export const IcoBolt = mk(<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />);
export const IcoList = mk(<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />);
export const IcoTarget = mk(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /></>);
export const IcoPlug = mk(<path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v6" />);
export const IcoGear = mk(<><circle cx="12" cy="12" r="3.1" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>);
export const IcoBell = mk(<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0" />);
export const IcoLogout = mk(<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />);
export const IcoBot = mk(<><rect x="5" y="8" width="14" height="10" rx="3" /><path d="M12 8V4M9 13h.01M15 13h.01M2 12v3M22 12v3" /></>);
export const IcoShield = mk(<path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />);
export const IcoSpark = mk(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />);
export const IcoSun = mk(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const IcoMoon = mk(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />);
export const IcoCheck = mk(<path d="M20 6 9 17l-5-5" />);
export const IcoMail = mk(<><rect x="3" y="5" width="18" height="14" rx="2.4" /><path d="m3.9 7.2 6.8 4.9a2.2 2.2 0 0 0 2.6 0l6.8-4.9" /></>);
export const IcoCopy = mk(<><rect x="9" y="9" width="11.4" height="11.4" rx="2.2" /><path d="M15 5.6A2.6 2.6 0 0 0 12.4 3H5.6A2.6 2.6 0 0 0 3 5.6v6.8A2.6 2.6 0 0 0 5.6 15" /></>);
export const IcoAlert = mk(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>);
export const IcoGoogle = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="18" height="18" viewBox="0 0 48 48" {...props}>
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8a10 10 0 0 1-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1Z" />
    <path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7A22 22 0 0 0 24 46Z" />
    <path fill="#FBBC05" d="M11.8 27.2a13 13 0 0 1 0-8.4v-5.7H4.5a22 22 0 0 0 0 19.8l7.3-5.7Z" />
    <path fill="#EA4335" d="M24 9.5c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3A22 22 0 0 0 4.5 13.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9Z" />
  </svg>
);

/* ---------------- avatar ---------------- */
export function Avatar({
  name = "?",
  src,
  size = 34,
}: {
  name?: string;
  src?: string;
  size?: number;
}) {
  const init = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  if (src)
    return <img className="avatar" src={src} width={size} height={size} alt={name} />;
  return (
    <span
      className="avatar avatar-init"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {init || "?"}
    </span>
  );
}
