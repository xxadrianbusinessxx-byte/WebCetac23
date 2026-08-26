"use client";

import type { MateriaTablaVista } from "@/lib/escolar/types";

type FilaSemantica = { etiqueta: string; valor: string };

function GrupoCalificaciones({
  titulo,
  items,
}: {
  titulo: string;
  items: FilaSemantica[];
}) {
  if (!items.length) return null;
  return (
    <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-4">
      <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-widest text-sky-900">
        {titulo}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li
            key={`${it.etiqueta}-${i}`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/80 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]"
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-sky-900">
              {it.etiqueta}
            </span>
            <span className="text-sm font-extrabold text-sky-950">
              {it.valor || "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * BLOQUE 7B — Presentación de calificaciones para el ALUMNO.
 *
 * Recibe una vista ya preparada por `actionObtenerVistaMateria`:
 *   - contiene SOLO la fila del alumno (la seguridad y el filtrado por CURP o
 *     nombre normalizado ocurren en el servidor);
 *   - contiene SOLO columnas relevantes (actividad, parcial, promedio, final),
 *     ordenadas y con etiquetas amigables.
 *
 * Muestra una tarjeta cómoda en vez de una tabla gigante. Responsive.
 */
export function MateriaCalificacionesAlumno({
  vista,
  materiaNombre,
}: {
  vista: MateriaTablaVista | null;
  materiaNombre: string;
}) {
  if (!vista || !vista.filas.length) {
    return (
      <p className="w-full text-center text-sm font-semibold text-slate-700">
        {materiaNombre} — aún no hay calificaciones registradas para ti en esta
        materia.
      </p>
    );
  }

  const columnas = vista.columnasIdentificadas ?? [];
  const fila = vista.filas[0] ?? [];

  const actividades: FilaSemantica[] = [];
  const parciales: FilaSemantica[] = [];
  const resultado: FilaSemantica[] = [];

  columnas.forEach((c, i) => {
    const valor = i < fila.length ? fila[i] : "";
    if (c.categoria === "actividad") {
      actividades.push({ etiqueta: c.etiqueta, valor });
    } else if (c.categoria === "parcial") {
      parciales.push({ etiqueta: c.etiqueta, valor });
    } else if (c.categoria === "promedio" || c.categoria === "final") {
      resultado.push({ etiqueta: c.etiqueta, valor });
    }
  });

  const sinDatosRelevantes =
    actividades.length === 0 && parciales.length === 0 && resultado.length === 0;

  if (sinDatosRelevantes) {
    return (
      <p className="w-full text-center text-sm font-semibold text-slate-700">
        No hay calificaciones relevantes para mostrar en {materiaNombre}.
      </p>
    );
  }

  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
      <GrupoCalificaciones titulo="Actividades" items={actividades} />
      <GrupoCalificaciones titulo="Evaluaciones" items={parciales} />
      {resultado.length > 0 && (
        <div className="sm:col-span-2">
          <GrupoCalificaciones titulo="Resultado" items={resultado} />
        </div>
      )}
    </div>
  );
}
