/**
 * C4.27-A/D — Capas visuales del fondo global (Ocean Glass / PRYDA).
 * CSS puro montado UNA vez en el layout; sin partículas ni burbujas PNG.
 */
export function DecoracionFondo() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div className="app-bg-base" />
      <div className="app-bg-glow app-bg-glow--a" />
      <div className="app-bg-glow app-bg-glow--b" />
      <div className="app-bg-glow app-bg-glow--c" />
      <div className="app-bg-glow app-bg-glow--d" />
      <div className="app-bg-light" />
      <div className="app-bg-ribbon app-bg-ribbon--1" />
      <div className="app-bg-ribbon app-bg-ribbon--2" />
      <div className="app-bg-ribbon app-bg-ribbon--3" />
      <div className="app-bg-ribbon app-bg-ribbon--4" />
      <div className="app-bg-vignette" />
    </div>
  );
}
