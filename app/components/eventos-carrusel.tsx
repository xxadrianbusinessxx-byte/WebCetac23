"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagenEager } from "@/app/components/imagen-eager";
import type { EventoInicioConImagen } from "@/lib/escolar/eventos-inicio";

type Props = {
  eventos: readonly EventoInicioConImagen[];
  /** Más compacto en el perfil del alumno */
  compacto?: boolean;
};

export function EventosCarrusel({ eventos, compacto = false }: Props) {
  const [ampliada, setAmpliada] = useState<{
    url: string;
    slot: number;
  } | null>(null);

  const cerrar = useCallback(() => setAmpliada(null), []);

  useEffect(() => {
    if (!ampliada) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ampliada, cerrar]);

  if (!eventos.length) {
    return (
      <div
        className={`flex items-center justify-center rounded-[1.35rem] border border-sky-950/25 bg-linear-to-b from-sky-800/80 via-sky-900/90 to-sky-950/95 px-4 text-center text-xs font-bold uppercase tracking-widest text-sky-100/90 shadow-[inset_0_3px_0_rgba(255,255,255,0.12)] ${
          compacto ? "min-h-[100px]" : "min-h-[140px]"
        }`}
      >
        Sin eventos publicados aún
      </div>
    );
  }

  const alto = compacto
    ? "min-h-[140px] sm:min-h-[180px]"
    : "min-h-[180px] sm:min-h-[220px]";
  const ancho = compacto
    ? "min-w-[82%] sm:min-w-[68%]"
    : "min-w-[90%] sm:min-w-[75%] md:min-w-[62%]";

  return (
    <>
      <div
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-sky-700/50"
        role="region"
        aria-label="Eventos y noticias"
        tabIndex={0}
      >
        {eventos.map(({ slot, url }) => (
          <article
            key={`${slot}-${url}`}
            className={`${ancho} shrink-0 snap-center overflow-hidden rounded-[1.35rem] border border-sky-950/25 bg-sky-950/40 shadow-[0_8px_24px_rgba(2,6,23,0.25)] ${alto}`}
          >
            <button
              type="button"
              onClick={() => setAmpliada({ url, slot })}
              className="group relative flex h-full w-full cursor-zoom-in flex-col items-stretch focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              aria-label={`Ver imagen completa del evento ${slot}`}
            >
              <div className="relative min-h-0 flex-1 p-2">
                <ImagenEager
                  key={url}
                  src={url}
                  alt={`Evento ${slot}`}
                  fetchPriority={slot === eventos[0]?.slot ? "high" : "auto"}
                  decoding="async"
                  className="mx-auto h-full max-h-full w-full object-contain"
                />
              </div>
              <span className="mx-2 mb-2 rounded-full bg-sky-950/80 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white group-hover:bg-sky-800">
                Evento {slot} · Toca para ampliar
              </span>
            </button>
          </article>
        ))}
      </div>

      {ampliada && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Imagen del evento ${ampliada.slot}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/90 p-4 backdrop-blur-sm"
          onClick={cerrar}
        >
          <button
            type="button"
            onClick={cerrar}
            className="absolute right-4 top-4 rounded-full border border-white/40 bg-sky-900/90 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-sky-800"
          >
            Cerrar
          </button>
          <img
            src={ampliada.url}
            alt={`Evento ${ampliada.slot} ampliado`}
            className="max-h-[92vh] max-w-[96vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
