/**
 * alcance-profesor-puro.ts — MÓDULO PURO. ¿Qué asistencia puede VER (y anular)
 * un profesor? 2026-11-18.
 *
 * Desde 2026-11-17 capturar no da la materia: Servicio Escolar o el directivo
 * suben la asistencia de una materia ajena y la fila guarda su `profesor_id`
 * como AUTORÍA. La propiedad vive solo en `asignaciones_profesor`. Si el
 * profesor viera solo lo que él capturó, el dueño de una materia no vería la
 * asistencia que otro subió por él (caso real: 1RO A · Ciencias Naturales I,
 * 444 filas capturadas por Servicio Escolar, invisibles para el profesor
 * asignado).
 *
 * Regla: una fila (de `asistencia_alumnos` o de `clases_impartidas`) está en el
 * alcance del profesor si
 *   a) es de una materia que tiene ASIGNADA (activa), capture quien capture, o
 *   b) la capturó él (incluye materias no asignadas: capturar se permite).
 * Una fila sin materia (legacy o marcador de justificación) solo entra por (b).
 *
 * Acceso al grupo: lo tiene si alguna materia del grupo le está asignada o si
 * ya capturó clases en él (la regla anterior, que se conserva para quien aún
 * no tiene asignaciones).
 *
 * Sin I/O: lo prueba `scripts/test-alcance-profesor.mjs`.
 */

export type AlcanceProfesor = {
  /** `PROFESORES.ID` de la sesión. */
  profesorId: number;
  /** `grupo_materia_id` de sus asignaciones ACTIVAS. */
  materiasAsignadas: ReadonlySet<string>;
};

/** Lo que la regla necesita de cada fila. */
export type FilaConAutoria = {
  grupo_materia_id: string | null;
  profesor_id: number | null;
};

/** ¿La fila está en el alcance del profesor? */
export function filaEnAlcanceProfesor(
  fila: FilaConAutoria,
  alcance: AlcanceProfesor,
): boolean {
  if (fila.profesor_id != null && Number(fila.profesor_id) === alcance.profesorId) {
    return true;
  }
  return fila.grupo_materia_id != null && alcance.materiasAsignadas.has(fila.grupo_materia_id);
}

/** Las filas que el profesor puede ver (mismo orden, mismas filas). */
export function filtrarPorAlcanceProfesor<T extends FilaConAutoria>(
  filas: readonly T[],
  alcance: AlcanceProfesor,
): T[] {
  return filas.filter((f) => filaEnAlcanceProfesor(f, alcance));
}

/** ¿Puede consultar el grupo? Asignado en él, o ya capturó clases ahí. */
export function accesoProfesorAGrupo(input: {
  asignadoEnGrupo: boolean;
  capturoEnGrupo: boolean;
}): boolean {
  return input.asignadoEnGrupo || input.capturoEnGrupo;
}
