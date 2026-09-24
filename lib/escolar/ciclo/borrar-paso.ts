/**
 * PROMPT-4/T4 — Deshacer los datos de UN PASO del configurador sin borrar el
 * ciclo (no reimplementa `eliminar_ciclo`, que borra el ciclo entero).
 *
 * Pasos soportados y qué tablas tocan (siempre por `periodo_id` o por los
 * grupos del periodo):
 *   - "academico"   → grupos, grupo_materias, semestres del periodo
 *   - "calendario"  → calendario_escolar (periodo_id)
 *   - "horario"     → horario_semanal (periodo_id)
 *   - "evaluaciones"→ periodos_evaluacion (periodo_id)
 *   - "roster"      → inscripciones_alumno de los grupos del periodo
 *
 * Reglas (contrato PROMPT-4):
 *   - NUNCA borra `ALUMNOS`, `PROFESORES`, `periodos` ni `supabase/*.sql`.
 *   - Todo borrado es previsualizar → confirmar: la previsualización devuelve
 *     conteos exactos y los BLOQUEOS si el paso arrastra datos derivados
 *     (asistencia/justificaciones/clases registradas, asignaciones, etc.).
 *   - Lo reversible se prefiere a lo irreversible. Por eso el paso "roster"
 *     NO borra: desactiva + marca `decision_manual` cuando es una decisión
 *     humana (T1/T3); el borrado físico de inscripciones de un BORRADOR sí
 *     está permitido (no operativo) y es el "deshacer roster preparado".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarPeriodo } from "./ciclo-estado.ts";
import { resolverEstadoPeriodo } from "./ciclo-estado-puro.ts";
import {
  calcularBloqueosPaso,
  PASOS_CONFIGURADOR,
  type PasoConfigurador,
} from "./borrar-paso-puro.ts";
import {
  TABLA_ASIGNACIONES_PROFESOR,
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_CALENDARIO_ESCOLAR,
  TABLA_CLASES_IMPARTIDAS,
  TABLA_GRUPO_MATERIAS,
  TABLA_GRUPOS,
  TABLA_HORARIO_SEMANAL,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_JUSTIFICACIONES_ASISTENCIA,
  TABLA_PERIODOS_EVALUACION,
  TABLA_SEMESTRES,
} from "../tables.ts";

// Re-export del dominio PURO (borrar-paso-puro.ts): la decisión de bloqueo
// vive allí, sin BD, para poder probarse.
export {
  calcularBloqueosPaso,
  PASOS_CONFIGURADOR,
  type ContextoBloqueoPaso,
  type PasoConfigurador,
} from "./borrar-paso-puro.ts";

export type ConteosPaso = Record<PasoConfigurador, number> & {
  derivados: {
    asignaciones: number;
    clasesImpartidas: number;
    asistenciaAlumnos: number;
    justificaciones: number;
  };
};

export type PreviewBorrarPaso =
  | {
      ok: true;
      paso: PasoConfigurador;
      periodoId: string;
      periodoNombre: string;
      estado: string;
      activo: boolean;
      conteos: ConteosPaso;
      /** Razones que bloquean (vacío = puede borrarse). */
      bloqueos: string[];
    }
  | { ok: false; error: string };

async function contar(
  supabase: SupabaseClient,
  tabla: string,
  columna: string,
  valores: string[],
): Promise<number> {
  if (valores.length === 0) return 0;
  const { data, error } = await supabase
    .from(tabla)
    .select("id")
    .in(columna, valores)
    .limit(100000);
  if (error) return 0;
  return (data ?? []).length;
}

async function idsDe(
  supabase: SupabaseClient,
  tabla: string,
  columna: string,
  valores: string[],
): Promise<string[]> {
  if (valores.length === 0) return [];
  const { data, error } = await supabase
    .from(tabla)
    .select("id")
    .in(columna, valores)
    .limit(100000);
  if (error || !data) return [];
  return (data as { id: string }[]).map((d) => d.id);
}

/** Previsualiza el borrado de un paso: conteos exactos y bloqueos. NO escribe. */
export async function previsualizarBorrarPaso(
  supabase: SupabaseClient,
  periodoIdRaw: string,
  pasoRaw: string,
): Promise<PreviewBorrarPaso> {
  const periodoId = periodoIdRaw.trim();
  const paso = pasoRaw.trim() as PasoConfigurador;
  if (!periodoId) return { ok: false, error: "Ciclo no válido." };
  if (!PASOS_CONFIGURADOR.includes(paso)) {
    return { ok: false, error: `Paso no soportado: ${pasoRaw}.` };
  }

  const rp = await consultarPeriodo(supabase, periodoId);
  if (rp.error) return { ok: false, error: rp.error };
  const periodo = rp.periodo;
  if (!periodo) return { ok: false, error: "El ciclo no existe." };
  const estado = resolverEstadoPeriodo(periodo);
  const activo = Boolean(periodo.activo);

  const grupoIds = await idsDe(supabase, TABLA_GRUPOS, "periodo_id", [periodoId]);
  const [grupos, grupoMaterias, semestres, parciales, horario, calendario, inscripciones] =
    await Promise.all([
      contar(supabase, TABLA_GRUPOS, "periodo_id", [periodoId]),
      contar(supabase, TABLA_GRUPO_MATERIAS, "grupo_id", grupoIds),
      contar(supabase, TABLA_SEMESTRES, "periodo_id", [periodoId]),
      contar(supabase, TABLA_PERIODOS_EVALUACION, "periodo_id", [periodoId]),
      contar(supabase, TABLA_HORARIO_SEMANAL, "periodo_id", [periodoId]),
      contar(supabase, TABLA_CALENDARIO_ESCOLAR, "periodo_id", [periodoId]),
      contar(supabase, TABLA_INSCRIPCIONES_ALUMNO, "grupo_id", grupoIds),
    ]);

  // Derivados (nunca se borran por paso; bloquean si existen).
  const gmIds = await idsDe(supabase, TABLA_GRUPO_MATERIAS, "grupo_id", grupoIds);
  const [asignaciones, clasesImpartidas, asistenciaAlumnos, justificaciones] =
    await Promise.all([
      contar(supabase, TABLA_ASIGNACIONES_PROFESOR, "grupo_materia_id", gmIds),
      contar(supabase, TABLA_CLASES_IMPARTIDAS, "periodo_id", [periodoId]),
      contar(supabase, TABLA_ASISTENCIA_ALUMNOS, "periodo_id", [periodoId]),
      contar(supabase, TABLA_JUSTIFICACIONES_ASISTENCIA, "periodo_id", [periodoId]),
    ]);

  const conteos: ConteosPaso = {
    academico: 0,
    calendario: 0,
    horario: 0,
    evaluaciones: 0,
    roster: 0,
    derivados: { asignaciones, clasesImpartidas, asistenciaAlumnos, justificaciones },
  };
  conteos.academico = grupos + grupoMaterias + semestres;
  conteos.calendario = calendario;
  conteos.horario = horario;
  conteos.evaluaciones = parciales;
  conteos.roster = inscripciones;

  // Decisión PURA (sin BD) de qué bloquea el borrado del paso.
  const bloqueos = calcularBloqueosPaso({
    paso,
    activo,
    estado,
    grupos,
    grupoMaterias,
    inscripciones,
    asignaciones,
    clasesImpartidas,
    asistenciaAlumnos,
    justificaciones,
  });

  return {
    ok: true,
    paso,
    periodoId,
    periodoNombre: String(periodo.nombre),
    estado,
    activo,
    conteos,
    bloqueos,
  };
}

export type ResultadoBorrarPaso =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

/**
 * Aplica el borrado del paso (SOLO tras previsualización confirmada). El
 * cliente confirma pasando el paso; el servidor re-valida con la misma
 * previsualización y, si sigue habiendo bloqueos, no escribe nada.
 */
export async function aplicarBorrarPaso(
  supabase: SupabaseClient,
  periodoIdRaw: string,
  pasoRaw: string,
): Promise<ResultadoBorrarPaso> {
  const preview = await previsualizarBorrarPaso(supabase, periodoIdRaw, pasoRaw);
  if (!preview.ok) return { ok: false, error: preview.error };
  if (preview.bloqueos.length > 0) {
    return {
      ok: false,
      error: `No se borra: ${preview.bloqueos.join(" · ")}`,
    };
  }
  const periodoId = periodoIdRaw.trim();
  const paso = pasoRaw.trim() as PasoConfigurador;

  const { data: gruposData } = await supabase
    .from(TABLA_GRUPOS)
    .select("id")
    .eq("periodo_id", periodoId)
    .limit(100000);
  const grupoIds = ((gruposData ?? []) as { id: string }[]).map((g) => g.id);

  const borrar = async (tabla: string, columna: string, valores: string[]) => {
    if (valores.length === 0) return "";
    const { error } = await supabase.from(tabla).delete().in(columna, valores);
    return error?.message ?? "";
  };

  if (paso === "academico") {
    // Orden: primero lo que cuelga de grupos, luego los grupos.
    const err1 = await borrar(TABLA_GRUPO_MATERIAS, "grupo_id", grupoIds);
    if (err1) return { ok: false, error: err1 };
    const err2 = await borrar(TABLA_SEMESTRES, "periodo_id", [periodoId]);
    if (err2) return { ok: false, error: err2 };
    const err3 = await borrar(TABLA_GRUPOS, "periodo_id", [periodoId]);
    if (err3) return { ok: false, error: err3 };
    return { ok: true, mensaje: `Contexto académico del ciclo borrado (${preview.conteos.academico} filas).` };
  }
  if (paso === "calendario") {
    const err = await borrar(TABLA_CALENDARIO_ESCOLAR, "periodo_id", [periodoId]);
    if (err) return { ok: false, error: err };
    return { ok: true, mensaje: `Calendario borrado (${preview.conteos.calendario} días).` };
  }
  if (paso === "horario") {
    const err = await borrar(TABLA_HORARIO_SEMANAL, "periodo_id", [periodoId]);
    if (err) return { ok: false, error: err };
    return { ok: true, mensaje: `Horario borrado (${preview.conteos.horario} bloques).` };
  }
  if (paso === "evaluaciones") {
    const err = await borrar(TABLA_PERIODOS_EVALUACION, "periodo_id", [periodoId]);
    if (err) return { ok: false, error: err };
    return { ok: true, mensaje: `Parciales borrados (${preview.conteos.evaluaciones}).` };
  }
  if (paso === "roster") {
    // Solo BORRADOR/no operativo sin datos derivados (validado arriba).
    const err = await borrar(TABLA_INSCRIPCIONES_ALUMNO, "grupo_id", grupoIds);
    if (err) return { ok: false, error: err };
    return { ok: true, mensaje: `Inscripciones del ciclo borradas (${preview.conteos.roster}).` };
  }
  return { ok: false, error: "Paso no soportado." };
}


