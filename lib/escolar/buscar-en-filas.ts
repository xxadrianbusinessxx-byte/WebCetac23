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

  const objetivo = normalizarNombre(nombre);
  for (const celda of fila) {
    const c = String(celda ?? "").trim();
    if (!c || pareceCurp(c)) continue;
    if (nombresCoinciden(c, nombre)) return true;
    const norm = normalizarNombre(c);
    if (norm.includes(objetivo) || objetivo.includes(norm)) return true;
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
