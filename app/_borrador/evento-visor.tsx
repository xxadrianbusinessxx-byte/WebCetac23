"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * FASE 7 (6A-1) — Visor de noticias del login.
 *
 * Convierte la imagen de un evento en un botón que abre un modal LIGHTBOX
 * SOLO cuando el usuario hace click (lazy: el modal no se monta en el render
 * inicial, por lo que el LCP del login no se ve afectado).
 *
 * Reutiliza la MISMA URL que ya cargó la miniatura (el navegador la sirve de
 * su caché HTTP) → NO se descarga una segunda imagen al abrir.
 *
 * Accesibilidad: `role="dialog"` + `aria-modal`, botón de cerrar, cierre con
 * Escape, foco movido al diálogo al abrir y restaurado al cerrar, `alt`
 * descriptivo y bloqueo de scroll de fondo mientras está abierto.
 */
export function EventoConVisor({
  url,
  label,
}: {
  url: string | null;
  label: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const botonRef = useRef<HTMLButtonElement>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => setAbierto(false), []);

  // Foco, Escape y scroll lock mientras el visor está abierto (solo cliente).
  useEffect(() => {
    if (!abierto) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cerrarRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setAbierto(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [abierto]);

  if (!url) {
    return (
      <div className="flex min-h-[140px] flex-1 items-center justify-center rounded-[1.35rem] border border-sky-950/25 bg-linear-to-b from-sky-800/80 via-sky-900/90 to-sky-950/95 px-4 py-8 text-center text-xs font-bold uppercase tracking-widest text-sky-100/90 shadow-[inset_0_3px_0_rgba(255,255,255,0.12)]">
        {label}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        ref={botonRef}
        onClick={abrir}
        aria-label={`Ver imagen completa: ${label}`}
        className="group relative min-h-[140px] flex-1 overflow-hidden rounded-[1.35rem] border border-sky-950/25 text-left shadow-[0_8px_24px_rgba(2,6,23,0.25)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        <Image
          src={url}
          alt={label}
          fill
          className="object-cover transition duration-300 group-hover:scale-[1.02] group-focus-visible:scale-[1.02]"
          sizes="(max-width: 1024px) 100vw, 33vw"
          unoptimized
        />
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Imagen completa: ${label}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/85 p-4 backdrop-blur-sm sm:p-8"
          onClick={cerrar}
        >
          <div
            className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-[1.5rem] border border-white/40 bg-sky-950/70 shadow-[0_24px_80px_rgba(2,6,23,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end p-2">
              <button
                type="button"
                ref={cerrarRef}
                onClick={cerrar}
                aria-label="Cerrar imagen"
                className="rounded-full border border-white/50 bg-white/90 px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-sky-900 shadow transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                Cerrar
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={label}
              className="max-h-[80dvh] w-full object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
