import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarIndiceRegistroAlumno,
  nombreAlumnoDesdeRegistroDb,
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

const PATRON_ENCABEZADO =
  /^(NOMBRE|NO\.?\s*CONTROL|PARCIAL|PROMEDIO|CLAVE|MATERIA|CALIFIC)/i;

function etiquetaColumna(nombre: string, indice: number): string {
  const t = nombre.trim();
  if (!t || t.toLowerCase() === "alumno_nombre") return "Alumno";
  return t;
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

function esFilaEncabezadoMateria(celdas: string[]): boolean {
  let hits = 0;
  for (const c of celdas) {
    const t = c.trim();
    if (!t) continue;
    if (PATRON_ENCABEZADO.test(t)) hits++;
    if (/^PARCIAL\s*\d/i.test(t) || t === "PROMEDIO") hits++;
  }
  return hits >= 2 || celdas.some((c) => /^NOMBRE$/i.test(c.trim()));
}

function esFilaMetadatoPlantel(celdas: string[]): boolean {
  const texto = celdas.join(" ").toUpperCase();
  const esMeta =
    texto.includes("SEMESTRE") ||
    texto.includes("CARRERA:") ||
    texto.includes("GRUPO:");
  if (!esMeta) return false;
  return !celdas.some((c) => c.trim().split(/\s+/).length >= 3);
}

function filaPareceAlumno(
  row: Record<string, unknown>,
  colsDatos: string[],
): boolean {
  const n = nombreAlumnoDesdeRegistroDb(row) || String(row[colsDatos[0] ?? ""] ?? "").trim();
  return n.split(/\s+/).length >= 3 && !/^NOMBRE$/i.test(n);
}

function tablaPareceSoloFilasAlumno(
  rows: Record<string, unknown>[],
  colsDatos: string[],
): boolean {
  const muestra = rows.slice(0, 12);
  if (!muestra.length) return false;
  const alumnos = muestra.filter((r) => filaPareceAlumno(r, colsDatos)).length;
  return alumnos >= Math.max(1, Math.ceil(muestra.length * 0.5));
}

function encabezadosDesdeFilaExcel(
  fila: string[],
  colsDatos: string[],
): string[] {
  return fila.map((c, j) => {
    const t = c.trim();
    if (t) return t;
    return etiquetaColumna(colsDatos[j] ?? "", j);
  });
}

/**
 * Vista materia: encabezados de columnas + solo la fila del alumno.
 * Prioriza columna `alumno_nombre` y orden distinto de apellidos/nombre.
 */
export async function leerVistaMateriaAlumno(
  supabase: SupabaseClient,
  nombreMateria: string,
  criterio: CriterioAlumnoEnFila,
): Promise<MateriaTablaVista | null> {
  const tabla = nombreMateria.trim();
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

  const soloAlumnos = tablaPareceSoloFilasAlumno(todas, colsDatos);

  let filaEncabezadosExcel: string[] | null = null;
  if (!soloAlumnos) {
    for (const row of todas) {
      const celdas = registroDbACeldas(row, colsDatos);
      if (filaTieneDatos(celdas) && esFilaEncabezadoMateria(celdas)) {
        filaEncabezadosExcel = celdas;
      }
    }
  }

  const encabezados = filaEncabezadosExcel
    ? encabezadosDesdeFilaExcel(filaEncabezadosExcel, colsDatos)
    : ["Alumno", ...colsDatos.map((c, j) => etiquetaColumna(c, j))];

  const omitirEncabezado = (row: Record<string, unknown>, cols: string[]) => {
    const celdas = registroDbACeldas(row, cols);
    return esFilaEncabezadoMateria(celdas) || esFilaMetadatoPlantel(celdas);
  };

  let idx = buscarIndiceRegistroAlumno(
    todas,
    colsDatos,
    criterio,
    0,
    omitirEncabezado,
  );

  if (idx < 0 && token) {
    const { data: todasDb, error: errFull } = await supabase
      .from(tabla)
      .select("*")
      .order("id", { ascending: true });
    if (!errFull && todasDb?.length) {
      todas = todasDb as Record<string, unknown>[];
      idx = buscarIndiceRegistroAlumno(
        todas,
        colsDatos,
        criterio,
        0,
        omitirEncabezado,
      );
    }
  }

  const filaAlumno =
    idx >= 0 ? registroDbACeldas(todas[idx]!, colsDatos) : null;

  return {
    encabezados,
    filas: filaAlumno ? [filaAlumno] : [],
  };
}
