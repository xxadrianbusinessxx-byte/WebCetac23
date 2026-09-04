/**
 * ELIMINAR CICLO — Diagnóstico previo + invocación del RPC transaccional.
 *
 * El borrado REAL vive en la BD (RPC `eliminar_ciclo` de
 * supabase/crear-rpc-eliminar-ciclo.sql) porque debe ser UNA transacción y
 * validar reglas de seguridad dentro de la misma (inscripciones y OPERATIVO).
 * Este módulo solo:
 *   1) produce los conteos EXACTOS que la UI muestra antes de pedir la
 *      confirmación por nombre (fricción de acción destructiva), y
 *   2) envuelve la llamada al RPC para las Server Actions.
 * NO decide la seguridad: el RPC es la autoridad final.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarPeriodo } from "./ciclo-estado";
import { ESTADO_OPERATIVO, resolverEstadoPeriodo } from "./ciclo-estado-puro";
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
} from "./tables";

const TABLA_CICLO_TRANSICIONES = "ciclo_transiciones";

export type ConteosEliminarCiclo = {
  grupos: number;
  grupoMaterias: number;
  inscripciones: number;
  horario: number;
  parciales: number;
  calendario: number;
  semestres: number;
  asignaciones: number;
  clasesImpartidas: number;
  asistenciaAlumnos: number;
  justificaciones: number;
  transiciones: number;
};

export type DiagnosticoEliminarCiclo =
  | {
      ok: true;
      periodoId: string;
      nombre: string;
      estado: string;
      activo: boolean;
      conteos: ConteosEliminarCiclo;
      /** Razones que bloquean el borrado (vacío = puede eliminarse). */
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

/** Conteos exactos + bloqueos previos a la eliminación (solo lectura). */
export async function diagnosticoEliminarCiclo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<DiagnosticoEliminarCiclo> {
  const rp = await consultarPeriodo(supabase, periodoId);
  if (rp.error) return { ok: false, error: rp.error };
  const periodo = rp.periodo;
  if (!periodo) return { ok: false, error: "El ciclo no existe." };

  const estado = resolverEstadoPeriodo(periodo);
  const grupos = await contar(supabase, TABLA_GRUPOS, "periodo_id", [periodoId]);
  const { data: grupoIdsData } = await supabase
    .from(TABLA_GRUPOS)
    .select("id")
    .eq("periodo_id", periodoId)
    .limit(100000);
  const grupoIds = ((grupoIdsData ?? []) as { id: string }[]).map((g) => g.id);

  const [grupoMaterias, inscripciones, asignaciones, semestres, parciales, horario, calendario, clasesImpartidas, asistenciaAlumnos, justificaciones, transiciones] =
    await Promise.all([
      contar(supabase, TABLA_GRUPO_MATERIAS, "grupo_id", grupoIds),
      contar(supabase, TABLA_INSCRIPCIONES_ALUMNO, "grupo_id", grupoIds),
      (async () => {
        const { data: gms } = grupoIds.length
          ? await supabase
              .from(TABLA_GRUPO_MATERIAS)
              .select("id")
              .in("grupo_id", grupoIds)
              .limit(100000)
          : { data: [] as { id: string }[] };
        return contar(
          supabase,
          TABLA_ASIGNACIONES_PROFESOR,
          "grupo_materia_id",
          ((gms ?? []) as { id: string }[]).map((g) => g.id),
        );
      })(),
      contar(supabase, TABLA_SEMESTRES, "periodo_id", [periodoId]),
      contar(supabase, TABLA_PERIODOS_EVALUACION, "periodo_id", [periodoId]),
      contar(supabase, TABLA_HORARIO_SEMANAL, "periodo_id", [periodoId]),
      contar(supabase, TABLA_CALENDARIO_ESCOLAR, "periodo_id", [periodoId]),
      contar(supabase, TABLA_CLASES_IMPARTIDAS, "periodo_id", [periodoId]),
      contar(supabase, TABLA_ASISTENCIA_ALUMNOS, "periodo_id", [periodoId]),
      contar(supabase, TABLA_JUSTIFICACIONES_ASISTENCIA, "periodo_id", [periodoId]),
      contar(supabase, TABLA_CICLO_TRANSICIONES, "periodo_id", [periodoId]),
    ]);

  const conteos: ConteosEliminarCiclo = {
    grupos,
    grupoMaterias,
    inscripciones,
    horario,
    parciales,
    calendario,
    semestres,
    asignaciones,
    clasesImpartidas,
    asistenciaAlumnos,
    justificaciones,
    transiciones,
  };

  const bloqueos: string[] = [];
  if (estado === ESTADO_OPERATIVO || Boolean(periodo.activo)) {
    bloqueos.push(
      "Es el ciclo OPERATIVO actual: desactívalo o pásalo a HISTORICO primero (otro flujo).",
    );
  }
  if (inscripciones > 0) {
    bloqueos.push(
      `Tiene ${inscripciones} inscripciones (activas o históricas): un ciclo con inscripciones nunca se puede eliminar.`,
    );
  }

  return {
    ok: true,
    periodoId,
    nombre: String(periodo.nombre),
    estado,
    activo: Boolean(periodo.activo),
    conteos,
    bloqueos,
  };
}

export type DetalleEliminarCicloOk = {
  nombre: string;
  grupos: number;
  grupoMaterias: number;
  inscripciones: number;
  horario: number;
  parciales: number;
  calendario: number;
};

export type ResultadoEliminarCiclo =
  | { ok: true; mensaje: string; detalle: DetalleEliminarCicloOk }
  | { ok: false; error: string };

/** Invoca el RPC transaccional `eliminar_ciclo` (autoridad final en la BD). */
export async function eliminarCicloRpc(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<ResultadoEliminarCiclo> {
  const { data, error } = await supabase.rpc("eliminar_ciclo", {
    p_periodo: periodoId,
  });
  if (error) {
    const msg = String(error.message ?? "No se pudo eliminar el ciclo.").replace(
      /^eliminar_ciclo:\s*/i,
      "",
    );
    return { ok: false, error: msg };
  }
  const d = (data ?? {}) as Record<string, unknown>;
  const nombre = String(d.nombre ?? "");
  const detalle: DetalleEliminarCicloOk = {
    nombre,
    grupos: Number(d.grupos ?? 0),
    grupoMaterias: Number(d.grupo_materias ?? 0),
    inscripciones: Number(d.inscripciones ?? 0),
    horario: Number(d.horario ?? 0),
    parciales: Number(d.parciales ?? 0),
    calendario: Number(d.calendario ?? 0),
  };
  return {
    ok: true,
    detalle,
    mensaje: `Ciclo «${nombre}» eliminado: ${detalle.grupos} grupos · ${detalle.grupoMaterias} grupo_materias · ${detalle.horario} bloques de horario · ${detalle.parciales} parciales · ${detalle.calendario} días de calendario.`,
  };
}
