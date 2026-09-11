"use client";

import type { CategoriaColumnaCalificaciones } from "@/lib/escolar/materia/columnas-calificaciones";
import type { MateriaTablaVista } from "@/lib/escolar/types";

/**
 * Tinte por categoría semántica. En el tema Océano NO hay un token por color de
 * categoría y un hex literal en un componente reabre la deuda D11, así que el
 * encabezado se pinta con la superficie de campo (`--oc-input`) y la jerarquía
 * la da el texto. El mapa se conserva para poder re-tintar por categoría cuando
 * existan tokens semánticos; el aviso de columna DUPLICADA sí mantiene su
 * estado (`--oc-alert-text`).
 */
const TINTE_CATEGORIA: Record<CategoriaColumnaCalificaciones, string> = {
  alumno: "bg-[var(--oc-input)]",
  curp: "bg-[var(--oc-input)]",
  actividad: "bg-[var(--oc-input)]",
  parcial: "bg-[var(--oc-input)]",
  promedio: "bg-[var(--oc-input)]",
  final: "bg-[var(--oc-input)]",
  asistencia: "bg-[var(--oc-input)]",
  auxiliar: "bg-[var(--oc-input)]",
  desconocida: "bg-[var(--oc-input)]",
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
      <p className="text-sm font-semibold text-[var(--oc-muted)]">
        {materiaNombre} — sin datos cargados. Sube un Excel para reemplazar el
        contenido de esta materia.
      </p>
    );
  }

  const columnas = vista.columnasIdentificadas ?? [];

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs text-[var(--oc-text)]">
        <thead>
          <tr className="border-b border-[var(--oc-border)] bg-[var(--oc-input)]">
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
                  } ${esDuplicada ? "text-[var(--oc-alert-text)]" : ""}`}
                  title={
                    esDuplicada
                      ? "Columna duplicada en el archivo original"
                      : undefined
                  }
                >
                  <span className="flex flex-col">
                    <span>{h}</span>
                    {mostrarDetalleColumnas && original && original !== h && (
                      <span className="text-[8px] font-semibold normal-case tracking-normal text-[var(--oc-muted)]">
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
              className={`border-b border-[var(--oc-border)] ${
                ri === filaDestacada
                  ? "bg-[var(--oc-input)] ring-1 ring-inset ring-[var(--oc-border-active)]"
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
