/**
 * IMPORTACIÓN DE ETIQUETAS DESDE EXCEL — capa ADAPTADORA (FASE 2)
 *
 * Responsabilidad: leer un archivo Excel y convertirlo al MODELO del módulo de
 * etiquetas (pares título/valor). NO conoce la tabla `alumno_etiquetas` ni el
 * servicio: la persistencia se hace después con
 * lib/escolar/etiquetas-dinamicas-servicio.ts.
 *
 * Flujo (filosofia.estructural §12):
 *   Excel → lectura (csv.ts) → normalización → identificación de columnas →
 *   validación → etiquetas del modelo → servicio.
 *
 *   · Importación INDIVIDUAL (desde el perfil): el alumno ya es el contexto,
 *     por lo que NO se identifica al alumno en el Excel. Cada columna ≠ CURP
 *     es un TÍTULO de etiqueta.
 *   · Importación GLOBAL (desde Configuración, directivo): el Excel incluye
 *     una columna CURP + columnas de etiquetas. Se devuelve una fila por CURP.
 *
 * SOLO se aceptan archivos Excel (.xlsx / .xls), no Word/PDF/otros.
 */
import { archivoCsvAFilas } from "./csv";
import { normalizarCurp } from "./buscar-en-filas";
import { detectarCampoPorEncabezado } from "./mapeo-columnas";
import {
  MAX_ETIQUETAS_POR_ALUMNO,
  normalizarTituloEtiqueta,
  normalizarTituloPresentado,
  normalizarValorEtiqueta,
  type EtiquetaAlumno,
} from "./etiquetas-dinamicas";

/** ¿El archivo es Excel (.xlsx / .xls)? (validación por extensión, en servidor). */
export function esArchivoExcel(file: File): boolean {
  const nombre = file.name.toLowerCase();
  return nombre.endsWith(".xlsx") || nombre.endsWith(".xls");
}

export type ResultadoParseIndividual =
  | { ok: true; etiquetas: EtiquetaAlumno[] }
  | { ok: false; error: string };

/** Una fila de la importación GLOBAL: CURP + sus etiquetas. */
export type FilaEtiquetasGlobal = {
  curp: string;
  etiquetas: EtiquetaAlumno[];
};

export type ResultadoParseGlobal =
  | {
      ok: true;
      filas: FilaEtiquetasGlobal[];
      errores: string[];
      duplicadosCurp: string[];
    }
  | { ok: false; error: string };

async function leerFilasExcel(file: File): Promise<
  { ok: true; matriz: string[][] } | { ok: false; error: string }
> {
  if (!esArchivoExcel(file)) {
    return {
      ok: false,
      error: "Solo se aceptan archivos Excel (.xlsx / .xls) para etiquetas.",
    };
  }
  try {
    const { filas } = await archivoCsvAFilas(file);
    const matriz = filas.filter((f) => f.some((c) => (c ?? "").trim() !== ""));
    if (matriz.length < 2) {
      return {
        ok: false,
        error: "El archivo debe tener una fila de encabezados y al menos una fila de datos.",
      };
    }
    return { ok: true, matriz };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el archivo.";
    return { ok: false, error: msg };
  }
}

/**
 * Interpreta las columnas de etiquetas (excluye una posible columna CURP,
 * porque en el perfil el alumno ya es el contexto). Devuelve los títulos por
 * índice, deduplicados por normalización (sin acentos).
 */
function titulosDesdeEncabezados(
  head: string[],
  ignorarColumnaCurp: boolean,
): { indice: number; titulo: string }[] {
  const titulos: { indice: number; titulo: string }[] = [];
  const vistos = new Set<string>();
  head.forEach((h, i) => {
    const titulo = normalizarTituloPresentado(h);
    if (!titulo) return;
    const norm = normalizarTituloEtiqueta(titulo);
    if (norm === "CURP" && ignorarColumnaCurp) return;
    if (vistos.has(norm)) return; // título duplicado: el primero gana
    vistos.add(norm);
    titulos.push({ indice: i, titulo });
  });
  return titulos;
}

/**
 * Importación INDIVIDUAL (desde el perfil de un alumno).
 * Cabeceras = títulos de etiquetas; los valores se toman de las celdas
 * (último valor no vacío entre las filas de datos; valores vacíos permitidos).
 */
export async function leerEtiquetasDesdeArchivoIndividual(
  file: File,
): Promise<ResultadoParseIndividual> {
  const leido = await leerFilasExcel(file);
  if (!leido.ok) return leido;

  const [head, ...datos] = leido.matriz;
  const titulos = titulosDesdeEncabezados(head ?? [], true);
  if (titulos.length === 0) {
    return { ok: false, error: "No se encontraron columnas de etiquetas en el archivo." };
  }
  if (titulos.length > MAX_ETIQUETAS_POR_ALUMNO) {
    return {
      ok: false,
      error: `Máximo ${MAX_ETIQUETAS_POR_ALUMNO} etiquetas por alumno. El archivo tiene ${titulos.length} columnas.`,
    };
  }

  // Merge entre filas: para cada título, el último valor no vacío gana.
  const valores = new Map<string, string>();
  for (const fila of datos) {
    for (const { indice, titulo } of titulos) {
      const valor = normalizarValorEtiqueta(fila[indice]);
      if (valor) valores.set(normalizarTituloEtiqueta(titulo), valor);
    }
  }

  const etiquetas: EtiquetaAlumno[] = titulos.map(({ titulo }, index) => ({
    titulo,
    valor: valores.get(normalizarTituloEtiqueta(titulo)) ?? "",
    orden: index,
  }));

  return { ok: true, etiquetas };
}

/**
 * Importación GLOBAL (desde Configuración, solo directivo).
 * Columnas: CURP + columnas de etiquetas. Una fila por alumno.
 * Los errores de fila NO abortan el archivo: se acumulan y se devuelven.
 */
export async function leerEtiquetasDesdeArchivoGlobal(
  file: File,
): Promise<ResultadoParseGlobal> {
  const leido = await leerFilasExcel(file);
  if (!leido.ok) return leido;

  const [head, ...datos] = leido.matriz;

  // 1) Localizar la columna CURP (por aliases, p. ej. «CURP», «CLAVE CURP»).
  let idxCurp = -1;
  (head ?? []).forEach((h, i) => {
    if (idxCurp >= 0) return;
    const det = detectarCampoPorEncabezado(h);
    if (det?.campo === "curp") idxCurp = i;
  });
  if (idxCurp < 0) {
    return { ok: false, error: "El archivo debe incluir una columna CURP." };
  }

  const titulos = titulosDesdeEncabezados(head ?? [], true);
  if (titulos.length === 0) {
    return {
      ok: false,
      error: "No se encontraron columnas de etiquetas además de la columna CURP.",
    };
  }
  if (titulos.length > MAX_ETIQUETAS_POR_ALUMNO) {
    return {
      ok: false,
      error: `Máximo ${MAX_ETIQUETAS_POR_ALUMNO} etiquetas por alumno. El archivo tiene ${titulos.length} columnas.`,
    };
  }

  const filas: FilaEtiquetasGlobal[] = [];
  const errores: string[] = [];
  const duplicadosCurp: string[] = [];
  const curpsVistas = new Set<string>();

  datos.forEach((fila, fi) => {
    const numeroFila = fi + 2; // la fila 1 son los encabezados
    const curp = normalizarCurp(fila[idxCurp] ?? "");
    if (!curp) {
      errores.push(`Fila ${numeroFila}: CURP vacía, se omitió.`);
      return;
    }
    if (curpsVistas.has(curp)) {
      duplicadosCurp.push(curp);
      return;
    }
    curpsVistas.add(curp);

    const etiquetas: EtiquetaAlumno[] = titulos.map(({ indice, titulo }, index) => ({
      titulo,
      valor: normalizarValorEtiqueta(fila[indice]),
      orden: index,
    }));
    filas.push({ curp, etiquetas });
  });

  return { ok: true, filas, errores, duplicadosCurp };
}

