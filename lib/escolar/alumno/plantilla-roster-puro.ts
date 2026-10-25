/**
 * plantilla-roster-puro.ts — MÓDULO PURO. La forma de la hoja que se baja para
 * rellenar el roster. 2026-10-25.
 *
 * La regla que sostiene todo esto: **los encabezados que se bajan tienen que
 * ser alias que la carga reconozca**. Si no, el viaje de ida y vuelta (bajar →
 * rellenar → subir) obliga a mapear columnas a mano, que es justo la fricción
 * que la plantilla viene a quitar. Por eso `test-plantilla-roster.mjs`
 * comprueba, uno a uno, que `detectarCampoPorEncabezado` reconozca cada
 * encabezado de aquí y lo mande al campo correcto.
 */

/** Campos de la hoja, en el orden en que se leen en una lista escolar. */
export const ENCABEZADOS_PLANTILLA_ROSTER = [
  "CURP",
  "P_APELLIDO",
  "S_APELLIDO",
  "NOMBRE",
  "NUMERO DE CONTROL",
  "GRADO",
  "GRUPO",
  "CARRERA",
] as const;

export type DatosFilaPlantilla = {
  curp: string;
  pApellido: string;
  sApellido: string;
  nombre: string;
  numeroControl: string;
  grado: string;
  grupo: string;
  carrera: string;
};

/**
 * Una fila de la hoja, en el mismo orden que `ENCABEZADOS_PLANTILLA_ROSTER`.
 * Lo que no se sabe va como celda vacía —no como «—» ni «N/D»—: la celda vacía
 * es la que se puede rellenar y volver a subir sin limpiar nada antes.
 */
export function filaPlantillaRoster(d: DatosFilaPlantilla): string[] {
  return [
    d.curp.trim().toUpperCase(),
    d.pApellido.trim(),
    d.sApellido.trim(),
    d.nombre.trim(),
    d.numeroControl.trim(),
    d.grado.trim(),
    d.grupo.trim(),
    d.carrera.trim(),
  ];
}
