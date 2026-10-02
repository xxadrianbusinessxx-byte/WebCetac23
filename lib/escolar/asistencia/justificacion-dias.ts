import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_CLASES_IMPARTIDAS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_JUSTIFICACIONES_ASISTENCIA,
} from "../tables.ts";
import { materiasDelAlumno } from "../materia/calificaciones.ts";
import {
  justificacionesPorFecha,
  resolverDiaMateria,
  type FilaAsistenciaDia,
  type FilaClaseDia,
  type MateriaDelDia,
} from "./asistencia-dia-materia.ts";

/**
 * justificacion-dias.ts — I/O del circuito de justificación POR MATERIA.
 *
 * Arma el desglose por materia (`resolverDiaMateria`, el MISMO que pinta el
 * calendario) de los días que alguien quiere justificar, y escribe las
 * justificaciones de materia que decide el profesor. No decide permisos ni
 * alcance: la action valida la sesión y la regla de quién puede qué vive en
 * `justificaciones-puro.ts`.
 *
 * Rendimiento: el desglose de N días sale de 4 consultas FIJAS (asistencia,
 * clases, justificaciones aprobadas y roster de nombres), sin importar N.
 */

/** Un día de un alumno que se quiere justificar. */
export type DiaAJustificar = {
  curp: string;
  grado: string;
  grupo: string;
  fecha: string;
};

/** Lo que ve el profesor de una solicitud de día que le toca (presentación). */
export type JustificacionParaProfesor = {
  id: string;
  curp: string;
  alumnoNombre: string;
  fecha: string;
  grado: string;
  grupo: string;
  motivo: string;
  tieneArchivo: boolean;
  /** Materias de ese día que ESTE profesor puede justificar. */
  materias: {
    grupoMateriaId: string;
    nombre: string;
    clases: number;
    asistidas: number;
  }[];
};

/** Clave del mapa de resultados. */
export function claveDia(curp: string, fecha: string): string {
  return `${curp.trim().toUpperCase()}|${fecha.trim()}`;
}

/**
 * Desglose por materia de varios días a la vez → `Map<curp|fecha, líneas>`.
 * Las justificaciones APROBADAS ya están aplicadas (`clasesJustificadas`), así
 * que lo que queda en falta es lo que todavía se puede justificar.
 */
export async function cargarDiasAJustificar(
  supabase: SupabaseClient,
  dias: readonly DiaAJustificar[],
): Promise<Map<string, MateriaDelDia[]>> {
  const resultado = new Map<string, MateriaDelDia[]>();
  if (dias.length === 0) return resultado;

  const curps = [...new Set(dias.map((d) => d.curp.trim().toUpperCase()))];
  const fechas = [...new Set(dias.map((d) => d.fecha.trim()))];
  const grupos = [...new Set(dias.map((d) => d.grupo.trim()))];

  const [asistRes, clasesRes, justRes, inscRes] = await Promise.all([
    supabase
      .from(TABLA_ASISTENCIA_ALUMNOS)
      .select("curp, fecha, grado, grupo, grupo_materia_id, profesor_clave, profesor_id, clases_asistidas")
      .in("curp", curps)
      .in("fecha", fechas),
    supabase
      .from(TABLA_CLASES_IMPARTIDAS)
      .select("fecha, grado, grupo, grupo_materia_id, clases")
      .in("fecha", fechas)
      .in("grupo", grupos),
    supabase
      .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
      .select("curp_alumno, fecha, grupo_materia_id, estado")
      .in("curp_alumno", curps)
      .in("fecha", fechas)
      .eq("estado", "aprobada"),
    supabase
      .from(TABLA_INSCRIPCIONES_ALUMNO)
      .select("grupo_id")
      .in("curp", curps)
      .eq("activo", true),
  ]);

  // Nombres desde el roster (la misma fuente que la boleta y el calendario).
  const grupoIds = [
    ...new Set(
      ((inscRes.data ?? []) as { grupo_id: string | null }[])
        .map((r) => r.grupo_id)
        .filter((g): g is string => Boolean(g)),
    ),
  ];
  const roster = grupoIds.length
    ? await materiasDelAlumno(supabase, "", false, grupoIds)
    : [];
  const nombres = new Map<string, string>();
  for (const m of roster) nombres.set(m.grupoMateriaId, m.nombreVisible ?? m.nombre);

  type FilaAsist = FilaAsistenciaDia & { curp: string; fecha: string; grado: string; grupo: string };
  const asist = (asistRes.data ?? []) as FilaAsist[];
  const clases = (clasesRes.data ?? []) as (FilaClaseDia & { fecha: string; grado: string; grupo: string })[];
  const justificaciones = (justRes.data ?? []) as {
    curp_alumno: string;
    fecha: string;
    grupo_materia_id: string | null;
    estado: string;
  }[];

  for (const d of dias) {
    const curp = d.curp.trim().toUpperCase();
    const fecha = d.fecha.trim();
    const grado = d.grado.trim();
    const grupo = d.grupo.trim();
    const filasClases = clases.filter(
      (c) => c.fecha === fecha && c.grado === grado && c.grupo === grupo,
    );
    const filasAsist = asist.filter(
      (a) => a.curp === curp && a.fecha === fecha && a.grado === grado && a.grupo === grupo,
    );
    const justDia = justificacionesPorFecha(
      justificaciones
        .filter((j) => j.curp_alumno === curp && j.fecha === fecha)
        .map((j) => ({ fecha: j.fecha, grupo_materia_id: j.grupo_materia_id, estado: j.estado })),
    ).get(fecha);
    // Un día con solicitud es un día de clase: el calendario solo deja pedirla
    // ahí, y sin filas de clases no hay líneas que justificar.
    const { materias } = resolverDiaMateria("clase", filasClases, filasAsist, nombres, justDia);
    resultado.set(claveDia(curp, fecha), materias);
  }
  return resultado;
}

/**
 * Escribe la justificación de cada materia elegida por el profesor: una fila
 * `aprobada` por materia, colgada de la solicitud del día (mismo motivo y
 * mismo adjunto, para que el expediente conserve la evidencia).
 *
 * Idempotente: las materias que ya tienen fila no se reescriben. La unicidad
 * (curp, fecha, grupo_materia_id) la impone el índice parcial
 * `justificaciones_por_clase_uidx`; como PostgREST no lo infiere, se lee antes
 * de insertar (mismo patrón que la solicitud del día).
 */
export async function registrarJustificacionesDeMateria(
  supabase: SupabaseClient,
  solicitud: {
    curp_alumno: string;
    fecha: string;
    grado: string;
    grupo: string;
    carrera: string;
    motivo: string;
    archivo_path?: string | null;
    archivo_nombre?: string | null;
    archivo_mime?: string | null;
    archivo_size?: number | null;
  },
  grupoMateriaIds: readonly string[],
  profesorId: number,
): Promise<{ ok: true; nuevas: string[] } | { ok: false; error: string }> {
  const { data: existentes, error: errLeer } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("grupo_materia_id")
    .eq("curp_alumno", solicitud.curp_alumno)
    .eq("fecha", solicitud.fecha)
    .in("grupo_materia_id", [...grupoMateriaIds]);
  if (errLeer) return { ok: false, error: errLeer.message };
  const ya = new Set(
    ((existentes ?? []) as { grupo_materia_id: string }[]).map((r) => r.grupo_materia_id),
  );
  const nuevas = grupoMateriaIds.filter((g) => !ya.has(g));
  if (nuevas.length === 0) return { ok: true, nuevas: [] };

  const { error } = await supabase.from(TABLA_JUSTIFICACIONES_ASISTENCIA).insert(
    nuevas.map((grupoMateriaId) => ({
      curp_alumno: solicitud.curp_alumno,
      fecha: solicitud.fecha,
      grado: solicitud.grado,
      grupo: solicitud.grupo,
      carrera: solicitud.carrera,
      motivo: solicitud.motivo,
      estado: "aprobada",
      // El CHECK de la tabla admite tutor | alumno | profesor. La identidad es
      // PROFESORES.ID, nunca la CLAVE (la comparten varios profesores).
      solicitante_tipo: "profesor",
      solicitante_id: String(profesorId),
      archivo_path: solicitud.archivo_path ?? null,
      archivo_nombre: solicitud.archivo_nombre ?? null,
      archivo_mime: solicitud.archivo_mime ?? null,
      archivo_size: solicitud.archivo_size ?? null,
      grupo_materia_id: grupoMateriaId,
    })),
  );
  if (error) return { ok: false, error: `No se pudo registrar la justificación: ${error.message}` };
  return { ok: true, nuevas };
}

/** Justificaciones APROBADAS de un alumno (por fecha y materia), para la lectura
 *  del calendario. Una consulta; la agrupación la hace `justificacionesPorFecha`. */
export async function listarJustificacionesAprobadasDeCurp(
  supabase: SupabaseClient,
  curp: string,
): Promise<{ fecha: string; grupo_materia_id: string | null; estado: string }[]> {
  const { data, error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("fecha, grupo_materia_id, estado")
    .eq("curp_alumno", curp)
    .eq("estado", "aprobada");
  if (error || !data) return [];
  return data as { fecha: string; grupo_materia_id: string | null; estado: string }[];
}
