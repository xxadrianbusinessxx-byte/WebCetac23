/**
 * contenido-directivo.ts — MÓDULO PURO. Qué pieza REAL va en cada hueco que es
 * EXCLUSIVO del directivo en el shell Océano.
 *
 * ── Alcance deliberadamente parcial ────────────────────────────────────────
 * El directivo es el profesor MÁS dos pestañas. Las dos que comparte —Materias
 * y Calendario/Asistencias— NO están aquí: las sirve el emparejamiento del
 * docente, y son el MISMO objeto de pestaña en el mapa (la suite lo verifica).
 * Duplicarlas en este archivo crearía dos fuentes para el mismo hueco, que es
 * justo lo que estos módulos existen para evitar (R6).
 *
 * Aquí viven solo `grupos-boleta/*` y `administracion/*`.
 *
 * ── Por qué casi todo Administración escolar está vacío ────────────────────
 * Citas, Reportes, Recursos administrativos y Buzón son cuatro entidades que
 * el diseño define por completo y que Supabase NO tiene. Están apagadas en el
 * mapa, con su barra de modo visible: es la «piel» que documenta la forma
 * final sin prometer datos. Por eso no figuran aquí — un hueco apagado no
 * tiene pieza, y el shell dibuja su estado.
 *
 * El único apartado activo de esa pestaña es Alumnos / Tutores.
 */

/** Piezas reales que ya existen como componente y se reubican en el shell. */
export type PiezaDirectivo =
  | "admin-reportes"
  | "admin-citas"
  | "admin-constancias"
  | "admin-buzon"
  | "boleta-grupo"
  | "grupo-visualizador"
  | "alumnos-tutores";

/** Clave = `idPestana/idApartado`, tal cual los devuelve el mapa. */
const HUECOS: Readonly<Record<string, PiezaDirectivo>> = {
  // Grupos/Boleta — el panel Excel con el flujo previsualizar→confirmar que el
  // CONTRATO ya exige: descargar plantilla, previsualizar cambios, confirmar.
  "grupos-boleta/boleta": "boleta-grupo",
  "grupos-boleta/grupo": "grupo-visualizador",

  // Administración escolar — el único activo. Selector de ámbito
  // (grado · grupo · carrera) + lista + ficha con su tutor + «Entrar al perfil».
  // Las cuatro pantallas que eran MAQUETA hasta el 2026-09-17. Ahora tienen
  // tablas, actions y panel; el diseño no cambió, lo que cambió es que operan.
  "administracion/reportes": "admin-reportes",
  "administracion/citas": "admin-citas",
  "administracion/recursos-administrativos": "admin-constancias",
  "administracion/buzon": "admin-buzon",
  "administracion/alumnos-tutores": "alumnos-tutores",

  // Citas, Reportes, Recursos administrativos y Buzón: SIN entrada a propósito.
  // Apagados en el mapa por falta de modelo de datos.
};

/** Pieza que corresponde a un hueco, o `null` si ese hueco no tiene pieza. */
export function piezaDe(idPestana: string, idApartado: string): PiezaDirectivo | null {
  return HUECOS[`${idPestana}/${idApartado}`] ?? null;
}

/** Huecos con pieza real. Para el registro de lo reubicado. */
export function huecosConPieza(): string[] {
  return Object.keys(HUECOS);
}

/**
 * Las dos pestañas que el directivo comparte con el profesor. Quien pinta debe
 * resolverlas con el emparejamiento del docente, NO con este módulo.
 * Existe como dato para que la comprobación sea automática en vez de un
 * comentario que alguien lee o no.
 */
export const PESTANAS_COMPARTIDAS_CON_DOCENTE: readonly string[] = [
  "materias",
  "calendario-asistencias",
];

/** ¿Este hueco lo sirve el emparejamiento del docente en vez de este módulo? */
export function esPestanaCompartida(idPestana: string): boolean {
  return PESTANAS_COMPARTIDAS_CON_DOCENTE.includes(idPestana);
}
