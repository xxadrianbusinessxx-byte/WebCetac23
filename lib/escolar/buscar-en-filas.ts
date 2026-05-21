import { nombresCoinciden, normalizarNombre } from "./nombres";

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
};

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
  if (!nombre) return false;

  for (const celda of fila) {
    if (celdaContieneNombreAlumno(String(celda ?? ""), nombre)) return true;
  }
  return false;
}

/** Evita falsos positivos (ej. celda «A» de GRUPO dentro del nombre del alumno). */
export function celdaContieneNombreAlumno(
  celda: string,
  nombreCompleto: string,
): boolean {
  const c = celda.trim();
  if (!c || pareceCurp(c)) return false;
  if (nombresCoinciden(c, nombreCompleto)) return true;

  const norm = normalizarNombre(c);
  const objetivo = normalizarNombre(nombreCompleto);
  if (norm.length < 8 || objetivo.length < 8) return false;

  const partes = objetivo.split(" ").filter((p) => p.length > 2);
  if (partes.length < 2) return false;

  const coinciden = partes.filter((p) => norm.includes(p));
  return coinciden.length >= 2;
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
  if (!nombre) return -1;

  for (let j = 0; j < fila.length; j++) {
    if (celdaContieneNombreAlumno(String(fila[j] ?? ""), nombre)) return j;
  }
  return -1;
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
