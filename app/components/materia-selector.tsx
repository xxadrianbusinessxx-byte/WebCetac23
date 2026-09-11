"use client";

import { useId, useMemo, useState } from "react";
import {
  aplicarFiltro,
  etiquetaCarrera,
  facetasDisponibles,
  FILTRO_AMBITO_VACIO,
  hayFiltroActivo,
  sanearFiltro,
  type FiltroAmbito,
} from "@/lib/escolar/materia/facetas-materia";
import type { MateriaConNombreVisible } from "@/lib/escolar/materia/nombres-visibles";

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
  /**
   * C4.19 — inicia COLAPSADO (no renderiza la lista) y muestra un botón
   * "Ver catálogo completo" / "No ver nada". Para catálogos grandes
   * (perfil de alumno/padre con cientos de materias) y evitar cargar todo
   * el árbol de nodos de golpe.
   */
  iniciarColapsado?: boolean;
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
  buscarPlaceholder = "Buscar materia (ej. 3RO MC A)…",
  className = "",
  iniciarColapsado = false,
}: Props) {
  const idBusqueda = useId();
  const [busqueda, setBusqueda] = useState("");
  // C4.28 — el filtrado por grado / grupo / carrera y el buscador son una
  // decisión PURA y viven en `lib/escolar/materia/facetas-materia.ts`. Aquí NO
  // queda ninguna copia inline (R6): el módulo conserva las dos reglas que ya
  // tenía este selector — una materia SIN GRADO no se muestra nunca («General»,
  // activo por defecto) y el buscador encuentra por IDENTIDAD, así que «1RO A MC»
  // sigue localizando la materia sin saberse su nombre.
  // El value de cada opción sigue siendo el idInterno (tabla física).
  const [filtro, setFiltro] = useState<FiltroAmbito>(FILTRO_AMBITO_VACIO);
  const [abierto, setAbierto] = useState(!iniciarColapsado);

  // Las facetas se calculan sobre la lista COMPLETA (lo hace el módulo): si se
  // recalcularan sobre lo ya filtrado, elegir un grado vaciaría el selector de
  // grupos y el usuario no podría volver atrás.
  const facetas = useMemo(() => facetasDisponibles(materias), [materias]);

  const grupos = useMemo(() => {
    if (!abierto) return [];
    const filtradas = aplicarFiltro(materias, filtro, busqueda);

    const mapa = new Map<string, MateriaConNombreVisible[]>();
    for (const m of filtradas) {
      const g = m.grado || "General";
      const arr = mapa.get(g) ?? [];
      arr.push(m);
      mapa.set(g, arr);
    }
    return [...mapa.entries()];
  }, [abierto, busqueda, filtro, materias]);

  /** Cambia una faceta: pasa por `sanearFiltro` para no quedarse en un valor
   *  que ya no existe en la lista. */
  function cambiarFaceta(parcial: Partial<FiltroAmbito>) {
    setFiltro((f) => sanearFiltro(materias, { ...f, ...parcial }));
  }

  return (
    <aside
      aria-label={titulo}
      className={`flex w-full flex-col rounded-3xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3 ${className}`}
    >
      <p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
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
          className="w-full rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-3 py-2 text-[11px] font-bold text-[var(--oc-text)] outline-none placeholder:text-[var(--oc-muted)] focus:border-[var(--oc-border-active)]"
        />
      </div>

      {iniciarColapsado && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="mb-2 w-full rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110"
        >
          {abierto ? "No ver nada (ocultar catálogo)" : "Ver catálogo completo"}
        </button>
      )}

      {!abierto ? (
        <p className="px-1 py-2 text-center text-xs font-semibold text-[var(--oc-muted)]">
          Catálogo oculto por eficiencia. Pulsa «Ver catálogo completo» para
          cargarlo.
        </p>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-3 gap-1.5">
            <select
              value={filtro.grado ?? ""}
              onChange={(e) => cambiarFaceta({ grado: e.target.value || null })}
              aria-label="Filtrar por grado"
              title="Filtrar por grado"
              className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-2 py-1.5 text-[10px] font-bold text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
            >
              <option value="">Grado: todos</option>
              {facetas.grados.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              value={filtro.grupo ?? ""}
              onChange={(e) => cambiarFaceta({ grupo: e.target.value || null })}
              aria-label="Filtrar por grupo"
              title="Filtrar por grupo"
              className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-2 py-1.5 text-[10px] font-bold text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
            >
              <option value="">Grupo: todos</option>
              {facetas.grupos.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              value={filtro.carrera ?? ""}
              onChange={(e) => cambiarFaceta({ carrera: e.target.value || null })}
              aria-label="Filtrar por carrera"
              title="Filtrar por carrera"
              className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-2 py-1.5 text-[10px] font-bold text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
            >
              <option value="">Carrera: todas</option>
              {facetas.carreras.map((c) => (
                <option key={c} value={c}>
                  {etiquetaCarrera(c)}
                </option>
              ))}
            </select>
          </div>
          {hayFiltroActivo(filtro) && (
            <button
              type="button"
              onClick={() => setFiltro(FILTRO_AMBITO_VACIO)}
              className="mb-2 w-full rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110"
            >
              Limpiar filtros (grado · grupo · carrera)
            </button>
          )}
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1 lg:max-h-[28rem]">
        {grupos.length === 0 ? (
          <p className="px-1 py-2 text-center text-xs font-semibold text-[var(--oc-muted)]">
            Sin coincidencias.
          </p>
        ) : (
          grupos.map(([grado, items]) => (
            <div key={grado} className="flex flex-col gap-1.5">
              <p className="px-1 pb-0.5 text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
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
                    className={`flex min-h-12 w-full flex-col justify-center rounded-2xl border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oc-border-active)] ${
                      activa
                        ? "border-[var(--oc-border-active)] bg-[var(--oc-surface)]"
                        : "border-[var(--oc-border)] bg-transparent hover:bg-[var(--oc-surface)]"
                    }`}
                  >
                    <span className="text-[11px] font-extrabold uppercase leading-snug tracking-wide text-[var(--oc-text)]">
                      {m.nombreVisible}
                    </span>
                    {mostrarIdTecnico && (
                      <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--oc-muted)]">
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
        </>
      )}
    </aside>
  );
}
