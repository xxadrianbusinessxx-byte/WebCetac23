"use client";

/**
 * portada-carrusel.tsx — el carrusel de la portada pública `/`. PROMPT O, 2026-09-24.
 *
 * Pinta las imágenes que dirección y el técnico suben en «Configuración → Video e
 * imágenes» (`portada-medios-panel.tsx`). La imagen ES el mensaje: lleva dentro el
 * lema, la visión y los valores tal como la escuela quiera presentarlos. Encima solo
 * va «Conoce nuestra oferta educativa», en el 25 % inferior que el panel pide dejar
 * libre (`ZONA_SEGURA` en `portada-puro.ts`).
 *
 * ── Proporción ─────────────────────────────────────────────────────────────
 * Escritorio 7:3. En teléfono, 4:5 SOLO si todas las imágenes tienen su versión
 * móvil: si una no la tiene, recortar una 7:3 a 4:5 se comería los laterales, así
 * que el carrusel entero se queda en 7:3 y usa SOLO las de escritorio (una 4:5 en
 * una caja 7:3 perdería arriba y abajo). La caja no cambia de alto al pasar de una
 * imagen a otra. En 7:3 y a lo ancho de un teléfono no caben el rótulo y los
 * puntos: se ocultan los puntos y quedan las flechas.
 *
 * ── Movimiento ─────────────────────────────────────────────────────────────
 * Avanza cada 6 s. Se detiene con el ratón encima, con el foco dentro y con
 * `prefers-reduced-motion` (entonces tampoco hay fundido). Flechas del teclado
 * con el foco en el carrusel.
 */
import { useCallback, useEffect, useState } from "react";
import type { ImagenPortada } from "@/lib/escolar/portada/portada";

const INTERVALO_MS = 6000;
/** El mismo corte que usa Tailwind para `md:`. */
const CONSULTA_MOVIL = "(max-width: 767px)";

type Props = { imagenes: Pick<ImagenPortada, "id" | "textoAlt" | "urlEscritorio" | "urlMovil">[] };

export function PortadaCarrusel({ imagenes }: Props) {
  const total = imagenes.length;
  const [actual, setActual] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [sinMovimiento, setSinMovimiento] = useState(false);
  const todasMoviles = imagenes.every((i) => i.urlMovil);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const alCambiar = () => setSinMovimiento(mq.matches);
    alCambiar();
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  const ir = useCallback((delta: number) => setActual((a) => (a + delta + total) % total), [total]);

  useEffect(() => {
    if (total < 2 || pausado || sinMovimiento) return;
    const t = window.setInterval(() => ir(1), INTERVALO_MS);
    return () => window.clearInterval(t);
  }, [total, pausado, sinMovimiento, ir, actual]);

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Portada del CETAC 23"
      tabIndex={0}
      className={`relative w-full overflow-hidden bg-[var(--oc-navy)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--oc-mint)] md:aspect-[7/3] ${
        todasMoviles ? "aspect-[4/5]" : "aspect-[7/3]"
      }`}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPausado(false);
      }}
      onKeyDown={(e) => {
        if (total < 2) return;
        if (e.key === "ArrowLeft") ir(-1);
        else if (e.key === "ArrowRight") ir(1);
      }}
    >
      <div aria-live={pausado || sinMovimiento ? "polite" : "off"}>
        {imagenes.map((img, i) => (
          <div
            key={img.id}
            role="group"
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${total}`}
            aria-hidden={i !== actual}
            className={`absolute inset-0 ${sinMovimiento ? "" : "transition-opacity duration-700"} ${
              i === actual ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <picture>
              {todasMoviles && img.urlMovil && <source media={CONSULTA_MOVIL} srcSet={img.urlMovil} />}
              {/* <img> y no next/image: <picture> lo exige, y Cloudinary ya entrega tamaño y formato (f_auto,q_auto,w_2400). */}
              <img
                src={img.urlEscritorio}
                alt={img.textoAlt}
                className="h-full w-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "auto"}
                decoding="async"
              />
            </picture>
          </div>
        ))}
      </div>

      {/* Zona segura inferior: el rótulo que lleva a la oferta. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[rgba(2,45,101,0.75)] to-transparent" />
      <a
        href="#oferta"
        className="absolute left-1/2 top-[84%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-4 py-2 text-lg font-light tracking-wide text-[var(--oc-text)] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] transition hover:text-white hover:underline sm:text-2xl lg:text-4xl"
      >
        Conoce nuestra oferta educativa
      </a>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => ir(-1)}
            aria-label="Imagen anterior"
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(2,45,101,0.45)] text-3xl font-bold text-white transition hover:bg-[rgba(2,45,101,0.75)] sm:left-4"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => ir(1)}
            aria-label="Imagen siguiente"
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(2,45,101,0.45)] text-3xl font-bold text-white transition hover:bg-[rgba(2,45,101,0.75)] sm:right-4"
          >
            ›
          </button>
          <div className={`absolute inset-x-0 bottom-3 justify-center gap-2 ${todasMoviles ? "flex" : "hidden md:flex"}`}>
            {imagenes.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setActual(i)}
                aria-label={`Ver imagen ${i + 1} de ${total}`}
                aria-current={i === actual}
                className={`h-2.5 rounded-full transition-all ${
                  i === actual ? "w-6 bg-white" : "w-2.5 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
