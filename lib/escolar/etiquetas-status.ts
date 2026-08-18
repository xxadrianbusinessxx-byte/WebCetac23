import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreCompletoAlumno } from "./alumnos";
import { archivoCsvAFilas } from "./csv";
import {
  STATUS_COL_CURP,
  STATUS_FILAS_MATERIAS,
  STATUS_FILAS_PROMEDIO,
  STATUS_TODAS_COLUMNAS_DATO,
} from "./etiquetas-schema";
import { TABLA_ETIQUETAS_STATUS } from "./tables";
import type { AlumnoRow } from "./types";

export type EtiquetasStatusRow = Record<string, string | number | null | undefined>;

export type VistaEstatusAlumno = {
  promedios: Record<(typeof STATUS_FILAS_PROMEDIO)[number], string>;
  materias: Record<(typeof STATUS_FILAS_MATERIAS)[number], string>;
};

function quoteCol(nombre: string): string {
  return /[^a-zA-Z0-9_]/.test(nombre) ? `"${nombre}"` : nombre;
}

function buildSelectStatus(): string {
  const cols = [STATUS_COL_CURP, ...STATUS_TODAS_COLUMNAS_DATO].map(quoteCol);
  return cols.join(", ");
}

function celdaAString(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function parseNumeroPromedio(v: unknown): number | null {
  const t = celdaAString(v).replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (Number.isNaN(n) || n < 0 || n > 10) return null;
  return n;
}

/** Promedio principal para alumnos estrella (columna Promedio o el más alto del ciclo). */
export function promedioDesdeFilaStatus(row: EtiquetasStatusRow | null): number {
  if (!row) return 0;
  const principal = parseNumeroPromedio(row[STATUS_FILAS_PROMEDIO[0]]);
  if (principal != null) return principal;

  let mejor = 0;
  for (const col of STATUS_FILAS_PROMEDIO) {
    const n = parseNumeroPromedio(row[col]);
    if (n != null && n > mejor) mejor = n;
  }
  return mejor;
}

export function vistaEstatusDesdeFila(
  row: EtiquetasStatusRow | null,
): VistaEstatusAlumno {
  const promedios = {} as VistaEstatusAlumno["promedios"];
  const materias = {} as VistaEstatusAlumno["materias"];

  for (const k of STATUS_FILAS_PROMEDIO) {
    promedios[k] = celdaAString(row?.[k]) || "—";
  }
  for (const k of STATUS_FILAS_MATERIAS) {
    materias[k] = celdaAString(row?.[k]) || "—";
  }
  return { promedios, materias };
}

export async function obtenerEtiquetasStatusPorCurp(
  supabase: SupabaseClient,
  curp: string,
): Promise<EtiquetasStatusRow | null> {
  const curpU = curp.trim().toUpperCase();
  const select = buildSelectStatus();

  const { data, error } = await supabase
    .from(TABLA_ETIQUETAS_STATUS)
    .select(select)
    .eq(STATUS_COL_CURP, curpU)
    .maybeSingle();

  if (!error && data) return data as unknown as EtiquetasStatusRow;

  const { data: todas, error: err2 } = await supabase
    .from(TABLA_ETIQUETAS_STATUS)
    .select("*")
    .limit(5000);

  if (err2 || !todas?.length) return null;

  for (const fila of todas as unknown as EtiquetasStatusRow[]) {
    const curpFila = celdaAString(fila[STATUS_COL_CURP] ?? fila.curp).toUpperCase();
    if (curpFila === curpU) return fila;
  }
  return null;
}

export async function listarEtiquetasStatus(
  supabase: SupabaseClient,
): Promise<EtiquetasStatusRow[]> {
  const select = buildSelectStatus();
  const { data, error } = await supabase
    .from(TABLA_ETIQUETAS_STATUS)
    .select(select)
    .limit(5000);

  if (!error && data?.length) return data as unknown as EtiquetasStatusRow[];

  const { data: todas, error: err2 } = await supabase
    .from(TABLA_ETIQUETAS_STATUS)
    .select("*")
    .limit(5000);

  if (err2 || !todas?.length) return [];
  return todas as unknown as EtiquetasStatusRow[];
}

export type AlumnoEstrella = {
  alumno: AlumnoRow;
  promedio: number;
  nombre: string;
};

export async function listarAlumnosEstrellaDesdeStatus(
  supabase: SupabaseClient,
  alumnos: AlumnoRow[],
  limite = 4,
): Promise<AlumnoEstrella[]> {
  const filasStatus = await listarEtiquetasStatus(supabase);
  const porCurp = new Map<string, EtiquetasStatusRow>();

  for (const fila of filasStatus) {
    const curp = celdaAString(fila[STATUS_COL_CURP] ?? fila.curp).toUpperCase();
    if (curp) porCurp.set(curp, fila);
  }

  const resultado: AlumnoEstrella[] = [];

  for (const alumno of alumnos) {
    const fila = porCurp.get(alumno.CURP.trim().toUpperCase());
    const promedio = promedioDesdeFilaStatus(fila ?? null);
    if (promedio <= 0) continue;
    resultado.push({
      alumno,
      promedio,
      nombre: nombreCompletoAlumno(alumno),
    });
  }

  resultado.sort((a, b) => b.promedio - a.promedio);
  return resultado.slice(0, limite);
}

const TAMANO_LOTE_STATUS = 100;

/** Columnas de sistema que nunca se insertan como datos. */
const COLUMNAS_SISTEMA_STATUS = new Set(["id", "created_at", "actualizado"]);

/**
 * Reemplaza TODO el contenido de "ETIQUETAS (STATUS)" desde un archivo CSV/Excel.
 * Fila 0 = encabezados → columnas de la tabla (usa CURP como identificador, NO alumno_nombre).
 * NO elimina columnas del esquema (a diferencia de la subida de materias).
 */
export async function reemplazarContenidoStatusDesdeArchivo(
  supabase: SupabaseClient,
  file: File,
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  try {
    const { filas } = await archivoCsvAFilas(file);
    return reemplazarContenidoStatus(supabase, filas);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el archivo.";
    return { ok: false, error: msg };
  }
}

/** Reemplaza el contenido de "ETIQUETAS (STATUS)" desde una matriz de filas. */
export async function reemplazarContenidoStatus(
  supabase: SupabaseClient,
  matriz: string[][],
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  const m = matriz.filter((fila) => fila.some((c) => (c ?? "").trim() !== ""));
  if (m.length < 2) {
    return { ok: false, error: "El archivo está vacío o solo tiene encabezados." };
  }

  const [rawHead, ...rawDatos] = m;
  const encabezados = rawHead.map((h, i) => (h ?? "").trim() || `Col ${i + 1}`);

  const idxCurp = encabezados.findIndex(
    (h) => h.trim().toUpperCase() === STATUS_COL_CURP,
  );
  if (idxCurp < 0) {
    return {
      ok: false,
      error: `El archivo debe incluir una columna «${STATUS_COL_CURP}».`,
    };
  }

  const registros: Record<string, string>[] = [];

  for (const fila of rawDatos) {
    const curp = (fila[idxCurp] ?? "").trim().toUpperCase();
    if (!curp) continue;

    const registro: Record<string, string> = { [STATUS_COL_CURP]: curp };
    encabezados.forEach((col, j) => {
      if (j === idxCurp) return;
      const nombre = col.trim();
      if (!nombre) return;
      if (COLUMNAS_SISTEMA_STATUS.has(nombre.toLowerCase())) return;
      registro[nombre] = (fila[j] ?? "").trim();
    });

    registros.push(registro);
  }

  if (!registros.length) {
    return { ok: false, error: "No hay filas con CURP en el archivo." };
  }

  // Vaciar la tabla (sin tocar el esquema)
  const { error: delError } = await supabase
    .from(TABLA_ETIQUETAS_STATUS)
    .delete()
    .gte("id", 0);
  if (delError) {
    return {
      ok: false,
      error: `No se pudo vaciar «${TABLA_ETIQUETAS_STATUS}»: ${delError.message}`,
    };
  }

  // Insertar por lotes
  for (let i = 0; i < registros.length; i += TAMANO_LOTE_STATUS) {
    const lote = registros.slice(i, i + TAMANO_LOTE_STATUS);
    const { error: insError } = await supabase
      .from(TABLA_ETIQUETAS_STATUS)
      .insert(lote);
    if (insError) {
      return {
        ok: false,
        error: `Error al guardar en «${TABLA_ETIQUETAS_STATUS}»: ${insError.message}`,
      };
    }
  }

  return { ok: true, filas: registros.length };
}
