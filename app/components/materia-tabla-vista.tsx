"use client";

import type { MateriaTablaVista } from "@/lib/escolar/types";

export function MateriaTablaVistaPanel({
  vista,
  materiaNombre,
  filaDestacada = -1,
}: {
  vista: MateriaTablaVista | null;
  materiaNombre: string;
  /** Índice de fila a resaltar (p. ej. fila del alumno en estatus). */
  filaDestacada?: number;
}) {
  if (!vista || !vista.filas.length) {
    return (
      <p className="text-sm font-semibold text-slate-700">
        {materiaNombre} — sin datos cargados. Sube un Excel para reemplazar el
        contenido de esta materia.
      </p>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs text-slate-800">
        <thead>
          <tr className="border-b border-white/50 bg-white/40">
            {vista.encabezados.map((h, i) => (
              <th key={`h-${i}`} className="px-2 py-2 font-extrabold uppercase">
                {h || `Col ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vista.filas.map((fila, ri) => (
            <tr
              key={`r-${ri}`}
              className={`border-b border-white/30 ${
                ri === filaDestacada
                  ? "bg-sky-200/55 ring-1 ring-inset ring-sky-500/40"
                  : ""
              }`}
            >
              {vista.encabezados.map((_, ci) => (
                <td key={`c-${ri}-${ci}`} className="px-2 py-1.5 font-medium">
                  {fila[ci] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
