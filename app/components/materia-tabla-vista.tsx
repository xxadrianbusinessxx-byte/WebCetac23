"use client";

import type { CategoriaColumnaCalificaciones } from "@/lib/escolar/columnas-calificaciones";
import type { MateriaTablaVista } from "@/lib/escolar/types";

/** Tinte sutil por categoría semántica (mantiene la estética del sistema). */
const TINTE_CATEGORIA: Record<CategoriaColumnaCalificaciones, string> = {
  alumno: "bg-sky-200/50",
  curp: "bg-slate-200/50",
  actividad: "bg-sky-100/60",
  parcial: "bg-indigo-100/60",
  promedio: "bg-emerald-100/60",
  final: "bg-emerald-200/60",
  asistencia: "bg-amber-100/60",
  auxiliar: "bg-slate-100/60",
  desconocida: "bg-slate-200/40",
};

export function MateriaTablaVistaPanel({
  vista,
  materiaNombre,
  filaDestacada = -1,
  mostrarDetalleColumnas = false,
}: {
  vista: MateriaTablaVista | null;
  materiaNombre: string;
  /** Índice de fila a resaltar (p. ej. fila del alumno en estatus). */
  filaDestacada?: number;
  /**
   * Profesor/directivo: muestra el encabezado real de la columna (diagnóstico)
   * y marca las columnas duplicadas. El alumno ve solo la etiqueta amigable.
   */
  mostrarDetalleColumnas?: boolean;
}) {
  if (!vista || !vista.filas.length) {
    return (
      <p className="text-sm font-semibold text-slate-700">
        {materiaNombre} — sin datos cargados. Sube un Excel para reemplazar el
        contenido de esta materia.
      </p>
    );
  }

  const columnas = vista.columnasIdentificadas ?? [];

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs text-slate-800">
        <thead>
          <tr className="border-b border-white/50 bg-white/40">
            {vista.encabezados.map((h, i) => {
              const info = columnas[i];
              const categoria = info?.categoria ?? "desconocida";
              const esDuplicada = Boolean(info?.duplicado);
              const original = info?.encabezadoOriginal;
              return (
                <th
                  key={`h-${i}`}
                  className={`px-2 py-2 font-extrabold uppercase ${
                    TINTE_CATEGORIA[categoria]
                  } ${esDuplicada ? "bg-amber-200/70 text-amber-900" : ""}`}
                  title={
                    esDuplicada
                      ? "Columna duplicada en el archivo original"
                      : undefined
                  }
                >
                  <span className="flex flex-col">
                    <span>{h}</span>
                    {mostrarDetalleColumnas && original && original !== h && (
                      <span className="text-[8px] font-semibold normal-case tracking-normal text-slate-500">
                        {original}
                      </span>
                    )}
                    {esDuplicada && (
                      <span className="text-[9px] font-extrabold">
                        ⚠ Duplicada
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
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
              {fila.map((celda, ci) => (
                <td key={`c-${ri}-${ci}`} className="px-2 py-1.5 font-medium">
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
