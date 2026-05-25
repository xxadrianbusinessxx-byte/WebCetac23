import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarIndiceRegistroAlumno,
  criterioTieneBusqueda,
  registroDbACeldasParaBusqueda,
  tokenBusquedaNombreEnTabla,
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
  return registroDbACeldasParaBusqueda(row, columnas);
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

  const token = tokenBusquedaNombreEnTabla(criterio);
  let query = supabase.from(tabla).select("*").order("id", { ascending: true });

  if (token && columnasDb.some((c) => c.toLowerCase() === "alumno_nombre")) {
    query = query.ilike("alumno_nombre", `%${token}%`);
  }

  const { data: candidatas, error } = await query;

  let todas: Record<string, unknown>[] = (candidatas ??
    []) as Record<string, unknown>[];

  if (error || !todas.length) {
    const { data: todasDb, error: err2 } = await supabase
      .from(tabla)
      .select("*")
      .order("id", { ascending: true });
    if (err2 || !todasDb?.length) return null;
    todas = todasDb as Record<string, unknown>[];
  }

  const colsDatos = columnasDesdeFilasDb(columnasDb, todas);
  if (!colsDatos.length) return null;

  const encabezados = [
    "Alumno",
    ...colsDatos.map((c, i) => encabezadoColumna(c, i)),
  ];

  const filasDb: Record<string, unknown>[] = [];
  const filasCeldas: string[][] = [];
  for (const row of todas) {
    const celdas = registroDbACeldas(row, colsDatos);
    if (filaTieneDatos(celdas)) {
      filasDb.push(row);
      filasCeldas.push(celdas);
    }
  }
  if (!filasCeldas.length) return null;

  const filasMostrar: string[][] = filasCeldas
    .slice(0, FILAS_ENCABEZADO_REGISTRO)
    .map((c) => [...c]);

  let filaAlumnoIndice = -1;
  let alumnoEncontrado = false;

  if (
    criterioTieneBusqueda(criterio) &&
    filasDb.length > FILAS_ENCABEZADO_REGISTRO
  ) {
    let filaIdx = buscarIndiceRegistroAlumno(
      filasDb,
      colsDatos,
      criterio,
      FILAS_ENCABEZADO_REGISTRO,
    );

    if (filaIdx < 0 && token) {
      const { data: todasDb, error: errFull } = await supabase
        .from(tabla)
        .select("*")
        .order("id", { ascending: true });
      if (!errFull && todasDb?.length) {
        todas = todasDb as Record<string, unknown>[];
        filasDb.length = 0;
        filasCeldas.length = 0;
        for (const row of todas) {
          const celdas = registroDbACeldas(row, colsDatos);
          if (filaTieneDatos(celdas)) {
            filasDb.push(row);
            filasCeldas.push(celdas);
          }
        }
        filaIdx = buscarIndiceRegistroAlumno(
          filasDb,
          colsDatos,
          criterio,
          FILAS_ENCABEZADO_REGISTRO,
        );
      }
    }

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
