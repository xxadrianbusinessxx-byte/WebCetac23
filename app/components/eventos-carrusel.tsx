"use client";

import { ImagenEager } from "@/app/components/imagen-eager";
import type { EventoInicioConImagen } from "@/lib/escolar/eventos-inicio";

type Props = {
  eventos: readonly EventoInicioConImagen[];
  /** Más compacto en el perfil del alumno */
  compacto?: boolean;
};

export function EventosCarrusel({ eventos, compacto = false }: Props) {
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

  const alto = compacto ? "min-h-[120px] sm:min-h-[140px]" : "min-h-[160px] sm:min-h-[180px]";
  const ancho = compacto
    ? "min-w-[78%] sm:min-w-[62%]"
    : "min-w-[88%] sm:min-w-[72%] md:min-w-[58%]";

  return (
    <div
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-sky-700/50"
      role="region"
      aria-label="Eventos y noticias"
      tabIndex={0}
    >
      {eventos.map(({ slot, url }) => (
        <article
          key={`${slot}-${url}`}
          className={`${ancho} shrink-0 snap-center overflow-hidden rounded-[1.35rem] border border-sky-950/25 shadow-[0_8px_24px_rgba(2,6,23,0.25)] ${alto}`}
        >
          <div className="relative h-full w-full">
            <ImagenEager
              key={url}
              src={url}
              alt={`Evento ${slot}`}
              fetchPriority={slot === eventos[0]?.slot ? "high" : "auto"}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute bottom-2 left-2 rounded-full bg-sky-950/75 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
              Evento {slot}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
