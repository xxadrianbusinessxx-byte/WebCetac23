import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarIndiceFilaAlumno,
  type CriterioAlumnoEnFila,
} from "./buscar-en-filas";
import { columnasParaVista, listarColumnasTabla } from "./schema-tabla";
import type { MateriaTablaVista } from "./types";

const MARCAS_HOJA = new Set(["__HOJA__", "__ENCABEZADOS__"]);

function filaValida(nombre: string): boolean {
  const n = nombre.trim();
  return Boolean(n && !MARCAS_HOJA.has(n));
}

function registroAFila(
  row: Record<string, unknown>,
  columnasDatos: string[],
): string[] {
  const otras = columnasDatos.filter((c) => c !== "alumno_nombre");
  return [
    String(row.alumno_nombre ?? "").trim(),
    ...otras.map((c) => String(row[c] ?? "").trim()),
  ];
}

export type VistaRegistroEstatus = {
  vista: MateriaTablaVista;
  filaAlumnoIndice: number;
  alumnoEncontrado: boolean;
};

/**
 * Registro de calificaciones finales: primeras 5 filas + fila del alumno si no está en el top 5.
 * Consulta ligera (id + nombre) y luego solo las filas a mostrar.
 */
export async function leerVistaRegistroEstatus(
  supabase: SupabaseClient,
  nombreTabla: string,
  criterio: CriterioAlumnoEnFila,
): Promise<VistaRegistroEstatus | null> {
  const tabla = nombreTabla.trim();
  const columnasDb = await listarColumnasTabla(tabla);
  const colsDatos = columnasParaVista(columnasDb);
  const otras = colsDatos.filter((c) => c !== "alumno_nombre");
  const encabezados = ["Alumno", ...otras];

  const { data: indice, error: errIdx } = await supabase
    .from(tabla)
    .select("id, alumno_nombre")
    .order("id", { ascending: true });

  if (errIdx || !indice?.length) return null;

  const filasValidas = indice.filter((r) =>
    filaValida(String(r.alumno_nombre ?? "")),
  );
  if (!filasValidas.length) return null;

  let idsMostrar = filasValidas.slice(0, 5).map((r) => r.id as number);
  let filaAlumnoIndice = -1;
  let alumnoEncontrado = false;

  if (criterio.curp?.trim() || criterio.nombreCompleto?.trim()) {
    const nombreFilas = filasValidas.map((r) => [
      String(r.alumno_nombre ?? "").trim(),
    ]);
    const idx = buscarIndiceFilaAlumno(nombreFilas, criterio);

    if (idx >= 0) {
      alumnoEncontrado = true;
      if (idx < 5) {
        filaAlumnoIndice = idx;
      } else {
        filaAlumnoIndice = 4;
        idsMostrar = [
          ...filasValidas.slice(0, 4).map((r) => r.id as number),
          filasValidas[idx]!.id as number,
        ];
      }
    }
  }

  const { data: rows, error: errRows } = await supabase
    .from(tabla)
    .select("*")
    .in("id", idsMostrar);

  if (errRows || !rows?.length) return null;

  const porId = new Map(
    rows.map((r) => [r.id as number, r as Record<string, unknown>]),
  );
  const filasMostrar = idsMostrar
    .map((id) => porId.get(id))
    .filter((r): r is Record<string, unknown> => Boolean(r))
    .map((r) => registroAFila(r, colsDatos));

  return {
    vista: { encabezados, filas: filasMostrar },
    filaAlumnoIndice,
    alumnoEncontrado,
  };
}
