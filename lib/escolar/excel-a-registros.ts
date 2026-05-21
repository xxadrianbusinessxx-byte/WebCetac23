import { normalizarAnchoFilas } from "./matriz-hoja";
import {
  columnasParaVista,
  listarColumnasTabla,
  sincronizarColumnasTabla,
} from "./schema-tabla";

const PISTAS_NOMBRE = [
  "nombre",
  "apellido",
  "paterno",
  "materno",
  "alumno",
] as const;

const COLUMNAS_OMITIR_INSERT = new Set([
  "id",
  "actualizado",
  "datos",
  "contenido",
]);

export type FilaInsertDirecta = Record<string, string>;

function celdaVacia(s: string | undefined): boolean {
  return !(s ?? "").trim();
}

function encabezadoEsNombre(encabezado: string): boolean {
  const h = encabezado.trim().toLowerCase();
  return PISTAS_NOMBRE.some((p) => h.includes(p));
}

/** Nombre de columna en Supabase = texto del encabezado del Excel (fila 0). */
export function nombreColumnaDesdeEncabezado(raw: string, indice: number): string {
  const t = raw.trim();
  if (t) return t;
  return `Col ${indice + 1}`;
}

function valorCelda(fila: string[], j: number): string {
  return j < fila.length ? String(fila[j] ?? "").trim() : "";
}

export function indicesColumnasNombre(encabezados: string[]): number[] {
  const idx: number[] = [];
  encabezados.forEach((h, i) => {
    if (encabezadoEsNombre(h)) idx.push(i);
  });
  return idx;
}

export function nombreAlumnoDesdeFila(
  encabezados: string[],
  fila: string[],
): string {
  const idxNombre = indicesColumnasNombre(encabezados);
  const partes = idxNombre.map((j) => valorCelda(fila, j)).filter(Boolean);
  if (partes.length) return partes.join(" ").trim();
  return valorCelda(fila, 0) || "Sin nombre";
}

/** Encabezados del archivo (fila 0) → nombres de columna Supabase (sin columnas de nombre sueltas). */
export function columnasDatosDesdeEncabezados(encabezados: string[]): string[] {
  const idxNombre = new Set(indicesColumnasNombre(encabezados));
  const cols: string[] = [];
  encabezados.forEach((h, j) => {
    if (idxNombre.has(j)) return;
    const nombre = nombreColumnaDesdeEncabezado(h, j);
    if (!COLUMNAS_OMITIR_INSERT.has(nombre.toLowerCase())) {
      cols.push(nombre);
    }
  });
  return cols;
}

function filaDatosVacia(encabezados: string[], fila: string[]): boolean {
  const idxNombre = new Set(indicesColumnasNombre(encabezados));
  for (let j = 0; j < encabezados.length; j++) {
    if (idxNombre.has(j)) continue;
    if (!celdaVacia(valorCelda(fila, j))) return false;
  }
  return idxNombre.size === 0;
}

/**
 * Fila 0 = encabezados (no se inserta).
 * Cada fila de datos → un registro con columnas directas (alumno_nombre + una columna por encabezado).
 */
export function matrizAFilasDirectas(matriz: string[][]): {
  encabezados: string[];
  columnasSupabase: string[];
  filas: FilaInsertDirecta[];
} {
  const norm = normalizarAnchoFilas(matriz);
  if (norm.length < 2) {
    return { encabezados: [], columnasSupabase: [], filas: [] };
  }

  const [rawHead, ...rawDatos] = norm;
  const encabezados = (rawHead ?? []).map((h, i) =>
    nombreColumnaDesdeEncabezado(String(h ?? ""), i),
  );
  const columnasSupabase = columnasDatosDesdeEncabezados(encabezados);
  const idxNombre = new Set(indicesColumnasNombre(encabezados));

  const filas: FilaInsertDirecta[] = [];

  for (const fila of rawDatos) {
    if (filaDatosVacia(encabezados, fila)) continue;

    const registro: FilaInsertDirecta = {
      alumno_nombre: nombreAlumnoDesdeFila(encabezados, fila),
    };

    encabezados.forEach((colNombre, j) => {
      if (idxNombre.has(j)) return;
      if (COLUMNAS_OMITIR_INSERT.has(colNombre.toLowerCase())) return;
      registro[colNombre] = valorCelda(fila, j);
    });

    filas.push(registro);
  }

  return { encabezados, columnasSupabase, filas };
}

/** Reconstruye vista previa desde filas con columnas directas en Supabase. */
export function filasDbAVistaDirecta(
  filasDb: Record<string, unknown>[],
  columnasDb: string[],
): { encabezados: string[]; filas: string[][] } | null {
  if (!filasDb.length) return null;

  const colsDatos = columnasParaVista(columnasDb);
  const otras = colsDatos.filter((c) => c !== "alumno_nombre");
  const encabezados = ["Alumno", ...otras];

  const filas = filasDb
    .filter((r) => {
      const n = String(r.alumno_nombre ?? "").trim();
      return n && n !== "__HOJA__" && n !== "__ENCABEZADOS__";
    })
    .map((r) => [
      String(r.alumno_nombre ?? "").trim(),
      ...otras.map((c) => String(r[c] ?? "").trim()),
    ]);

  if (!filas.length) return null;
  return { encabezados, filas };
}

export async function prepararYConstruirFilas(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  nombreTabla: string,
  matriz: string[][],
): Promise<
  | { ok: true; filas: FilaInsertDirecta[]; count: number }
  | { ok: false; error: string }
> {
  const { columnasSupabase, filas } = matrizAFilasDirectas(matriz);
  if (!filas.length) {
    return { ok: false, error: "No hay filas de datos en el archivo." };
  }

  const sync = await sincronizarColumnasTabla(
    supabase,
    nombreTabla,
    columnasSupabase,
  );
  if (!sync.ok) return sync;

  return { ok: true, filas, count: filas.length };
}

export { listarColumnasTabla };
