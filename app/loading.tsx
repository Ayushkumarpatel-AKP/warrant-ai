/* Loading state for the dashboard shell. It mirrors the shape of the screen
   that is coming — bar, title block, two cards — so the layout settles in one
   step instead of jumping once the real content arrives. */
export default function Loading() {
  return (
    <main className="shell" aria-busy="true" aria-live="polite">
      <div className="skel" style={{ width: "100%", maxWidth: 520 }}>
        <div className="skel-line w40" />
        <div className="skel-line w70" />
        <div className="skel-line tall" />
        <div className="skel-line tall" />
        <p className="shell-loading">
          <span className="spin" aria-hidden="true" /> Loading Warrant…
        </p>
      </div>
    </main>
  );
}
