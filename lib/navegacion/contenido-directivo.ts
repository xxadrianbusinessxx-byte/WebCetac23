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
 * Aquí viven solo `grupos-boleta/*`, `administracion/*` y `configuracion/*`.
 *
 * ── Administración escolar ─────────────────────────────────────────────────
 * Los cinco apartados operan. Citas, Reportes y Buzón tienen tablas propias
 * desde el 2026-09-17; Recursos administrativos es la constancia directa por
 * CURP; y Alumnos / Tutores (PROMPT U, 2026-10-01) es el perfil de cualquier
 * alumno, con las MISMAS piezas que ven el alumno y Administración escolar:
 * qué pieza va en cada modo lo decide `vistaAlumnosTutores`, abajo.
 */
import type { PiezaAlumno } from "./contenido-alumno.ts";

/** Piezas reales que ya existen como componente y se reubican en el shell. */
export type PiezaDirectivo =
  | "admin-reportes"
  | "admin-citas"
  | "constancia-directa"
  | "admin-buzon"
  | "boleta-grupo"
  | "grupo-visualizador"
  | "alumnos-tutores"
  | "portada-medios";

/** Clave = `idPestana/idApartado`, tal cual los devuelve el mapa. */
const HUECOS: Readonly<Record<string, PiezaDirectivo>> = {
  // Grupos/Boleta — el panel Excel con el flujo previsualizar→confirmar que el
  // CONTRATO ya exige: descargar plantilla, previsualizar cambios, confirmar.
  "grupos-boleta/boleta": "boleta-grupo",
  "grupos-boleta/grupo": "grupo-visualizador",

  // Administración escolar. Las cuatro pantallas que eran MAQUETA hasta el
  // 2026-09-17. Ahora tienen tablas, actions y panel; el diseño no cambió, lo
  // que cambió es que operan.
  "administracion/reportes": "admin-reportes",
  "administracion/citas": "admin-citas",
  // 2026-09-25: la constancia por CURP. Las solicitudes las acepta solo
  // Administración escolar, en su propia pestaña.
  "administracion/recursos-administrativos": "constancia-directa",
  "administracion/buzon": "admin-buzon",
  // PROMPT U (2026-10-01): el perfil de cualquier alumno, elegido en el buscador
  // del sidebar; qué monta cada modo lo decide `vistaAlumnosTutores`.
  "administracion/alumnos-tutores": "alumnos-tutores",
  // Configuración de la portada pública (PROMPT N): la misma pieza que el técnico.
  "configuracion/video-imagenes": "portada-medios",
};

/**
 * Administración escolar › Citas tiene TRES vistas sobre el mismo hueco, una por
 * modo de la barra (los rótulos los manda el mapa; la suite comprueba que son
 * los mismos). Se decide por IGUALDAD con el rótulo: hasta el 2026-10-01 se
 * miraba si contenía «pendiente», y «Configurar citas» caía en «programadas».
 * Sin modo, «programadas», como antes.
 */
export const MODO_CONFIGURAR_CITAS = "Configurar citas";
export const MODO_CITAS_PENDIENTES = "Citas pendientes";
export const MODO_CITAS_PROGRAMADAS = "Citas programadas";

export type VistaCitas = "configurar" | "pendientes" | "programadas";

export function vistaCitas(modo: string | null): VistaCitas {
  if (modo === MODO_CONFIGURAR_CITAS) return "configurar";
  if (modo === MODO_CITAS_PENDIENTES) return "pendientes";
  return "programadas";
}

/**
 * Administración escolar › Alumnos / Tutores (PROMPT U, 2026-10-01): el perfil
 * del alumno elegido en el buscador, un modo por sección. Solo lo de PERFIL:
 * ningún modo lleva a asistencias ni a calificaciones (la suite recorre los
 * cuatro). Los rótulos son los del mapa; se decide por IGUALDAD, como en Citas.
 *
 * Información personal y Seguimiento médico son las piezas del alumno tal cual
 * (el tutor principal va dentro de Información personal). Reportes y Citas son
 * los paneles de Administración escolar acotados a ese alumno: el directivo los
 * resuelve, no los pide.
 */
export const MODO_INFO_PERSONAL = "Información personal";
export const MODO_SEGUIMIENTO_MEDICO = "Seguimiento médico";
export const MODO_REPORTES_ALUMNO = "Reportes";
export const MODO_CITAS_ALUMNO = "Citas";

export type VistaAlumnosTutores =
  | { tipo: "alumno"; pieza: Extract<PiezaAlumno, "perfil-informacion-personal" | "perfil-seguimiento-medico"> }
  | { tipo: "reportes" }
  | { tipo: "citas" };

/** Sin modo, o con uno desconocido, se abre la información personal. */
export function vistaAlumnosTutores(modo: string | null): VistaAlumnosTutores {
  if (modo === MODO_SEGUIMIENTO_MEDICO) return { tipo: "alumno", pieza: "perfil-seguimiento-medico" };
  if (modo === MODO_REPORTES_ALUMNO) return { tipo: "reportes" };
  if (modo === MODO_CITAS_ALUMNO) return { tipo: "citas" };
  return { tipo: "alumno", pieza: "perfil-informacion-personal" };
}

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
