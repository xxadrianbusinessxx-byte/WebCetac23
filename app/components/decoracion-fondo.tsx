/**
 * C4.27-E — Capas visuales del fondo global (Ocean Glass / PRYDA / Frutiger Aero).
 * Módulo decorativo independiente, montado UNA vez en el layout.
 * CSS puro: base, luz, glows, ribbons, sheen y burbujas/destellos sutiles.
 * No se acopla a ninguna página ni componente de negocio.
 */

/** Posiciones/tamaños de las burbujas (estático; el resto vive en CSS). */
const BURBUJAS: readonly { left: string; top: string; size: number }[] = [
  { left: "12%", top: "72%", size: 10 },
  { left: "26%", top: "44%", size: 6 },
  { left: "40%", top: "82%", size: 14 },
  { left: "55%", top: "56%", size: 5 },
  { left: "68%", top: "30%", size: 9 },
  { left: "82%", top: "68%", size: 12 },
  { left: "8%", top: "38%", size: 5 },
  { left: "33%", top: "18%", size: 8 },
  { left: "47%", top: "88%", size: 7 },
  { left: "62%", top: "74%", size: 16 },
  { left: "76%", top: "46%", size: 5 },
  { left: "90%", top: "22%", size: 8 },
];

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
      <div className="app-bg-sheen" />
      <div className="app-bg-bubbles">
        {BURBUJAS.map((b, i) => (
          <span
            key={i}
            className="app-bg-bubble"
            style={{
              left: b.left,
              top: b.top,
              width: `${b.size}px`,
              height: `${b.size}px`,
            }}
          />
        ))}
      </div>
      <div className="app-bg-vignette" />
    </div>
  );
}
