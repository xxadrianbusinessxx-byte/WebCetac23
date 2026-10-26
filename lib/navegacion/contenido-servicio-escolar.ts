/**
 * contenido-servicio-escolar.ts — MÓDULO PURO. Qué pieza va en cada hueco del
 * rol Servicio Escolar (2026-10-25).
 *
 * Son dos huecos y ya. El rol consulta el padrón y se lleva los archivos; no
 * hay una tercera pantalla esperando a construirse, y que la lista sea corta
 * es la función, no una fase intermedia.
 */

export type PiezaServicioEscolar = { tipo: "padron" } | { tipo: "archivos" };

/** Clave = `idPestana/idApartado`, tal cual los devuelve el mapa. */
const HUECOS: Readonly<Record<string, PiezaServicioEscolar>> = {
  "alumnos/padron": { tipo: "padron" },
  "descargas/archivos": { tipo: "archivos" },
};

/** Pieza que corresponde a un hueco, o `null` si ese hueco no tiene pieza. */
export function piezaDe(idPestana: string, idApartado: string): PiezaServicioEscolar | null {
  return HUECOS[`${idPestana}/${idApartado}`] ?? null;
}

/** Huecos con pieza real. Para la suite: todo apartado del mapa debe tener una. */
export function huecosConPieza(): string[] {
  return Object.keys(HUECOS);
}
