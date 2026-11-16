/**
 * guarda-alcance-puro.ts — MÓDULO PURO. ¿Puede este rol subir asistencia de
 * esta materia? 2026-11-16.
 *
 * Por qué existe esta regla. Subir asistencia no solo escribe asistencia:
 * antes de guardar, la RPC `traspasar_materia_a_profesor` le DA la materia a
 * quien sube — desactiva la asignación de quien la tuviera y mueve a su nombre
 * las clases y asistencias ya registradas (archivando las originales en
 * `asistencia_traspasos_historico`). Es correcto cuando quien sube ES el
 * profesor de la materia; con la cuenta de servicio social significaría que,
 * materia a materia, se las va quitando a todos.
 *
 * Qué NO es. No es una capacidad: `asistencia.subir` es la misma para todos y
 * no se toca. Es ALCANCE —«sobre qué»—, igual que `resolverAccesoAlumno` lo es
 * de «sobre quién», y por eso quien la aplica es la Server Action.
 *
 * La decisión vive aquí, separada de las dos lecturas que la alimentan (quién
 * es el dueño de la materia, qué materia es), para poder probarla sin red.
 */

/** Lo que hace falta saber para decidir. Nada de esto viene de la base aquí. */
export type ContextoGuardaAsistencia = {
  /** ¿La sesión es del rol Servicio Escolar? Lo resuelve `esRol` en la action. */
  esServicioEscolar: boolean;
  /** `PROFESORES.ID` de la sesión. `null` en una sesión vieja sin él. */
  profesorIdSesion: number | null | undefined;
  /** Dueño ACTIVO de la materia, o `null` si nadie la ha reclamado. */
  duenoProfesorId: number | null;
};

/**
 * Mensaje que ve quien se topa con la guarda. Dice qué pasa y qué hacer: un
 * «no autorizado» a secas dejaría al alumno de servicio social sin saber a
 * quién pedirle nada.
 */
export const ERROR_MATERIA_DE_OTRO_PROFESOR =
  "Esta materia ya tiene profesor asignado, y subir la asistencia se la quitaría. " +
  "Pídele a su profesor que la suba él, o que dirección reasigne la materia antes.";

/**
 * ¿Hay que bloquear la subida?
 *
 * Solo bloquea en un caso: el rol es Servicio Escolar Y la materia ya tiene un
 * dueño activo que NO es la propia sesión. En particular NO bloquea:
 *   · a nadie más (profesor y directivo suben como siempre);
 *   · cuando la materia no tiene dueño — ahí no le quita nada a nadie;
 *   · cuando el dueño ES la sesión — re-subir lo suyo es idempotente.
 */
export function bloqueaSubidaDeAsistencia(ctx: ContextoGuardaAsistencia): boolean {
  if (!ctx.esServicioEscolar) return false;
  if (ctx.duenoProfesorId === null) return false;
  return ctx.duenoProfesorId !== ctx.profesorIdSesion;
}
