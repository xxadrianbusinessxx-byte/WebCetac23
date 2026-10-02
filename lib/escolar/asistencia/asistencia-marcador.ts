import { esUuid } from "./atribucion-profesor.ts";

/**
 * PROMPT S (Parte A) — decisiones PURAS de la subida y la anulación POR MATERIA.
 * Sin I/O ni Supabase; se prueba con `scripts/test-asistencia-marcador.mjs`.
 *
 * Dos responsabilidades:
 *   1. el marcador `MATERIA` de la plantilla (A1): leerlo y compararlo contra la
 *      materia resuelta en el servidor. VERIFICA, no decide.
 *   2. la elección de la fila a anular (A5): con materia, solo esa fila; sin
 *      materia y una sola fila, esa; sin materia y varias, error.
 */

/** Marcador leído de la fila reservada `MATERIA` de la plantilla. */
export type MarcadorMateria = {
  /** UUID de `grupo_materias` que viaja en la plantilla. */
  grupoMateriaId: string;
  /** Nombre visible (alias ?? nombre) que viaja en la plantilla. */
  nombreVisible: string;
};

/** Materia resuelta en el servidor contra la que se compara el marcador. */
export type MateriaResueltaParaMarcador = {
  grupoMateriaId: string;
  nombreVisible: string;
};

/**
 * Lee la fila reservada `MATERIA` de la plantilla. Devuelve `null` si no
 * existe (plantilla de una versión anterior). El UUID se busca como la primera
 * celda con formato UUID distinta de las columnas CURP/NOMBRE.
 */
export function extraerMarcadorMateria(
  filas: (string | number)[][],
  idxCurp: number,
  idxNombre: number,
): MarcadorMateria | null {
  for (const fila of filas) {
    const marca = String(fila[idxCurp] ?? "").trim().toUpperCase();
    if (marca !== "MATERIA") continue;

    const nombreVisible = String(fila[idxNombre] ?? "").trim();
    let grupoMateriaId = "";
    for (let i = 0; i < fila.length; i++) {
      if (i === idxCurp || i === idxNombre) continue;
      const celda = String(fila[i] ?? "").trim();
      if (esUuid(celda)) {
        grupoMateriaId = celda;
        break;
      }
    }
    return { grupoMateriaId, nombreVisible };
  }
  return null;
}

/**
 * Valida el marcador contra la materia resuelta (A1):
 *   - falta → error «versión anterior»;
 *   - uuid distinto → error con ambos nombres visibles;
 *   - coincide → ok.
 */
export function validarMarcadorMateria(
  marcador: MarcadorMateria | null,
  resuelto: MateriaResueltaParaMarcador,
): { ok: true } | { ok: false; error: string } {
  if (!marcador) {
    return {
      ok: false,
      error:
        "Esta plantilla es de una versión anterior y no indica su materia. Descarga una nueva.",
    };
  }
  if (
    marcador.grupoMateriaId.trim().toLowerCase() !==
    resuelto.grupoMateriaId.trim().toLowerCase()
  ) {
    const delArchivo = marcador.nombreVisible || "otra materia";
    const elegida = resuelto.nombreVisible || "la elegida";
    return {
      ok: false,
      error: `El archivo es de ${delArchivo} y elegiste ${elegida}.`,
    };
  }
  return { ok: true };
}

/** Fila de aporte de asistencia de un profesor (una por materia). */
export type FilaAporteProfesor = {
  id: string;
  clases_asistidas: number;
  grupo_materia_id: string | null;
};

/**
 * Elige la fila objetivo a anular (A5):
 *   - con `grupoMateriaId` → solo esa fila (error si no está);
 *   - sin él y UNA sola fila → esa;
 *   - sin él y VARIAS → error «indica la materia».
 */
export function elegirFilaParaAnular(
  filas: FilaAporteProfesor[],
  grupoMateriaId: string | null,
): { ok: true; fila: FilaAporteProfesor } | { ok: false; error: string } {
  const materia = (grupoMateriaId ?? "").trim();
  if (materia) {
    const fila = filas.find(
      (f) => (f.grupo_materia_id ?? "").trim().toLowerCase() === materia.toLowerCase(),
    );
    if (!fila) {
      return {
        ok: false,
        error: "No hay asistencia registrada de esa materia ese día para este alumno.",
      };
    }
    return { ok: true, fila };
  }

  if (filas.length === 0) {
    return {
      ok: false,
      error: "No hay asistencia registrada por ti ese día para este alumno.",
    };
  }
  if (filas.length === 1) {
    return { ok: true, fila: filas[0] };
  }
  return {
    ok: false,
    error: "Hay asistencia de varias materias ese día: indica la materia.",
  };
}
