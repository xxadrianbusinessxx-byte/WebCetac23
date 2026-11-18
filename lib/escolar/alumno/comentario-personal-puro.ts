/**
 * comentario-personal-puro.ts — MÓDULO PURO. ¿Quién puede ESCRIBIR el
 * «Comentario personal» de un alumno, y qué texto es válido? 2026-11-17.
 *
 * Qué es el comentario personal. Un campo libre de `ETIQUETAS PERSONALES`
 * («COMENTARIO PERSONAL») que acompaña al expediente: la nota de contexto que
 * la escuela guarda sobre el alumno. NO es el tablón de
 * `COMENTARIOS`/`COMENTARIOS PROFESORES`, que son mensajes firmados y se
 * acumulan; este es UN texto que se sustituye.
 *
 * Por qué no reutiliza `puedeEditarDatosPersonales`. Hoy los dos conjuntos
 * coinciden, pero no son la misma decisión: `alumno.editar_datos_personales`
 * la tiene también el TÉCNICO (carga el padrón), y hoy solo queda fuera porque
 * `resolverAccesoAlumno` no tiene rama para su rol. Es decir: el técnico está
 * fuera por omisión, no por regla. Si mañana alguien le abre una rama de
 * alcance —cosa razonable para el padrón— heredaría en silencio la escritura
 * de esta nota. Nombrar la regla aparte es lo que evita ese regalo.
 *
 * Quién edita (decisión del 2026-11-17): DIRECTIVO, ADMINISTRACIÓN ESCOLAR y
 * el TUTOR VINCULADO al alumno. Nadie más:
 *   · el ALUMNO lo LEE y no lo escribe — es la nota que la escuela guarda
 *     sobre él, no su propio recado;
 *   · el MAESTRO tiene `alumno.comentar`, que es el tablón firmado: ahí su
 *     comentario queda a su nombre y no sustituye el de nadie.
 *
 * «Tutor vinculado» no se decide aquí: el vínculo activo (`tutor_alumnos`) lo
 * resuelve `resolverAccesoAlumno`, que es quien hace la consulta. Cuando un
 * tutor llega con `modo: "tutor"`, el vínculo YA está comprobado — por eso
 * basta el modo para decidir, y por eso esta función se puede probar sin red.
 */

/** Modo con el que un visitante accede al expediente (ver `AccesoAlumno`). */
export type ModoAccesoAlumno =
  | "alumno"
  | "tutor"
  | "directivo"
  | "maestro"
  | "administracion";

/**
 * Modos que PUEDEN escribir el comentario personal. Lista cerrada y explícita:
 * añadir un rol a la matriz de permisos no basta para entrar aquí.
 */
export const MODOS_QUE_EDITAN_COMENTARIO_PERSONAL = [
  "directivo",
  "administracion",
  "tutor",
] as const satisfies readonly ModoAccesoAlumno[];

/** ¿Este modo de acceso puede escribir el comentario personal del alumno? */
export function puedeEditarComentarioPersonal(modo: ModoAccesoAlumno): boolean {
  return (MODOS_QUE_EDITAN_COMENTARIO_PERSONAL as readonly string[]).includes(modo);
}

export type ComentarioPersonalValidado =
  | { ok: true; texto: string }
  | { ok: false; error: string };

/**
 * Normaliza y valida el texto que se va a guardar.
 *
 * El VACÍO es válido a propósito: es como se BORRA la nota. Un campo que se
 * puede escribir y no se puede limpiar obliga a inventar un «.» para vaciarlo.
 * El recorte de espacios va aquí y no en la UI: la action no puede confiar en
 * que el texto venga de nuestro propio formulario.
 */
export function validarComentarioPersonal(
  texto: string,
  maxLongitud: number,
): ComentarioPersonalValidado {
  const limpio = texto.trim();
  if (limpio.length > maxLongitud) {
    return {
      ok: false,
      error: `El comentario no puede pasar de ${maxLongitud} caracteres (lleva ${limpio.length}).`,
    };
  }
  return { ok: true, texto: limpio };
}
