import {
  nombresCoinciden,
  nombresMismoAlumno,
  normalizarNombre,
  tokensNombre,
} from "./nombres";

/** Formato CURP mexicano (18 caracteres). */
export const CURP_ALUMNO_RE =
  /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/i;

export function pareceCurp(texto: string): boolean {
  return CURP_ALUMNO_RE.test(texto.trim());
}

export function normalizarCurp(curp: string): string {
  return curp.trim().toUpperCase();
}

export type CriterioAlumnoEnFila = {
  curp?: string | null;
  nombreCompleto?: string | null;
  /** Otras formas del nombre (apellido primero, etc.). */
  nombresAlternativos?: readonly string[];
};

/** Columna fija en tablas de materias/registros subidas desde Excel. */
export const COLUMNA_NOMBRE_ALUMNO = "alumno_nombre";

export function nombreAlumnoDesdeRegistroDb(
  row: Record<string, unknown>,
): string {
  return String(row[COLUMNA_NOMBRE_ALUMNO] ?? "").trim();
}

export function criterioTieneBusqueda(criterio: CriterioAlumnoEnFila): boolean {
  return (
    Boolean(criterio.curp?.trim()) ||
    Boolean(criterio.nombreCompleto?.trim()) ||
    Boolean(criterio.nombresAlternativos?.length)
  );
}

/** Celdas para comparar: siempre incluye `alumno_nombre` aunque no esté en colsDatos. */
export function registroDbACeldasParaBusqueda(
  row: Record<string, unknown>,
  colsDatos: string[],
): string[] {
  const nombre = nombreAlumnoDesdeRegistroDb(row);
  const resto = colsDatos.map((col) => String(row[col] ?? "").trim());
  return nombre ? [nombre, ...resto] : resto;
}

/**
 * Coincide con un registro de Supabase (materia o registro final).
 * Prioriza `alumno_nombre`, luego CURP en cualquier columna, luego el resto de celdas.
 */
export function registroDbCoincideAlumno(
  row: Record<string, unknown>,
  colsDatos: string[],
  criterio: CriterioAlumnoEnFila,
): boolean {
  const curpU = criterio.curp?.trim() ? normalizarCurp(criterio.curp) : "";

  if (curpU) {
    const enNombre = nombreAlumnoDesdeRegistroDb(row).toUpperCase();
    if (enNombre === curpU) return true;
    for (const col of colsDatos) {
      const v = String(row[col] ?? "").trim().toUpperCase();
      if (v === curpU) return true;
    }
  }

  const nombre = criterio.nombreCompleto?.trim() ?? "";
  const alt = criterio.nombresAlternativos ?? [];
  if (!nombre && !alt.length) return false;

  const enColumna = nombreAlumnoDesdeRegistroDb(row);
  if (
    enColumna &&
    !/^NOMBRE$/i.test(enColumna) &&
    celdaContieneNombreAlumno(enColumna, nombre, alt)
  ) {
    return true;
  }

  return filaCoincideAlumno(registroDbACeldasParaBusqueda(row, colsDatos), criterio);
}

export type FiltroFilaRegistro = (
  row: Record<string, unknown>,
  colsDatos: string[],
) => boolean;

/** Índice del primer registro que coincide (p. ej. saltar filas de encabezado del Excel). */
export function buscarIndiceRegistroAlumno(
  rows: Record<string, unknown>[],
  colsDatos: string[],
  criterio: CriterioAlumnoEnFila,
  desdeIndice = 0,
  omitirFila?: FiltroFilaRegistro,
): number {
  for (let i = desdeIndice; i < rows.length; i++) {
    if (omitirFila?.(rows[i]!, colsDatos)) continue;
    if (registroDbCoincideAlumno(rows[i]!, colsDatos, criterio)) return i;
  }
  return -1;
}

/**
 * Busca al alumno en una fila del Excel/CSV subido.
 * 1) Si hay CURP y coincide en alguna celda → true (no revisa nombre).
 * 2) Si no hubo match por CURP → solo entonces compara por nombre.
 */
export function filaCoincideAlumno(
  fila: string[],
  criterio: CriterioAlumnoEnFila,
): boolean {
  const curpU = criterio.curp?.trim() ? normalizarCurp(criterio.curp) : "";

  if (curpU) {
    for (const celda of fila) {
      const c = String(celda ?? "").trim().toUpperCase();
      if (c === curpU) return true;
    }
  }

  const nombre = criterio.nombreCompleto?.trim() ?? "";
  const alt = criterio.nombresAlternativos ?? [];
  if (!nombre && !alt.length) return false;

  for (const celda of fila) {
    if (celdaContieneNombreAlumno(String(celda ?? ""), nombre, alt)) return true;
  }
  return false;
}

/** Evita falsos positivos (ej. celda «A» de GRUPO dentro del nombre del alumno). */
export function celdaContieneNombreAlumno(
  celda: string,
  nombreCompleto: string,
  alternativos: readonly string[] = [],
): boolean {
  const c = celda.trim();
  if (!c || pareceCurp(c)) return false;

  const candidatos = [nombreCompleto, ...alternativos].filter(Boolean);
  for (const objetivo of candidatos) {
    if (nombresMismoAlumno(c, objetivo)) return true;
  }
  return false;
}

/** Índice de la primera fila que coincide (una pasada, sin doble validación). */
export function buscarIndiceFilaAlumno(
  filas: string[][],
  criterio: CriterioAlumnoEnFila,
): number {
  for (let i = 0; i < filas.length; i++) {
    if (filaCoincideAlumno(filas[i]!, criterio)) return i;
  }
  return -1;
}

/** Índice de la celda dentro de la fila donde aparece el alumno (CURP o nombre). */
export function buscarIndiceCeldaAlumno(
  fila: string[],
  criterio: CriterioAlumnoEnFila,
): number {
  const curpU = criterio.curp?.trim() ? normalizarCurp(criterio.curp) : "";

  if (curpU) {
    for (let j = 0; j < fila.length; j++) {
      const c = String(fila[j] ?? "").trim().toUpperCase();
      if (c === curpU) return j;
    }
  }

  const nombre = criterio.nombreCompleto?.trim() ?? "";
  const alt = criterio.nombresAlternativos ?? [];
  if (!nombre && !alt.length) return -1;

  for (let j = 0; j < fila.length; j++) {
    if (celdaContieneNombreAlumno(String(fila[j] ?? ""), nombre, alt)) {
      return j;
    }
  }
  return -1;
}

/** Apellido o token largo para filtrar en Supabase (ilike). */
export function tokenBusquedaNombreEnTabla(
  criterio: CriterioAlumnoEnFila,
): string | null {
  const todos = [
    criterio.nombreCompleto ?? "",
    ...(criterio.nombresAlternativos ?? []),
  ];
  for (const t of todos) {
    const tokens = tokensNombre(t).filter((x) => x.length >= 4);
    if (tokens.length) return tokens[0]!;
  }
  for (const t of todos) {
    const tokens = tokensNombre(t);
    if (tokens.length) return tokens[0]!;
  }
  return null;
}

export type PosicionAlumnoEnMatriz = {
  filaIdx: number;
  celdaIdx: number;
};

/** Busca al alumno en cualquier celda de cualquier fila. */
export function buscarAlumnoEnMatriz(
  filas: string[][],
  criterio: CriterioAlumnoEnFila,
  desdeFila = 0,
): PosicionAlumnoEnMatriz {
  for (let i = desdeFila; i < filas.length; i++) {
    const celdaIdx = buscarIndiceCeldaAlumno(filas[i]!, criterio);
    if (celdaIdx >= 0) return { filaIdx: i, celdaIdx };
  }
  return { filaIdx: -1, celdaIdx: -1 };
}
