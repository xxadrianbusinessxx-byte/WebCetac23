/**
 * contenido-alumno.ts — MÓDULO PURO. Qué pieza REAL va en cada hueco del shell
 * Océano para el rol alumno (Fase 2 «reubicar lo que ya funciona»).
 *
 * Por qué existe: el shell (`app/components/oceano/`) es presentación y no debe
 * llevar esta decisión escrita en el JSX. Aquí está **solo el emparejamiento**
 * hueco → pieza, con los MISMOS identificadores del mapa de navegación
 * (`lib/navegacion/mapa-navegacion.ts`): pestaña / apartado. Quien pinta
 * (`ContenidoAlumnoOceano`) traduce el id de pieza a un componente React.
 *
 * Sin datos ni base de datos: no decide permisos ni consulta nada. Si un hueco
 * no figura aquí, el shell dibuja su marcador (o el estado apagado del mapa).
 *
 * Estado tras la Fase 3: **todos** los apartados activos del alumno tienen pieza.
 * Los que se cerraban en la Fase 2 se montaban tal cual (reubicación); los de la
 * Fase 3 se construyen con datos ya cargados o con las acciones que ya existían,
 * y su decisión de contenido vive en sus propios módulos puros
 * (`notificaciones-alumno.ts` para la lista de notificaciones).
 */

/** Piezas reales que ya existen como componente y se reubican en el shell. */
export type PiezaAlumno =
  | "materias-calificacion"
  | "calendario-horario"
  | "calendario-asistencia"
  | "perfil-informacion-personal"
  | "perfil-registro-calificaciones"
  // Fase 3 — contenido nuevo (cierra el alumno en /oceano).
  | "perfil-notificaciones"
  | "perfil-seguimiento-semestral"
  | "perfil-seguimiento-medico"
  | "asistencia-subvistas";

/** Clave = `idPestana/idApartado`, tal cual los devuelve el mapa. */
const HUECOS: Readonly<Record<string, PiezaAlumno>> = {
  "materias/calificacion": "materias-calificacion",
  "calendario/horario-escolar": "calendario-horario",
  "calendario/calendario-escolar": "calendario-asistencia",
  // Este apartado tiene DOS sub-vistas (modos del mapa: «Calendario visual» y
  // «Datos crudos»); la pieza las resuelve con el modo activo, sin duplicar la
  // lectura: las dos son excluyentes y comparten la misma acción.
  "calendario/asistencia": "asistencia-subvistas",
  "perfil/informacion-personal": "perfil-informacion-personal",
  "perfil/seguimiento-semestral": "perfil-seguimiento-semestral",
  "perfil/seguimiento-medico": "perfil-seguimiento-medico",
  "perfil/notificaciones": "perfil-notificaciones",
  "perfil/estatus-academico": "perfil-registro-calificaciones",
};

/** Pieza que corresponde a un hueco, o `null` si ese hueco no tiene pieza. */
export function piezaDe(idPestana: string, idApartado: string): PiezaAlumno | null {
  return HUECOS[`${idPestana}/${idApartado}`] ?? null;
}

/** Huecos con pieza real. Para el registro de lo reubicado. */
export function huecosConPieza(): string[] {
  return Object.keys(HUECOS);
}
