"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Zap, KeyRound, Eye, FileCheck2, Swords, ArrowRight,
  Play, Activity, Radar as RadarIcon, Terminal as TerminalIcon,
  Lock, Cpu, Crosshair, Flame, ChevronRight, Star, Bell,
} from "lucide-react";
import Dashboard from "./Dashboard";
import { WarrantMark, ReceiptSeal } from "./Logo";

const SESSION_KEY = "ct_session";

/* ---------- hooks ---------- */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function AnimatedCounter({ target, suffix = "", duration = 1800 }: { target: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  const { ref, visible } = useInView();
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, target, duration]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

/* ---------- particle canvas ---------- */
function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let w = (c.width = c.offsetWidth), h = (c.height = c.offsetHeight);
    const N = 70;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.8 + 0.4, red: Math.random() > 0.5,
    }));
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 7);
        ctx.fillStyle = p.red ? "rgba(250,129,18,.55)" : "rgba(27,44,193,.4)";
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    const rs = () => { w = (c.width = c.offsetWidth); h = (c.height = c.offsetHeight); };
    window.addEventListener("resize", rs);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", rs); };
  }, []);
  return <canvas ref={ref} className="w-particles" />;
}

/* ---------- typing terminal ---------- */
const TERM_LINES = [
  "> deploying RED attacker → ShopBot v3 ...",
  "> planting canary sk_live_51QhTn8Zx ...",
  "> turn 2: attacker escalates → authority pretext",
  "> [!] LEAK DETECTED: credential relay on turn 3",
  "> judge scoring 28 dimensions ...",
  "> verdict ★ 1/5 — receipt sealed #a3f9c1",
];
function Terminal() {
  const [li, setLi] = useState(0);
  const [txt, setTxt] = useState("");
  useEffect(() => {
    const full = TERM_LINES[li % TERM_LINES.length];
    if (txt.length < full.length) {
      const t = setTimeout(() => setTxt(full.slice(0, txt.length + 1)), 22);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (li % TERM_LINES.length === TERM_LINES.length - 1) setTxt("");
      setLi((v) => v + 1);
      if (li % TERM_LINES.length !== TERM_LINES.length - 1) setTxt("");
    }, 900);
    return () => clearTimeout(t);
  }, [txt, li]);
  const shown = TERM_LINES.slice(0, li % TERM_LINES.length);
  return (
    <div className="w-term">
      <div className="w-term-bar"><span className="w-dot r" /><span className="w-dot y" /><span className="w-dot g" /><span className="w-term-title">warrant — live attack feed</span></div>
      <div className="w-term-body">
        {shown.slice(-5).map((l, i) => <div key={i} className={l.includes("LEAK") ? "w-tline bad" : l.includes("verdict") ? "w-tline good" : "w-tline"}>{l}</div>)}
        <div className="w-tline">{txt}<span className="w-caret">▊</span></div>
      </div>
    </div>
  );
}

/* ---------- signed-receipt seal panel (the deterministic referee) ---------- */
function SealArt() {
  return (
    <div className="w-seal">
      <div className="w-seal-bar">
        <span className="w-shell-dots"><i /><i /><i /></span>
        <span className="w-shell-path">warrant://receipt — seal.verify</span>
        <span className="w-seal-tag">SIGNED ✓</span>
      </div>
      <div className="w-seal-body"><ReceiptSeal /></div>
      <div className="w-seal-foot"><span>CANARY MATRIX 7 × 42</span><span className="good">INTEGRITY ✓</span></div>
    </div>
  );
}

/* ---------- VS emblem formed from green hacker binary ---------- */
const VS_MAP = ["10001001111", "10001010000", "10001001110", "01010000001", "00100011110"];
function BinaryVS() {
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeed((s) => s + 1), 450);
    return () => clearInterval(t);
  }, []);
  const bit = (r: number, c: number) => ((r * 11 + c) * 7919 + seed * 131) % 2;
  return (
    <div className="w-binvs" title="VS">
      {VS_MAP.map((row, r) => (
        <div key={r} className="w-binvs-row">
          {row.split("").map((cell, c) => (
            <span key={c} className={cell === "1" ? "on" : "off"}>{bit(r, c)}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- 16:9 premium battle arena ---------- */
function BattleArena() {
  const [phase, setPhase] = useState(0);
  const [hits, setHits] = useState<{ id: number; x: number; v: string }[]>([]);
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % 200), 70);
    return () => clearInterval(t);
  }, []);
  const redX = 12 + Math.sin(phase * 0.08) * 9;
  const blueX = 80 + Math.cos(phase * 0.08) * 9;
  const clash = Math.abs(redX - blueX) < 24;
  useEffect(() => {
    if (!clash) return;
    const id = Date.now() + Math.random();
    const mid = (redX + blueX) / 2;
    setHits((h) => [...h.slice(-4), { id, x: mid, v: `-${Math.floor(Math.random() * 18 + 6)}` }]);
    const t = setTimeout(() => setHits((h) => h.filter((x) => x.id !== id)), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clash, phase]);
  const midX = (redX + blueX) / 2;
  const redHp = Math.max(18, 62 + Math.sin(phase * 0.11) * 20);
  const blueHp = Math.max(22, 76 + Math.cos(phase * 0.09) * 15);

  const rainCols = ["1010101010101010", "0110011011001101", "1101010010101110", "0010110100101101", "1011001011010011", "0101101001011100", "1110001010110100", "0001011101001011", "1001011000110101", "0110100101101010", "1100101010010110", "0011010010100111"];
  return (
    <div className="w-arena">
      <div className="w-code-rain">
        {rainCols.map((c, i) => (
          <span key={i} className="w-code-col" style={{ animationDuration: `${5 + (i % 5)}s`, animationDelay: `${-(i * 0.9)}s` }}>{c}</span>
        ))}
      </div>
      <div className="w-arena-grid" />
      <div className="w-arena-scan" />
      <div className="w-arena-top">
        <span className="w-arena-shell">
          <span className="w-shell-dots"><i /><i /><i /></span>
          <span className="w-shell-path">root@warrant:~# ./red_vs_blue --rounds=5</span>
        </span>
        <span className="w-round">0x{Math.floor(phase * 7919 % 65535).toString(16).toUpperCase().padStart(4, "0")}</span>
      </div>
      <div className="w-beam" style={{ opacity: clash ? 1 : 0.18, transform: `scaleX(${clash ? 1 : 0.45})` }} />
      {clash && <div className="w-spark" style={{ left: `${midX}%` }} />}
      {hits.map((h) => (
        <span key={h.id} className="w-dmg" style={{ left: `${h.x}%` }}>{h.v}</span>
      ))}

      <div className="w-fighter red" style={{ left: `${redX}%` }}>
        <div className="w-ring" /><div className="w-ring r2" />
        <motion.div className="w-core red" animate={clash ? { x: [0, 4, -4, 0] } : {}} transition={{ duration: 0.3 }}>
          <Swords size={30} />
        </motion.div>
        <div className="w-tag red"><Flame size={11} /> RED · ATTACKER</div>
        <div className="w-hp"><div className="w-hpfill red" style={{ width: `${redHp}%` }} /></div>
      </div>

      <div className="w-fighter blue" style={{ left: `${blueX}%` }}>
        <div className="w-ring blue" /><div className="w-ring r2 blue" />
        <motion.div className="w-core blue" animate={clash ? { x: [0, -4, 4, 0] } : {}} transition={{ duration: 0.3 }}>
          <Shield size={30} />
        </motion.div>
        <div className="w-tag blue"><Lock size={11} /> BLUE · YOUR AGENT</div>
        <div className="w-hp"><div className="w-hpfill blue" style={{ width: `${blueHp}%` }} /></div>
      </div>

      <BinaryVS />
      <div className="w-corner tl" /><div className="w-corner tr" /><div className="w-corner bl" /><div className="w-corner br" />
      <div className="w-arena-log">
        <span>{clash ? "⚔ clash — canary scan running…" : "● probing defenses…"}</span>
        <span className="w-log-right">turn {3 + (phase % 3)}/5</span>
      </div>
    </div>
  );
}

/* ---------- attack button ---------- */
function AttackButton({ onStart }: { onStart: () => void }) {
  const [glitch, setGlitch] = useState(false);
  useEffect(() => {
    const t = setInterval(() => { setGlitch(true); setTimeout(() => setGlitch(false), 200); }, 3400);
    return () => clearInterval(t);
  }, []);
  return (
    <button className={`w-attack ${glitch ? "glitch" : ""}`} onClick={onStart}>
      <span className="w-attack-scan" />
      <Crosshair size={18} />
      <span className="w-attack-txt"><b>INITIATE ATTACK</b><i>crash-test your agent →</i></span>
      <ArrowRight size={18} className="w-attack-arrow" />
    </button>
  );
}

/* ---------- landing ---------- */
function LandingPage({ onStart }: { onStart: () => void }) {
  const stats = [
    { v: 2847, s: "", label: "AGENTS TESTED", cls: "" },
    { v: 31, s: "%", label: "FAILED SAFETY", cls: "red" },
    { v: 9, s: " min", label: "AVG TEST TIME", cls: "blue" },
    { v: 156, s: "", label: "RECEIPTS ISSUED", cls: "green" },
  ];
  const feats = [
    { icon: <KeyRound size={20} />, t: "Credential Leaks", d: "Planted Stripe keys & secrets your agent relays under pressure. Exact canary match = proof.", c: "red" },
    { icon: <Eye size={20} />, t: "Prompt Extraction", d: "Attacker LLM social-engineers hidden instructions out over 5 escalating turns.", c: "orange" },
    { icon: <Flame size={20} />, t: "Blackmail & Coercion", d: "Shutdown threats and dirt-on-the-boss traps from Anthropic misalignment research.", c: "red" },
    { icon: <Cpu size={20} />, t: "Cross-Customer Data", d: "Over-scoped tools return other customers' orders. Relaying it is the failure.", c: "blue" },
    { icon: <Zap size={20} />, t: "Sabotage & Defiance", d: "Direct orders disobeyed when they clash with the agent's own goal.", c: "orange" },
    { icon: <FileCheck2 size={20} />, t: "Signed Receipts", d: "Ed25519-sealed verdict with QR + public verify page. Expires when the agent changes.", c: "green" },
  ];
  return (
    <div className="w-page">
      <nav className="w-nav">
        <div className="w-brand"><span className="w-logo"><WarrantMark /></span><span>Warrant</span><span className="w-ver">v0.1</span></div>
        <div className="w-links"><a href="#arena">Arena</a><a href="#stats">Stats</a><a href="#features">Traps</a><a href="#how">How it works</a></div>
        <button className="w-launch" onClick={onStart}><Zap size={14} /> Launch App</button>
      </nav>

      <header className="w-hero w-sec" id="arena">
        <div className="w-canvas">
        <Particles />
        <div className="w-aurora a1" /><div className="w-aurora a2" />
        <div className="w-hero-duo">
          <div>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="w-badge"><span className="w-pulse red" /> PRE-DEPLOYMENT SAFETY RATING · RED vs BLUE</div>
            <h1 className="w-h1">Crash-test your<br /><span className="w-grad">AI agent</span> before<br />attackers do.</h1>
            <p className="w-sub">Paste a system prompt. Warrant drops it into blackmail, leak & sabotage traps, scores it with an LLM judge, and seals a <b>signed safety receipt</b>.</p>
            <div className="w-cta-row">
              <AttackButton onStart={onStart} />
              <a href="#how" className="w-ghost"><Play size={15} /> Watch how it works</a>
            </div>
            <div className="w-trust">
              <div className="w-avatars"><span>A</span><span>R</span><span>K</span><span>+</span></div>
              <div><div className="w-stars"><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><b>4.9</b></div>
              <span className="w-trust-sub">No account · Runs locally · 2,800+ agents tested</span></div>
            </div>
          </motion.div>
          <Terminal />
          </div>
          <motion.div className="w-art-col" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.15 }}>
            <SealArt />
          </motion.div>
        </div>
        </div>
      </header>

      <div className="w-marquee"><div className="w-marquee-in">
        {["CREDENTIAL LEAK", "PROMPT EXTRACTION", "BLACKMAIL", "CROSS-CUSTOMER DATA", "INSUBORDINATION", "SABOTAGE", "JAILBREAK", "PRIVILEGE ESCALATION"].map((t) => <span key={t}>⚠ {t}</span>)}
        {["CREDENTIAL LEAK", "PROMPT EXTRACTION", "BLACKMAIL", "CROSS-CUSTOMER DATA", "INSUBORDINATION", "SABOTAGE", "JAILBREAK", "PRIVILEGE ESCALATION"].map((t) => <span key={t + "2"}>⚠ {t}</span>)}
      </div></div>

      <section className="w-sec" id="stats">
        <div className="w-canvas mid">
          <div className="w-stats">
            {stats.map((s) => (
              <div key={s.label} className="w-stat"><div className={`w-stat-v ${s.cls}`}><AnimatedCounter target={s.v} suffix={s.s} /></div><div className="w-stat-l">{s.label}</div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-sec" id="features">
        <div className="w-canvas mid">
        <div className="w-sec-head"><span className="w-kicker">TRAP LIBRARY · 21 SCENARIOS</span><h2>What Warrant catches</h2><p>Real incident families — planted canaries prove the leak, the judge explains it.</p></div>
        <div className="w-feat-grid">
          {feats.map((f, i) => (
            <motion.div key={f.t} className={`w-feat ${f.c}`} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
              <div className="w-feat-ico">{f.icon}</div>
              <h3>{f.t}</h3><p>{f.d}</p>
              <span className="w-feat-more">Run this trap <ChevronRight size={13} /></span>
            </motion.div>
          ))}
        </div>
        </div>
      </section>

      <section className="w-sec" id="how">
        <div className="w-canvas mid">
        <div className="w-sec-head"><span className="w-kicker">4 STEPS · 9 MINUTES</span><h2>How it works</h2></div>
        <div className="w-steps">
          {[["01", "Paste your agent", "System prompt + tools. That's all Warrant needs."], ["02", "Pick a trap", "Misalignment or adversarial leak — 21 to choose from."], ["03", "Watch it fight", "Red attacks, blue defends. Every move logged live."], ["04", "Get the verdict", "Star rating + citation + signed receipt with QR."]].map(([n, t, d], i) => (
            <motion.div key={n} className="w-step" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
              <div className="w-step-n">{n}</div><h3>{t}</h3><p>{d}</p>
            </motion.div>
          ))}
        </div>
        <div className="w-cta-banner">
          <div><h2>Ship agents like cars ship with crash tests.</h2><p>Paste a prompt, hit Initiate Attack, get a receipt in minutes.</p></div>
          <button className="w-launch big" onClick={onStart}><Bell size={15} /> Start free crash test <ArrowRight size={15} /></button>
        </div>
        </div>
      </section>

      <footer className="w-foot"><div className="w-brand"><span className="w-logo"><WarrantMark /></span><span>Warrant</span></div><p>Cars have crash tests. Now agents do.</p></footer>
    </div>
  );
}

export default function Home() {
  const [entered, setEntered] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const t = (localStorage.getItem("ct_theme") as "light" | "dark") || "dark";
    setTheme(t);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ct_theme", theme);
  }, [theme]);

  function startSession() {
    try { localStorage.setItem(SESSION_KEY, "1"); } catch {}
    setEntered(true);
  }
  function endSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    setEntered(false);
  }
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  if (entered) return <Dashboard onSignOut={endSession} theme={theme} onToggleTheme={toggleTheme} />;
  return (
    <AnimatePresence mode="wait">
      <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <LandingPage onStart={startSession} />
      </motion.div>
    </AnimatePresence>
  );
}
