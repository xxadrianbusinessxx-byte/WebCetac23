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
  | "materias-actividades"
  | "materias-recursos"
  | "perfil-sesiones-programadas"
  | "materias-calificacion"
  | "calendario-horario"
  | "calendario-asistencia"
  | "perfil-informacion-personal"
  | "perfil-registro-calificaciones"
  // Fase 3 — contenido nuevo (cierra el alumno en /oceano).
  | "perfil-notificaciones"
  | "perfil-seguimiento-semestral"
  | "perfil-seguimiento-medico"
  | "asistencia-tabular"
  // Fase 9 — solo del TUTOR. El apartado `perfil/mensajes-tutor` no existe en
  // el mapa del alumno, así que esta pieza nunca se le ofrece: la ausencia en
  // el mapa es lo que decide, no una comprobación de rol aquí.
  | "perfil-mensajes-tutor";

/** Clave = `idPestana/idApartado`, tal cual los devuelve el mapa. */
const HUECOS: Readonly<Record<string, PiezaAlumno>> = {
  // Encendidas el 2026-09-17. «Sesiones programadas» lee la MISMA tabla que
  // «Citas» del directivo: una entidad, dos vistas (R6).
  "materias/actividades": "materias-actividades",
  "materias/recursos": "materias-recursos",
  "perfil/sesiones-programadas": "perfil-sesiones-programadas",
  "materias/calificacion": "materias-calificacion",
  "calendario/horario-escolar": "calendario-horario",
  "calendario/calendario-escolar": "calendario-asistencia",
  // Fase 3.1 — este apartado perdió sus sub-vistas (el calendario visual vive,
  // único, en «Calendario escolar»): su pieza es siempre la tabla de datos crudos.
  "calendario/asistencia": "asistencia-tabular",
  "perfil/informacion-personal": "perfil-informacion-personal",
  "perfil/seguimiento-semestral": "perfil-seguimiento-semestral",
  "perfil/seguimiento-medico": "perfil-seguimiento-medico",
  "perfil/notificaciones": "perfil-notificaciones",
  "perfil/estatus-academico": "perfil-registro-calificaciones",
  "perfil/mensajes-tutor": "perfil-mensajes-tutor",
};

/** Pieza que corresponde a un hueco, o `null` si ese hueco no tiene pieza. */
export function piezaDe(idPestana: string, idApartado: string): PiezaAlumno | null {
  return HUECOS[`${idPestana}/${idApartado}`] ?? null;
}

/** Huecos con pieza real. Para el registro de lo reubicado. */
export function huecosConPieza(): string[] {
  return Object.keys(HUECOS);
}

/**
 * Ajustes de PRESENTACIÓN de un hueco (Fase 4).
 *
 * No dependen del rol: el mapa del tutor es el MISMO objeto que el del alumno y
 * estos ajustes son propiedades del hueco. `permitirJustificacion` marca el
 * calendario mensual, donde puede justificarse una falta: la capacidad
 * `justificacion.solicitar` la tienen los dos roles que comparten este mapa y la
 * action valida la relación en el servidor, así que la afirmación es cierta para
 * ambos (un botón visible que el servidor rechazara sería un bug de la matriz).
 */
export type OpcionesPieza = {
  /** El calendario mensual permite solicitar justificación de una falta. */
  permitirJustificacion: boolean;
};

export function opcionesDePieza(idPestana: string, idApartado: string): OpcionesPieza {
  return {
    permitirJustificacion: `${idPestana}/${idApartado}` === "calendario/calendario-escolar",
  };
}
