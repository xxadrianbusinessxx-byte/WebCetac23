import type { SupabaseClient } from "@supabase/supabase-js";
import {
  diaSemanaDesdeFecha,
  obtenerCalendarioDePeriodo,
  obtenerCalendarioEscolar,
  type DiaCalendarioRow,
} from "../ciclo/calendario.ts";
import {
  filtrarDiasDeParcial,
  type ParcialAsistencia,
} from "./asistencia-parcial.ts";
import {
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_CLASES_IMPARTIDAS,
  type TipoDiaCalendario,
} from "../tables.ts";
import type {
  DiaEstadoAsistencia,
  EstadoAsistencia,
} from "./asistencia-plantillas.ts";
import {
  norm,
} from "./asistencia-comun.ts";
import type {
  ContextoAsistencia,
} from "./asistencia-comun.ts";
/**
 * Deriva el estado de asistencia de un alumno para una fecha concreta.
 * Pura (sin I/O): recibe los datos ya cargados y resuelve el estado.
 */
export function estadoAsistenciaAlumno(input: {
  tipo: TipoDiaCalendario;
  clasesEsperadas: number;
  clasesAsistidas: number | null;
}): EstadoAsistencia {
  // DÃ­a no escolar (festivo/mantenimiento/descanso) â†’ sin_clase.
  if (input.tipo !== "clase") return "sin_clase";
  // DÃ­a de clase pero el profesor no tiene clases ese dÃ­a â†’ sin_clase.
  if (input.clasesEsperadas <= 0) return "sin_clase";
  // Sin registro â†’ pendiente (nunca falta).
  if (input.clasesAsistidas === null) return "pendiente";
  // 0 explÃ­cito â†’ falta.
  if (input.clasesAsistidas === 0) return "falta";
  // > 0 â†’ asistiÃ³.
  return "asistio";
}

/**
 * Â¿El profesor imparte clase en un grado/grupo?
 *
 * Se determina a partir de los registros existentes en `clases_impartidas`
 * (fuente real de datos): un profesor "imparte" en un grupo si ya registrÃ³
 * clases impartidas en Ã©l. NO se crea un mapeo nuevo profesorâ†’grupo; se
 * reutiliza el modelo actual. Ãštil para restringir a un `maestro` a consultar
 * Ãºnicamente los grupos donde realmente da clase.
 */
export async function profesorImparteEnGrupo(
  supabase: SupabaseClient,
  grado: string,
  grupo: string,
  profesorId?: number | null,
): Promise<boolean> {
  const g = norm(grado);
  const gr = norm(grupo);
  if (!g || !gr) return false;
  const pid = Number(profesorId);
  if (!Number.isInteger(pid) || pid <= 0) return false;

  const { data, error } = await supabase
    .from(TABLA_CLASES_IMPARTIDAS)
    .select("id")
    .eq("profesor_id", pid)
    .eq("grado", g)
    .eq("grupo", gr)
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * Obtiene el calendario de asistencia de un alumno (por CURP) para un ciclo.
 *
 * Realiza SOLO 3 consultas (calendario + clases_impartidas + asistencia_alumnos)

 * y resuelve los estados en memoria (sin N+1). Reutilizable para el perfil del
 * alumno, el perfil del padre y el calendario visual futuro.
 *
 * Si se pasa `profesorClave`, se limita a ese profesor (estado por profesor).
 * Si no, se agrega el aporte de todos los profesores del grupo (estado global).
 */
export async function obtenerEstadosAsistenciaAlumno(
  supabase: SupabaseClient,
  input: {
    curp: string;
    grado: string;
    grupo: string;
    carrera?: string;
    ciclo: string;
    /** CICLO GLOBAL — periodo operativo resuelto en el servidor. */
    periodoId?: string;
    profesorClave?: string;
    /** PROMPT C (R-2) — identidad estructural del profesor: se prefiere
     *  `profesor_id` cuando existe; `profesor_clave` solo si es NULL. */
    profesorId?: number | null;
  },
): Promise<DiaEstadoAsistencia[]> {
  const g = norm(input.grado);
  const gr = norm(input.grupo);
  const ciclo = norm(input.ciclo);
  if (!g || !gr || !ciclo) return [];

  // 1) Calendario del ciclo (fuente de verdad de días escolares). Si se conoce
  //    el periodo operativo se lee POR PERIODO; si no, se conserva la lectura
  //    legacy por texto (ciclo_escolar).
  const calendario = input.periodoId
    ? await obtenerCalendarioDePeriodo(supabase, input.periodoId, input.ciclo)
    : await obtenerCalendarioEscolar(supabase, ciclo);
  if (calendario.length === 0) return [];

  // PROMPT C/D — si se pide alcance por profesor, este es SIEMPRE `profesor_id`
  // (PROFESORES.ID). `profesor_clave` ya NO es criterio de búsqueda (regla D-4:
  // la comparten 16 profesores). Sin la columna (esquema C pendiente) no se
  // puede acotar de forma segura: se devuelve vacío (no se filtra el aporte
  // global de otros profesores).
  const profesorId =
    input.profesorId != null &&
    Number.isInteger(Number(input.profesorId)) &&
    Number(input.profesorId) > 0
      ? Number(input.profesorId)
      : null;
  let scopePorId = false;
  if (profesorId) {
    const [p1, p2] = await Promise.all([
      supabase.from(TABLA_CLASES_IMPARTIDAS).select("profesor_id").limit(1),
      supabase.from(TABLA_ASISTENCIA_ALUMNOS).select("profesor_id").limit(1),
    ]);
    scopePorId = !p1.error && !p2.error;
  }
  if (profesorId && !scopePorId) return [];

  // 2) Clases impartidas del grupo (SUM por fecha). Alcance por profesor si
  //    corresponde; si no, el total del grupo.
  let qClases = supabase
    .from(TABLA_CLASES_IMPARTIDAS)
    .select("fecha, clases")
    .eq("grado", g)
    .eq("grupo", gr);
  if (scopePorId && profesorId) qClases = qClases.eq("profesor_id", profesorId);
  const { data: clasesData } = await qClases;
  const clasesPorFecha = new Map<string, number>();
  for (const r of (clasesData ?? []) as { fecha: string; clases: number }[]) {
    clasesPorFecha.set(r.fecha, (clasesPorFecha.get(r.fecha) ?? 0) + r.clases);
  }

  // 3) Asistencia del alumno (SUM por fecha). Mismo filtro de profesor.
  let qAsist = supabase
    .from(TABLA_ASISTENCIA_ALUMNOS)
    .select("fecha, clases_asistidas")
    .eq("curp", input.curp)
    .eq("grado", g)
    .eq("grupo", gr);
  if (scopePorId && profesorId) qAsist = qAsist.eq("profesor_id", profesorId);
  const { data: asistData } = await qAsist;
  const asistPorFecha = new Map<string, number>();
  for (const r of (asistData ?? []) as { fecha: string; clases_asistidas: number }[]) {
    asistPorFecha.set(r.fecha, (asistPorFecha.get(r.fecha) ?? 0) + r.clases_asistidas);
  }

  // 4) Resolver estados en memoria.
  const dias: DiaEstadoAsistencia[] = [];
  for (const d of calendario) {
    const fecha = d.fecha;
    const clasesEsperadas = clasesPorFecha.get(fecha) ?? 0;
    const clasesAsistidas = asistPorFecha.has(fecha)
      ? asistPorFecha.get(fecha)!
      : null;
    dias.push({
      fecha,
      diaSemana: diaSemanaDesdeFecha(fecha),
      tipo: d.tipo,
      estado: estadoAsistenciaAlumno({
        tipo: d.tipo,
        clasesEsperadas,
        clasesAsistidas,
      }),
      clasesEsperadas,
      clasesAsistidas,
    });
  }

  dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return dias;
}

/**
 * Calcula el porcentaje de asistencia SOLO sobre las clases registradas
 * (asistencias + faltas). Los dÃ­as pendientes NO entran al denominador.
 *
 *   porcentaje = asistencias / (asistencias + faltas)
 *
 * Ejemplo: 18 asistencias + 2 faltas + 5 pendientes â†’ 18/20 = 90%.
 * Es un valor DERIVADO: NO se almacena.
 */
export function calcularPorcentajeAsistencia(
  dias: DiaEstadoAsistencia[],
): number {
  let asistencias = 0;
  let faltas = 0;
  for (const d of dias) {
    if (d.estado === "asistio") asistencias++;
    else if (d.estado === "falta") faltas++;
  }
  const total = asistencias + faltas;
  if (total === 0) return 0;
  return Math.round((asistencias / total) * 100);
}

// ============================================================================
// CICLO GLOBAL + PARCIALES — calendario del contexto de asistencias
// ----------------------------------------------------------------------------

type CalendarioContextoAsistencia =
  | { ok: true; dias: DiaCalendarioRow[]; parcial: ParcialAsistencia | null }
  | { ok: false; error: string };

/**
 * CICLO GLOBAL + PARCIAL — calendario para el flujo del profesor.
 *
 * - Con `ctx.periodoId` lee POR PERIODO (`obtenerCalendarioDePeriodo`, ruta F5
 *   con fallback al texto exacto del periodo); sin él conserva la lectura
 *   legacy por texto (`ciclo_escolar`).
 * - Si el profesor eligió un PARCIAL (`ctx.evaluacionId`), valida que exista
 *   entre `ctx.evaluaciones` (parciales activos del periodo operativo) y:
 *     · acotarAlParcial=true  → devuelve solo los días de su rango (plantilla);
 *     · acotarAlParcial=false → devuelve el calendario completo + el parcial,
 *       para que la SUBIDA rechace columnas fuera de rango con mensaje exacto.
 * - Un `evaluacionId` que no pertenezca al periodo operativo = error (nunca se
 *   usan parciales de otro periodo).
 */
export async function cargarCalendarioAsistenciaContexto(
  supabase: SupabaseClient,
  ctx: ContextoAsistencia,
  opciones: { acotarAlParcial: boolean },
): Promise<CalendarioContextoAsistencia> {
  const ciclo = norm(ctx.ciclo);
  if (!ciclo) return { ok: false, error: "Indica un ciclo escolar." };

  const calendario = ctx.periodoId
    ? await obtenerCalendarioDePeriodo(supabase, ctx.periodoId, ctx.ciclo)
    : await obtenerCalendarioEscolar(supabase, ciclo);

  if (!ctx.evaluacionId) {
    return { ok: true, dias: calendario, parcial: null };
  }
  const parcial = (ctx.evaluaciones ?? []).find(
    (e) => e.id === ctx.evaluacionId && e.activo !== false,
  );
  if (!parcial) {
    return {
      ok: false,
      error:
        "El parcial seleccionado no pertenece al periodo operativo o esta inactivo. Recarga la pagina y vuelve a intentarlo.",
    };
  }
  if (!opciones.acotarAlParcial) {
    return { ok: true, dias: calendario, parcial };
  }
  return {
    ok: true,
    dias: filtrarDiasDeParcial(calendario, parcial),
    parcial,
  };
}
