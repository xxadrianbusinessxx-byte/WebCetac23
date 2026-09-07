/**
 * PROMPT-4/T4 — Decisión PURA de bloqueo del borrado por paso (sin BD).
 * Vive fuera de borrar-paso.ts (que importa Supabase) para poder probarse
 * como los demás módulos puros del repo.
 */
export type PasoConfigurador =
  | "academico"
  | "calendario"
  | "horario"
  | "evaluaciones"
  | "roster";

export const PASOS_CONFIGURADOR: PasoConfigurador[] = [
  "academico",
  "calendario",
  "horario",
  "evaluaciones",
  "roster",
];

/** Datos de entrada de la decisión de bloqueo (conteos, sin BD). */
export type ContextoBloqueoPaso = {
  paso: PasoConfigurador;
  activo: boolean;
  estado: string;
  grupos: number;
  grupoMaterias: number;
  inscripciones: number;
  asignaciones: number;
  clasesImpartidas: number;
  asistenciaAlumnos: number;
  justificaciones: number;
};

/**
 * Qué bloquea el borrado de un paso. Vacío = puede borrarse.
 * Reglas (contrato PROMPT-4): nunca dejar datos derivados huérfanos; el roster
 * del OPERATIVO no se borra en bloque (usar la baja por CURP de T3); un paso
 * vacío no tiene sentido borrar.
 */
export function calcularBloqueosPaso(ctx: ContextoBloqueoPaso): string[] {
  const bloqueos: string[] = [];
  if (ctx.paso === "academico" && (ctx.grupos + ctx.grupoMaterias) === 0) {
    bloqueos.push("No hay contexto académico (grupos/grupo_materias) que borrar.");
  }
  if (ctx.paso === "academico" && ctx.inscripciones > 0) {
    bloqueos.push(
      `El ciclo tiene ${ctx.inscripciones} inscripciones: borrar el contexto académico las dejaría huérfanas. Deshaz primero el paso "roster".`,
    );
  }
  if (ctx.paso === "academico" && ctx.asignaciones > 0) {
    bloqueos.push(
      `Hay ${ctx.asignaciones} asignaciones profesor→materia ligadas a este contexto.`,
    );
  }
  if (
    (ctx.paso === "horario" || ctx.paso === "calendario") &&
    (ctx.clasesImpartidas > 0 || ctx.asistenciaAlumnos > 0 || ctx.justificaciones > 0)
  ) {
    bloqueos.push(
      `Hay actividad registrada contra este ${ctx.paso === "horario" ? "horario" : "calendario"} (${ctx.clasesImpartidas} clases · ${ctx.asistenciaAlumnos} asistencias · ${ctx.justificaciones} justificaciones). No se borra en silencio: revísalo.`,
    );
  }
  if (ctx.paso === "roster" && ctx.activo && ctx.inscripciones > 0) {
    bloqueos.push(
      "Es el ciclo OPERATIVO con inscripciones: el roster no se borra en bloque. Usa la baja/restauración por CURP (T3).",
    );
  }
  if (ctx.paso === "roster" && ctx.inscripciones === 0) {
    bloqueos.push("No hay inscripciones en este ciclo.");
  }
  return bloqueos;
}
