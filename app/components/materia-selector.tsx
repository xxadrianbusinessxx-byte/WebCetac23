"use client";

import { useId, useMemo, useState } from "react";
import { normalizarNombre } from "@/lib/escolar/nombres";
import type { MateriaConNombreVisible } from "@/lib/escolar/nombres-visibles";

type Props = {
  /** Materias con identidad + nombre visible (idInterno = tabla real). */
  materias: readonly MateriaConNombreVisible[];
  /** idInterno seleccionado (nombre real de la tabla). */
  seleccionada: string;
  onSeleccionar: (idInterno: string) => void;
  /** Muestra el ID técnico debajo del nombre visible (profesor/directivo). */
  mostrarIdTecnico?: boolean;
  titulo?: string;
  buscarPlaceholder?: string;
  className?: string;
};

/**
 * Selector de materias tipo PANEL LATERAL / LISTA (sustituye al <select
 * size={6}> que provocaba misclicks). Cada opción tiene mínimo 48px de alto,
 * buscador y agrupación visual por grado. Mantiene la estética Frutiger
 * Aero / glassmorphism del resto del sistema.
 *
 * IMPORTANTE: `seleccionada` y `onSeleccionar` trabajan SIEMPRE con el
 * idInterno (nombre real de la tabla Supabase). El nombre visible es solo
 * presentación y se muestra como texto principal.
 */
export function MateriaSelector({
  materias,
  seleccionada,
  onSeleccionar,
  mostrarIdTecnico = false,
  titulo = "Materias",
  buscarPlaceholder = "Buscar materia…",
  className = "",
}: Props) {
  const idBusqueda = useId();
  const [busqueda, setBusqueda] = useState("");

  const grupos = useMemo(() => {
    const q = normalizarNombre(busqueda);

    const filtradas = q
      ? materias.filter((m) => {
          const visible = normalizarNombre(m.nombreVisible);
          const asignatura = normalizarNombre(m.asignatura);
          const tecnico = normalizarNombre(m.idInterno);
          return (
            visible.includes(q) ||
            asignatura.includes(q) ||
            tecnico.includes(q)
          );
        })
      : [...materias];

    const mapa = new Map<string, MateriaConNombreVisible[]>();
    for (const m of filtradas) {
      const g = m.grado || "General";
      const arr = mapa.get(g) ?? [];
      arr.push(m);
      mapa.set(g, arr);
    }
    return [...mapa.entries()];
  }, [busqueda, materias]);

  return (
    <aside
      aria-label={titulo}
      className={`flex w-full flex-col rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md ${className}`}
    >
      <p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-widest text-sky-900">
        {titulo}
      </p>

      <div className="relative mb-3">
        <label className="sr-only" htmlFor={idBusqueda}>
          Buscar materia
        </label>
        <input
          id={idBusqueda}
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={buscarPlaceholder}
          className="w-full rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-[11px] font-bold text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-sky-400/50"
        />
      </div>

      <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1 lg:max-h-[28rem]">
        {grupos.length === 0 ? (
          <p className="px-1 py-2 text-center text-xs font-semibold text-slate-600">
            Sin coincidencias.
          </p>
        ) : (
          grupos.map(([grado, items]) => (
            <div key={grado} className="flex flex-col gap-1.5">
              <p className="px-1 pb-0.5 text-[10px] font-extrabold uppercase tracking-widest text-sky-800/80">
                {grado}
              </p>
              {items.map((m) => {
                const activa = m.idInterno === seleccionada;
                return (
                  <button
                    key={m.idInterno}
                    type="button"
                    onClick={() => onSeleccionar(m.idInterno)}
                    aria-pressed={activa}
                    className={`flex min-h-12 w-full flex-col justify-center rounded-2xl border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
                      activa
                        ? "border-sky-500/60 bg-sky-100/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(14,165,233,0.18)]"
                        : "border-white/60 bg-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] hover:border-sky-300/70 hover:bg-white/70"
                    }`}
                  >
                    <span className="text-[11px] font-extrabold uppercase leading-snug tracking-wide text-sky-900">
                      {m.nombreVisible}
                    </span>
                    {mostrarIdTecnico && (
                      <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        {m.idInterno}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
