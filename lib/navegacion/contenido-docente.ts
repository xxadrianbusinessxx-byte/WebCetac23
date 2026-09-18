/**
 * contenido-docente.ts — MÓDULO PURO. Qué pieza REAL va en cada hueco de las
 * pestañas que comparten MAESTRO y DIRECTIVO en el shell Océano.
 *
 * Mismo contrato que `contenido-alumno.ts`: solo el emparejamiento
 * hueco → pieza, con los identificadores del mapa. Sin datos, sin base de
 * datos, sin permisos.
 *
 * ── Por qué un módulo «docente» y no uno por rol ───────────────────────────
 * El directivo es el profesor MÁS dos pestañas. `Materias` y
 * `Calendario/Asistencias` son el MISMO objeto de pestaña en el mapa para los
 * dos roles (la suite lo verifica), así que su emparejamiento tiene que ser
 * uno solo. Tener `contenido-maestro.ts` y `contenido-directivo.ts` con las
 * mismas dos pestañas dentro daría dos fuentes para el mismo hueco (R6) y
 * divergirían a la primera corrección.
 *
 * `contenido-directivo.ts` cubre SOLO lo exclusivo del directivo
 * (`grupos-boleta/*` y `administracion/*`) y expone
 * PESTANAS_COMPARTIDAS_CON_DOCENTE para que la separación se compruebe sola.
 *
 * ── El alcance no se decide aquí ───────────────────────────────────────────
 * Qué materias ve un maestro lo decide el servidor (R-4: con asignaciones
 * activas se estrecha solo; sin ellas cae al catálogo del operativo). Este
 * módulo no sabe de eso y no debe: empareja huecos, no filtra datos.
 */

/** Piezas reales que ya existen como componente y se reubican en el shell. */
export type PiezaDocente =
  | "materia-avance"
  | "materia-asistencia"
  | "asistencia-alumnos"
  | "calendario-escolar"
  | "mensajes-internos";

/** Clave = `idPestana/idApartado`, tal cual los devuelve el mapa. */
const HUECOS: Readonly<Record<string, PiezaDocente>> = {
  // Materias — se abre en el catálogo (selector de ámbito + buscador); estos
  // apartados aparecen al seleccionar una materia.
  "materias/calificaciones": "materia-avance",
  "materias/asistencia": "materia-asistencia",

  // Calendario/Asistencias
  "calendario-asistencias/asistencias": "asistencia-alumnos",

  // El calendario del ciclo, VISTO. Durante las fases 5 y 6 este hueco quedó
  // sin pieza a propósito: el único componente que existía
  // (`calendario-escolar-panel.tsx`) es un editor, y sus actions exigen
  // `calendario.editar` —capacidad que ni el maestro ni el directivo tienen—,
  // así que montarlo tal cual les habría enseñado controles que el servidor
  // rechaza. Se resolvió dándole a ESE MISMO componente un modo `soloLectura`
  // en vez de escribir un segundo calendario (R6): la lectura
  // (`calendario.ver`) la tienen los cinco roles, y el dibujo del mes es el
  // mismo. Lo único que se apaga son los controles que escriben.
  "calendario-asistencias/calendario-escolar": "calendario-escolar",

  // Mensajería interna. Vive aquí porque maestro y directivo comparten la
  // pestaña, igual que Materias y Calendario.
  "mensajes/bandeja": "mensajes-internos",
};

/** Pieza que corresponde a un hueco, o `null` si ese hueco no tiene pieza. */
export function piezaDe(idPestana: string, idApartado: string): PiezaDocente | null {
  return HUECOS[`${idPestana}/${idApartado}`] ?? null;
}

/** Huecos con pieza real. Para el registro de lo reubicado. */
export function huecosConPieza(): string[] {
  return Object.keys(HUECOS);
}

/**
 * Sub-vista activa de `materias/calificaciones`. El mapa le da dos modos y
 * cada uno monta un componente distinto sobre la MISMA materia:
 *   «Avance»                  → la tabla de calificaciones
 *   «Configuración de columnas» → el asistente de mapeo
 * La traducción modo → componente es presentación y vive en quien pinta; lo
 * que vive aquí es que son dos vistas del mismo hueco, no dos huecos.
 */
export function esModoConfiguracion(modo: string | null): boolean {
  return (modo ?? "").toLowerCase().startsWith("config");
}
