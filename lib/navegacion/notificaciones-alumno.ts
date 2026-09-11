/**
 * notificaciones-alumno.ts — MÓDULO PURO. «Perfil › Notificaciones» del alumno:
 * UNA sola lista a partir de DOS fuentes que ya existen (comentarios y
 * justificaciones).
 *
 * Por qué existe: qué entra en la lista y en qué orden es una decisión, no una
 * presentación. Escrita con condicionales dentro del JSX no se puede probar ni
 * cambiar sin tocar React, y acabaría habiendo dos órdenes distintos en dos
 * pantallas. Aquí está una sola vez, con su suite.
 *
 * No hace I/O y no conoce la base de datos: recibe filas ya leídas por las
 * acciones que ya existían (los comentarios vienen dentro de
 * `actionObtenerPerfilAlumno`; las justificaciones, de
 * `actionObtenerJustificacionesDeAlumno`, la MISMA vía que usa el calendario).
 *
 * ── La regla de orden (una sola vez, aquí) ────────────────────────────────
 *   1. `fecha` descendente. En `YYYY-MM-DD` el orden lexicográfico ya es
 *      cronológico, así que no se construye ningún `Date` (sin zona horaria ni
 *      horas: las dos fuentes guardan el día).
 *   2. Sin fecha (`null`) al final, conservando su orden de entrada. Una entrada
 *      sin fecha no puede intercalarse por fecha sin inventársela.
 *   3. A igualdad de fecha, primero lo que PIDE ACCIÓN (`pendiente`), después lo
 *      resuelto. Es lo que deja el aviso destacado del diseño arriba.
 *   4. Desempate final por `clave` para que el orden sea el MISMO en dos
 *      renders (y la suite pueda afirmarlo).
 */

export type FuenteNotificacion = "comentario" | "justificacion";

export type EstadoJustificacionNotificacion = "pendiente" | "aprobada" | "rechazada";

/** Lo mínimo que este módulo necesita de `ComentarioRow`. */
export type ComentarioNotificacion = {
  comentario: string;
  fecha: string | null;
};

/** Lo mínimo que este módulo necesita de `FilaJustificacion`. */
export type JustificacionNotificacion = {
  fecha: string;
  motivo: string;
  estado: EstadoJustificacionNotificacion;
};

export type NotificacionAlumno = {
  /** Identidad estable de la entrada (para pintar listas sin parpadeos). */
  clave: string;
  fuente: FuenteNotificacion;
  /** `YYYY-MM-DD`, o `null` si la fuente no trae fecha. */
  fecha: string | null;
  /** Rótulo corto de la fuente. */
  titulo: string;
  /** Texto a mostrar. */
  detalle: string;
  /** Solo las justificaciones tienen estado. */
  estado: EstadoJustificacionNotificacion | null;
};

export const ETIQUETA_FUENTE: Readonly<Record<FuenteNotificacion, string>> = {
  comentario: "Comentario",
  justificacion: "Justificación",
};

/** Los dos rótulos de la barra de modo los manda el mapa de navegación. */
export const MODO_COMENTARIOS = "Comentarios";
export const MODO_JUSTIFICACIONES = "Justificaciones";

/** Del rótulo del modo a la fuente. `null` = el modo no filtra (lista entera). */
export function fuenteDelModo(modo: string | null): FuenteNotificacion | null {
  if (modo === MODO_COMENTARIOS) return "comentario";
  if (modo === MODO_JUSTIFICACIONES) return "justificacion";
  return null;
}

/** Lo que pide acción va antes que lo resuelto cuando comparten fecha. */
function pesoAccion(n: NotificacionAlumno): number {
  return n.estado === "pendiente" ? 0 : 1;
}

function comparar(a: NotificacionAlumno, b: NotificacionAlumno): number {
  if (a.fecha === null && b.fecha === null) return a.clave.localeCompare(b.clave);
  if (a.fecha === null) return 1; // sin fecha, al final
  if (b.fecha === null) return -1;
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1; // descendente
  const porAccion = pesoAccion(a) - pesoAccion(b);
  if (porAccion !== 0) return porAccion;
  return a.clave.localeCompare(b.clave);
}

/**
 * La lista completa, ordenada. `limite` (opcional) se aplica DESPUÉS de ordenar,
 * aquí y no en el componente: «las últimas N» sin ordenar serían otras N.
 */
export function notificacionesDeAlumno(entrada: {
  comentarios: readonly ComentarioNotificacion[];
  justificaciones: readonly JustificacionNotificacion[];
  limite?: number;
}): NotificacionAlumno[] {
  const deComentario: NotificacionAlumno[] = entrada.comentarios.map((c, i) => ({
    clave: `comentario-${i}`,
    fuente: "comentario",
    fecha: c.fecha && c.fecha.trim() ? c.fecha : null,
    titulo: ETIQUETA_FUENTE.comentario,
    detalle: c.comentario,
    estado: null,
  }));

  const deJustificacion: NotificacionAlumno[] = entrada.justificaciones.map((j, i) => ({
    clave: `justificacion-${i}`,
    fuente: "justificacion",
    fecha: j.fecha && j.fecha.trim() ? j.fecha : null,
    titulo: ETIQUETA_FUENTE.justificacion,
    detalle: j.motivo,
    estado: j.estado,
  }));

  const lista = [...deComentario, ...deJustificacion].sort(comparar);
  return typeof entrada.limite === "number" ? lista.slice(0, entrada.limite) : lista;
}

/** Filtra por el modo activo. Un modo que no filtra devuelve la lista entera. */
export function filtrarPorModo(
  lista: readonly NotificacionAlumno[],
  modo: string | null,
): NotificacionAlumno[] {
  const fuente = fuenteDelModo(modo);
  return fuente ? lista.filter((n) => n.fuente === fuente) : [...lista];
}

/** ¿Hay algo que pida acción? Es lo que enciende el punto de aviso del diseño. */
export function hayPendiente(lista: readonly NotificacionAlumno[]): boolean {
  return lista.some((n) => n.estado === "pendiente");
}
