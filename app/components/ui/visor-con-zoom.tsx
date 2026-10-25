"use client";

/**
 * visor-con-zoom.tsx — una caja que enseña su contenido a un ancho elegible
 * (−, +, «Ajustar») y se desplaza por dentro. La pidió la boleta (PROMPT X): una
 * hoja horizontal se lee pequeña en un teléfono y el responsable prefirió zoom a
 * una versión «para móvil» de la hoja.
 *
 * Sin dominio (ORDEN §1, `ui/`, R-UX1): no sabe qué hay dentro. El zoom cambia el
 * ANCHO del contenido, no aplica `transform: scale`: así el contenido que mide en
 * unidades de contenedor (`cqw`) se redibuja nítido a cada tamaño, y el scroll
 * cubre exactamente lo que se ve. La página no gana scroll horizontal: lo tiene
 * esta caja.
 */
import { useState, type ReactNode } from "react";

const PASOS = [100, 125, 150, 200, 250] as const;

const CLASE_BOTON_ZOOM =
  "rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";

export function VisorConZoom({
  children,
  etiqueta,
  anchoMaximo = 1100,
}: {
  children: ReactNode;
  /** Para lectores de pantalla: qué se está ampliando. */
  etiqueta: string;
  /** Ancho, en px, del 100 % en pantallas grandes. En las pequeñas manda la caja. */
  anchoMaximo?: number;
}) {
  const [indice, setIndice] = useState(0);
  const pct = PASOS[indice];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-end gap-2" role="group" aria-label={`Zoom de ${etiqueta}`}>
        <button
          type="button"
          className={CLASE_BOTON_ZOOM}
          onClick={() => setIndice((i) => Math.max(0, i - 1))}
          disabled={indice === 0}
          aria-label="Alejar"
        >
          −
        </button>
        <span className="min-w-[3.5rem] text-center text-[11px] font-extrabold text-[var(--oc-muted)]" aria-live="polite">
          {pct} %
        </span>
        <button
          type="button"
          className={CLASE_BOTON_ZOOM}
          onClick={() => setIndice((i) => Math.min(PASOS.length - 1, i + 1))}
          disabled={indice === PASOS.length - 1}
          aria-label="Acercar"
        >
          +
        </button>
        <button type="button" className={CLASE_BOTON_ZOOM} onClick={() => setIndice(0)} disabled={indice === 0}>
          Ajustar
        </button>
      </div>
      <div className="max-h-[80vh] w-full overflow-auto rounded-xl" tabIndex={0} aria-label={etiqueta}>
        {/* El 100 % es el ancho de la caja, con tope en `anchoMaximo`; cada paso
            lo multiplica. Con `min()` el tope vale igual para todos los pasos. */}
        <div className="mx-auto" style={{ width: `calc(min(100%, ${anchoMaximo}px) * ${pct / 100})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
