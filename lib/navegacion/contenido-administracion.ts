/**
 * contenido-administracion.ts — MÓDULO PURO. Qué pieza REAL va en cada hueco del
 * rol Administración escolar (2026-09-24).
 *
 * ── El expediente no tiene piezas propias ──────────────────────────────────
 * Los apartados de «Alumnos» son lo que el alumno y su tutor ven de él —datos
 * personales, estatus, boleta, asistencia, horario…— y se sirven con las MISMAS
 * piezas de `contenido-alumno.ts`. Aquí solo se dice cuál corresponde a cada
 * apartado. Una segunda versión de esas pantallas sería una segunda fuente para
 * los mismos datos (R6). Lo que cambia es el alcance, y ese lo decide el
 * servidor: `resolverAccesoAlumno` le da a este rol cualquier alumno.
 *
 * El resto sí son piezas de este rol, pero hechas de componentes que ya existen:
 * tutores, documentos y mensajes son los mismos paneles del técnico; reportes y
 * solicitudes de constancia, los de Administración escolar del directivo.
 */
import type { PiezaAlumno } from "./contenido-alumno.ts";

export type PiezaAdministracion =
  | { tipo: "alumno"; pieza: PiezaAlumno }
  | { tipo: "tutores" }
  | { tipo: "constancias" }
  | { tipo: "reportes" }
  | { tipo: "documentos" }
  | { tipo: "mensajes-internos" };

const alumno = (pieza: PiezaAlumno): PiezaAdministracion => ({ tipo: "alumno", pieza });

/** Clave = `idPestana/idApartado`, tal cual los devuelve el mapa. */
const HUECOS: Readonly<Record<string, PiezaAdministracion>> = {
  "expediente/datos-personales": alumno("perfil-informacion-personal"),
  "expediente/estatus-academico": alumno("perfil-registro-calificaciones"),
  "expediente/boleta": alumno("materias-calificacion"),
  "expediente/asistencia": alumno("asistencia-tabular"),
  "expediente/calendario-asistencia": alumno("calendario-asistencia"),
  "expediente/horario": alumno("calendario-horario"),
  "expediente/seguimiento-semestral": alumno("perfil-seguimiento-semestral"),
  "expediente/seguimiento-medico": alumno("perfil-seguimiento-medico"),
  "expediente/notificaciones": alumno("perfil-notificaciones"),

  "tutores/tutores": { tipo: "tutores" },
  "tramites/constancias": { tipo: "constancias" },
  "tramites/reportes": { tipo: "reportes" },
  "documentos/documentos": { tipo: "documentos" },
  "mensajes/bandeja": { tipo: "mensajes-internos" },
};

/** Pieza que corresponde a un hueco, o `null` si ese hueco no tiene pieza. */
export function piezaDe(idPestana: string, idApartado: string): PiezaAdministracion | null {
  return HUECOS[`${idPestana}/${idApartado}`] ?? null;
}

/** Huecos con pieza real. Para la suite: todo apartado del mapa debe tener una. */
export function huecosConPieza(): string[] {
  return Object.keys(HUECOS);
}

/**
 * ¿Esta pieza, en este modo, necesita un alumno elegido? Sin él se pide que se
 * busque uno. Las SOLICITUDES de constancia son la lista de todas, no la de un
 * alumno; la vista previa sí es de uno. Reportes lo resuelve su propio panel:
 * listar no necesita alumno y crear sí.
 */
export function necesitaAlumno(p: PiezaAdministracion, modo: string | null): boolean {
  if (p.tipo === "alumno") return true;
  if (p.tipo === "constancias") return !(modo ?? "").startsWith("Solicitudes");
  return false;
}
