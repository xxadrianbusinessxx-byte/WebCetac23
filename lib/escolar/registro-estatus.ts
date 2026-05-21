import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarAlumnoEnMatriz,
  type CriterioAlumnoEnFila,
} from "./buscar-en-filas";
import {
  columnasDesdeFilasDb,
  listarColumnasTabla,
} from "./schema-tabla";
import type { MateriaTablaVista } from "./types";

const MARCAS_HOJA = new Set(["__HOJA__", "__ENCABEZADOS__"]);

/** Filas fijas de encabezado del registro (semestre, carrera, grupo, columnas, parciales). */
export const FILAS_ENCABEZADO_REGISTRO = 5;

function encabezadoColumna(nombre: string, indice: number): string {
  const t = nombre.trim();
  if (t && t.toLowerCase() !== "alumno_nombre") return t;
  return `Col ${indice + 1}`;
}

function filaTieneDatos(celdas: string[]): boolean {
  return celdas.some((c) => {
    const t = c.trim();
    return t && !MARCAS_HOJA.has(t);
  });
}

function registroDbACeldas(
  row: Record<string, unknown>,
  columnas: string[],
): string[] {
  return columnas.map((col) => String(row[col] ?? "").trim());
}

export type VistaRegistroEstatus = {
  vista: MateriaTablaVista;
  filaAlumnoIndice: number;
  alumnoEncontrado: boolean;
};

/**
 * Registro de calificaciones finales:
 * - Siempre las primeras 5 filas (encabezados del Excel).
 * - Debajo, la fila completa del alumno (nombre + parciales alineados con las columnas).
 * - La búsqueda solo en filas de datos (después de la 5).
 */
export async function leerVistaRegistroEstatus(
  supabase: SupabaseClient,
  nombreTabla: string,
  criterio: CriterioAlumnoEnFila,
): Promise<VistaRegistroEstatus | null> {
  const tabla = nombreTabla.trim();
  const columnasDb = await listarColumnasTabla(tabla);

  const { data: todas, error } = await supabase
    .from(tabla)
    .select("*")
    .order("id", { ascending: true });

  if (error || !todas?.length) return null;

  const colsDatos = columnasDesdeFilasDb(
    columnasDb,
    todas as Record<string, unknown>[],
  );
  if (!colsDatos.length) return null;

  const encabezados = colsDatos.map((c, i) => encabezadoColumna(c, i));

  const filasCeldas: string[][] = [];
  for (const row of todas) {
    const celdas = registroDbACeldas(row as Record<string, unknown>, colsDatos);
    if (filaTieneDatos(celdas)) filasCeldas.push(celdas);
  }
  if (!filasCeldas.length) return null;

  const filasMostrar: string[][] = filasCeldas
    .slice(0, FILAS_ENCABEZADO_REGISTRO)
    .map((c) => [...c]);

  let filaAlumnoIndice = -1;
  let alumnoEncontrado = false;

  const tieneCriterio =
    Boolean(criterio.curp?.trim()) || Boolean(criterio.nombreCompleto?.trim());

  if (tieneCriterio && filasCeldas.length > FILAS_ENCABEZADO_REGISTRO) {
    const { filaIdx } = buscarAlumnoEnMatriz(
      filasCeldas,
      criterio,
      FILAS_ENCABEZADO_REGISTRO,
    );

    if (filaIdx >= FILAS_ENCABEZADO_REGISTRO) {
      alumnoEncontrado = true;
      filaAlumnoIndice = filasMostrar.length;
      filasMostrar.push([...filasCeldas[filaIdx]!]);
    }
  }

  return {
    vista: { encabezados, filas: filasMostrar },
    filaAlumnoIndice,
    alumnoEncontrado,
  };
}
