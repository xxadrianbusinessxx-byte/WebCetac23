/**
 * ORDEN ALFABÉTICO DE ALUMNOS — módulo puro, sin I/O.
 *
 * El estándar escolar es **apellido paterno, A→Z**; luego materno y luego
 * nombre de pila. Antes las descargas ordenaban por el nombre completo, que
 * empieza por el nombre de pila (`nombreCompletoAlumno` devuelve
 * "NOMBRE P_APELLIDO S_APELLIDO"), así que salían ordenadas por nombre.
 *
 * Se usa en TODA descarga o listado que contenga alumnos, para que el orden sea
 * el mismo en la plantilla de asistencia, la de materia y cualquiera que venga.
 */

/** Lo mínimo que hace falta para ordenar: los tres campos del nombre. */
export type NombreAlumnoPartes = {
  P_APELLIDO?: string | null;
  S_APELLIDO?: string | null;
  NOMBRE?: string | null;
};

/**
 * Clave de ordenación: `PATERNO|MATERNO|NOMBRE`, sin acentos ni mayúsculas.
 * Se normaliza para que "PEÑA" y "PENA" u "Ordoñez" y "ORDONEZ" no queden en
 * extremos opuestos de la lista por un detalle de escritura.
 */
export function claveOrdenAlumno(row: NombreAlumnoPartes): string {
  const limpia = (v: string | null | undefined) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  return [limpia(row.P_APELLIDO), limpia(row.S_APELLIDO), limpia(row.NOMBRE)].join("|");
}

/**
 * Comparador por apellido paterno (A→Z). Los alumnos sin apellido paterno van
 * al final: es un dato incompleto, y esconderlo al principio de la lista hace
 * que nadie lo corrija.
 */
export function compararAlumnosPorApellido(
  a: NombreAlumnoPartes,
  b: NombreAlumnoPartes,
): number {
  const pa = String(a.P_APELLIDO ?? "").trim();
  const pb = String(b.P_APELLIDO ?? "").trim();
  if (!pa && pb) return 1;
  if (pa && !pb) return -1;
  return claveOrdenAlumno(a).localeCompare(claveOrdenAlumno(b), "es");
}

/** Ordena una copia; no muta la lista recibida. */
export function ordenarAlumnosPorApellido<T extends NombreAlumnoPartes>(
  alumnos: readonly T[],
): T[] {
  return [...alumnos].sort(compararAlumnosPorApellido);
}

/**
 * Comparador para listas que solo conservan la clave de orden ya calculada
 * (p. ej. `AlumnoPlantilla`, que guarda el nombre para mostrar y la clave
 * aparte porque el nombre mostrado empieza por el nombre de pila).
 */
export function compararPorClaveOrden(
  a: { claveOrden?: string },
  b: { claveOrden?: string },
): number {
  const ca = a.claveOrden ?? "";
  const cb = b.claveOrden ?? "";
  const sinA = ca.startsWith("|");
  const sinB = cb.startsWith("|");
  if (sinA && !sinB) return 1;
  if (!sinA && sinB) return -1;
  return ca.localeCompare(cb, "es");
}
