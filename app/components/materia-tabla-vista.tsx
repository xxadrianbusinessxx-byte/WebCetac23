"use client";

import type { MateriaTablaVista } from "@/lib/escolar/types";

export function MateriaTablaVistaPanel({
  vista,
  materiaNombre,
  filaDestacada = -1,
  vacioTexto,
  vistaCompleta = false,
}: {
  vista: MateriaTablaVista | null;
  materiaNombre: string;
  filaDestacada?: number;
  vacioTexto?: string;
  /** Ocupa todo el ancho/alto del contenedor (panel directivo/profesor). */
  vistaCompleta?: boolean;
}) {
  const mensajeVacio =
    vacioTexto ??
    `${materiaNombre} — sin datos en esta tabla. Elige un archivo y pulsa «Cargar a la base».`;

  if (!vista || !vista.filas.length) {
    return (
      <p className="text-sm font-semibold text-slate-700">{mensajeVacio}</p>
    );
  }

  return (
    <div
      className={`w-full overflow-auto ${
        vistaCompleta ? "max-h-[min(52vh,28rem)] flex-1" : ""
      }`}
    >
      <table className="min-w-full border-collapse text-left text-xs text-slate-800">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-white/50 bg-white/70 backdrop-blur-sm">
            {vista.encabezados.map((h, i) => (
              <th
                key={`h-${i}`}
                className="whitespace-nowrap px-2 py-2 font-extrabold uppercase"
              >
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
                <td
                  key={`c-${ri}-${ci}`}
                  className="max-w-[14rem] truncate px-2 py-1.5 font-medium whitespace-nowrap"
                  title={fila[ci] ?? ""}
                >
                  {fila[ci] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] font-semibold text-slate-600">
        {vista.filas.length} fila{vista.filas.length === 1 ? "" : "s"} en la
        tabla
      </p>
    </div>
  );
}
