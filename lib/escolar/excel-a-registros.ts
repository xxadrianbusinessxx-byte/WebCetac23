import {
  esRegistroCalificacionesFinales,
  INDICE_ENCABEZADOS_REGISTRO,
  prepararMatrizParaSupabase,
} from "./matriz-hoja";
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

const PATRON_ENCABEZADO =
  /^(NOMBRE|NO\.?\s*CONTROL|PARCIAL|PROMEDIO|CLAVE|MATERIA|CALIFIC)/i;

const COLUMNAS_OMITIR_INSERT = new Set([
  "id",
  "actualizado",
  "created_at",
  "datos",
  "contenido",
]);

const MARCAS_HOJA = new Set(["__HOJA__", "__ENCABEZADOS__"]);

export type FilaInsertDirecta = Record<string, string>;

function celdaVacia(s: string | undefined): boolean {
  return !(s ?? "").trim();
}

function encabezadoEsNombre(encabezado: string): boolean {
  const h = encabezado.trim().toLowerCase();
  return PISTAS_NOMBRE.some((p) => h.includes(p));
}

/** Nombre de columna en Supabase = texto del encabezado del Excel. */
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
  return valorCelda(fila, 0) || "";
}

function filaEsEncabezadoColumnas(celdas: string[]): boolean {
  let hits = 0;
  for (const c of celdas) {
    const t = c.trim();
    if (!t) continue;
    if (PATRON_ENCABEZADO.test(t)) hits++;
    if (/^PARCIAL\s*\d/i.test(t) || t === "PROMEDIO") hits++;
  }
  return hits >= 2 || celdas.some((c) => /^NOMBRE$/i.test(c.trim()));
}

/** Detecta la fila cuyas celdas definen los nombres de columna en Supabase. */
export function detectarIndiceFilaEncabezados(
  matriz: string[][],
  nombreTabla: string,
): number {
  const esRegistro = esRegistroCalificacionesFinales(nombreTabla);
  if (esRegistro && matriz.length > INDICE_ENCABEZADOS_REGISTRO) {
    return INDICE_ENCABEZADOS_REGISTRO;
  }
  for (let i = 0; i < Math.min(matriz.length, 20); i++) {
    if (filaEsEncabezadoColumnas(matriz[i]!)) return i;
  }
  return 0;
}

function asegurarNombresColumnasUnicos(nombres: string[]): string[] {
  const vistos = new Map<string, number>();
  return nombres.map((raw, i) => {
    let nombre = raw.trim();
    if (!nombre || COLUMNAS_OMITIR_INSERT.has(nombre.toLowerCase())) {
      nombre = `Col ${i + 1}`;
    }
    const veces = vistos.get(nombre.toLowerCase()) ?? 0;
    vistos.set(nombre.toLowerCase(), veces + 1);
    if (veces > 0) return `${nombre} (${veces + 1})`;
    return nombre;
  });
}

function derivarAlumnoNombre(
  encabezados: string[],
  fila: string[],
  indiceFila: number,
  indiceEncabezados: number,
): string {
  if (indiceFila === indiceEncabezados) {
    const primera = valorCelda(fila, 0);
    return primera || "__ENCABEZADOS__";
  }
  const desdeNombre = nombreAlumnoDesdeFila(encabezados, fila);
  if (desdeNombre) return desdeNombre;
  for (const c of fila) {
    const t = c.trim();
    if (t) return t;
  }
  return "";
}

function filaDbTieneDatos(
  row: Record<string, unknown>,
  cols: string[],
): boolean {
  const n = String(row.alumno_nombre ?? "").trim();
  if (n && !MARCAS_HOJA.has(n)) return true;
  return cols.some((c) => String(row[c] ?? "").trim());
}

function etiquetaColumnaVista(nombre: string, indice: number): string {
  const t = nombre.trim();
  if (t.toLowerCase() === "alumno_nombre") return "Alumno";
  if (t) return t;
  return `Col ${indice + 1}`;
}

function ordenarColumnasVista(columnasDb: string[]): string[] {
  const cols = columnasParaVista(columnasDb);
  const resto = cols.filter((c) => c !== "alumno_nombre");
  return cols.includes("alumno_nombre") ? ["alumno_nombre", ...resto] : cols;
}

/**
 * Convierte matriz limpia → filas para Supabase.
 * Materias y registros finales usan el mismo flujo: cada fila con datos → un registro.
 * Los nombres de columna salen de la fila de encabezados detectada (fila 5 en registros).
 */
export function matrizAFilasDirectas(
  matrizRaw: string[][],
  nombreTabla: string,
): {
  encabezados: string[];
  columnasSupabase: string[];
  filas: FilaInsertDirecta[];
} {
  const matriz = prepararMatrizParaSupabase(matrizRaw);
  if (!matriz.length) {
    return { encabezados: [], columnasSupabase: [], filas: [] };
  }

  const indiceEncabezados = detectarIndiceFilaEncabezados(matriz, nombreTabla);
  const encabezados = asegurarNombresColumnasUnicos(
    (matriz[indiceEncabezados] ?? []).map((h, i) =>
      nombreColumnaDesdeEncabezado(String(h ?? ""), i),
    ),
  );
  const columnasSupabase = encabezados.filter(
    (c) => !COLUMNAS_OMITIR_INSERT.has(c.toLowerCase()),
  );

  const filas: FilaInsertDirecta[] = [];

  for (let i = 0; i < matriz.length; i++) {
    const fila = matriz[i]!;
    if (!fila.some((c) => !celdaVacia(c))) continue;

    const registro: FilaInsertDirecta = {
      alumno_nombre: derivarAlumnoNombre(
        encabezados,
        fila,
        i,
        indiceEncabezados,
      ),
    };

    encabezados.forEach((colNombre, j) => {
      if (COLUMNAS_OMITIR_INSERT.has(colNombre.toLowerCase())) return;
      registro[colNombre] = valorCelda(fila, j);
    });

    filas.push(registro);
  }

  return { encabezados, columnasSupabase, filas };
}

/** Vista previa desde filas con columnas directas en Supabase (orden por id). */
export function filasDbAVistaDirecta(
  filasDb: Record<string, unknown>[],
  columnasDb: string[],
): { encabezados: string[]; filas: string[][] } | null {
  if (!filasDb.length) return null;

  const colsDatos = ordenarColumnasVista(columnasDb);
  if (!colsDatos.length) return null;

  const encabezados = colsDatos.map((c, i) => etiquetaColumnaVista(c, i));

  const filasOrdenadas = [...filasDb].sort((a, b) => {
    const idA = Number(a.id ?? 0);
    const idB = Number(b.id ?? 0);
    return idA - idB;
  });

  const filas = filasOrdenadas
    .filter((r) => filaDbTieneDatos(r, colsDatos))
    .map((r) => colsDatos.map((c) => String(r[c] ?? "").trim()));

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
  const { columnasSupabase, filas } = matrizAFilasDirectas(matriz, nombreTabla);
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
