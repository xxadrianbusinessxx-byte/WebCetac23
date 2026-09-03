import { obtenerCicloOperativoGlobal } from "./ciclo-estado";

/**
 * C4.14 — CONTROL DE OFERTA ACADÉMICA POR SEMESTRE.
 *
 * Modelo:
 *   * SEMESTRE = clasificación de la oferta por grado (1RO→1 … 6TO→6) dentro
 *     de un PERIODO (`periodos`). `academico_semestres` guarda el estado
 *     activo/inactivo por (periodo_id, semestre).
 *   * Sin fila ⇒ semestre ACTIVO (default): no rompe la visualización actual
 *     hasta que el directivo configure explícitamente.
 *
 * Principios:
 *   * Desactivar NUNCA borra: UPDATE activo=false (historial conservado).
 *   * No se tocan materias, grupo_materias, grupos, asignaciones_profesor,
 *     PROFESORES, profesor_clave, asistencia, boleta ni ETIQUETAS.
 *   * La autoridad del ACTOR se resuelve en la capa de acciones (sesión +
 *     rol directivo). Este módulo recibe el OBJETIVO administrativo.
 *   * Requiere el DDL de C4.14 (supabase/crear-tablas-semestres.sql). Si la
 *     tabla no existe, la lectura de estado se comporta como ACTIVO (sin
 *     restricción) y las escrituras devuelven ERROR_ESQUEMA_SEMESTRES_PENDIENTE.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TABLA_PERIODOS,
  TABLA_SEMESTRES,
  TABLA_GRUPOS,
  TABLA_GRUPO_MATERIAS,
} from "./tables";
import { configuracionPermitidaEnPeriodo } from "./ciclo-estado";

export const ERROR_ESQUEMA_SEMESTRES_PENDIENTE =
  "Esquema C4.14 pendiente: aplicar supabase/crear-tablas-semestres.sql (tabla academico_semestres) antes de administrar semestres.";

export type ResultadoSemestre =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

const GRADOS_A_SEMESTRE: Record<string, number> = {
  "1RO": 1,
  "2DO": 2,
  "3RO": 3,
  "4TO": 4,
  "5TO": 5,
  "6TO": 6,
};

/** Grado del grupo → semestre (1RO→1 … 6TO→6). null si no se reconoce. */
export function gradoASemestre(grado: string): number | null {
  const g = (grado ?? "").trim().toUpperCase();
  return GRADOS_A_SEMESTRE[g] ?? null;
}

/** Semestre → grado canónico del catálogo (1→"1RO" … 6→"6TO"). */
export function semestreAGrado(semestre: number): string | null {
  for (const [grado, s] of Object.entries(GRADOS_A_SEMESTRE)) {
    if (s === semestre) return grado;
  }
  return null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsearUuid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!UUID_RE.test(v)) return null;
  return v;
}

/** Verifica que la tabla `academico_semestres` exista (DDL C4.14 aplicado). */
export async function verificarEsquemaSemestres(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from(TABLA_SEMESTRES).select("id").limit(1);
  if (!error) return { ok: true };
  const mensaje = String(error.message ?? "");
  // PostgREST: PGRST205 (tabla inexistente) o 42703 (columna inexistente).
  if (
    /\b42703\b/.test(mensaje) ||
    /does not exist/i.test(mensaje) ||
    /could not find the table/i.test(mensaje) ||
    /in the schema cache/i.test(mensaje)
  ) {
    return { ok: false, error: ERROR_ESQUEMA_SEMESTRES_PENDIENTE };
  }
  return { ok: false, error: mensaje };
}

/**
 * Estado activo del semestre en un periodo.
 * Sin fila o esquema ausente ⇒ ACTIVO (true): comportamiento actual intacto
 * hasta que el directivo configure explícitamente.
 */
export async function estadoSemestre(
  supabase: SupabaseClient,
  periodoId: string,
  semestre: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLA_SEMESTRES)
    .select("activo")
    .eq("periodo_id", periodoId)
    .eq("semestre", semestre)
    .maybeSingle();
  if (error || !data) return true;
  return Boolean(data.activo);
}

/** ¿El semestre del grupo está activo? (estructura ausente ⇒ true). */
export async function semestreActivoDeGrupo(
  supabase: SupabaseClient,
  grupo: { periodo_id: string; grado: string },
): Promise<boolean> {
  const semestre = gradoASemestre(grupo.grado);
  if (semestre === null) return true;
  return estadoSemestre(supabase, grupo.periodo_id, semestre);
}

/**
 * FASE 3 — Versión PURA de `semestreActivoDeGrupo` que decide a partir de filas
 * ya cargadas de `academico_semestres` (evita una consulta extra cuando la RPC
 * `obtener_perfil_alumno` ya devolvió los semestres). Conserva exactamente la
 * semántica de `estadoSemestre`: sin fila para (periodo, semestre) ⇒ true.
 */
export function semestreActivoDesdeFilas(
  filas: ReadonlyArray<{ periodo_id: string; semestre: number; activo: boolean }>,
  grupo: { periodo_id: string; grado: string },
): boolean {
  const semestre = gradoASemestre(grupo.grado);
  if (semestre === null) return true;
  const fila = filas.find(
    (f) => f.periodo_id === grupo.periodo_id && f.semestre === semestre,
  );
  if (!fila) return true;
  return Boolean(fila.activo);
}

/** Semestres (números) configurados como INACTIVOS (academico_semestres.activo=false). */
export async function semestresInactivos(
  supabase: SupabaseClient,
): Promise<Set<number>> {
  const out = new Set<number>();
  const { data, error } = await supabase
    .from(TABLA_SEMESTRES)
    .select("semestre, activo");
  if (error || !data) return out;
  for (const f of data as Array<{ semestre: number; activo: boolean }>) {
    if (f.activo === false) out.add(f.semestre);
  }
  return out;
}


/**
 * Activa o desactiva la oferta de un semestre en un periodo.
 * UPDATE/UPSERT administrativo (nunca DELETE; historial conservado).
 */
export async function setEstadoSemestre(
  supabase: SupabaseClient,
  periodoIdRaw: unknown,
  semestreRaw: unknown,
  activo: boolean,
): Promise<ResultadoSemestre> {
  const periodoId = parsearUuid(periodoIdRaw);
  if (!periodoId) {
    return { ok: false, error: "periodoId debe ser un UUID válido." };
  }
  const semestre = Number(semestreRaw);
  if (!Number.isInteger(semestre) || semestre < 1 || semestre > 12) {
    return { ok: false, error: "semestre debe ser un entero entre 1 y 12." };
  }

  const esquema = await verificarEsquemaSemestres(supabase);
  if (!esquema.ok) {
    return { ok: false, error: esquema.error ?? ERROR_ESQUEMA_SEMESTRES_PENDIENTE };
  }

  // F1 — La oferta por semestre debe poder configurarse sobre un ciclo
  // BORRADOR (o OPERATIVO). Solo se bloquea sobre ciclos HISTORICO.
  const permitido = await configuracionPermitidaEnPeriodo(supabase, periodoId);
  if (!permitido.ok) {
    return { ok: false, error: permitido.error ?? "El periodo no existe." };
  }
  const periodo = permitido.periodo;
  if (!periodo) return { ok: false, error: "El periodo no existe." };

  const { error } = await supabase.from(TABLA_SEMESTRES).upsert(
    { periodo_id: periodoId, semestre, activo },
    { onConflict: "periodo_id,semestre" },
  );
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    mensaje: `Semestre ${semestre} ${activo ? "activado" : "desactivado"} en ${periodo.nombre}.`,
  };
}

export type SemestreOfertaListado = {
  periodoId: string;
  periodoNombre: string;
  semestre: number;
  grado: string;
  activo: boolean;
  configurado: boolean;
  gruposTotal: number;
  gruposActivos: number;
  materiasActivas: number;
};

/** Auditoría de la oferta por semestre para el panel directivo. */
export async function listarSemestresOferta(
  supabase: SupabaseClient,
): Promise<
  | { ok: true; periodos: SemestreOfertaListado[] }
  | { ok: false; error: string }
> {
  const esquema = await verificarEsquemaSemestres(supabase);
  if (!esquema.ok) {
    return { ok: false, error: esquema.error ?? ERROR_ESQUEMA_SEMESTRES_PENDIENTE };
  }

  const ciclo = await obtenerCicloOperativoGlobal(supabase);
  if (!ciclo.ok) return { ok: false, error: ciclo.error ?? "F1: no hay un único ciclo OPERATIVO." };
  const periodos = ciclo.periodo
    ? [{ id: ciclo.periodo.id, nombre: ciclo.periodo.nombre }]
    : [];
  const [{ data: filas, error: e1 }, { data: grupos, error: e2 }, { data: gms, error: e3 }] =
    await Promise.all([
      supabase.from(TABLA_SEMESTRES).select("periodo_id, semestre, activo"),
      supabase.from(TABLA_GRUPOS).select("id, grado, periodo_id, activo"),
      supabase.from(TABLA_GRUPO_MATERIAS).select("id, grupo_id").eq("activo", true),
    ]);
  if (e1 || e2 || e3) {
    return {
      ok: false,
      error: e1?.message ?? e2?.message ?? e3?.message ?? "Error al listar semestres.",
    };
  }

  const filasPorPeriodo = new Map<string, Map<number, boolean>>();
  for (const f of (filas ?? []) as Array<{ periodo_id: string; semestre: number; activo: boolean }>) {
    if (!filasPorPeriodo.has(f.periodo_id)) filasPorPeriodo.set(f.periodo_id, new Map());
    filasPorPeriodo.get(f.periodo_id)!.set(f.semestre, f.activo);
  }
  const gruposPorPeriodo = new Map<string, Array<{ id: string; grado: string; activo: boolean }>>();
  for (const g of (grupos ?? []) as Array<{ id: string; grado: string; periodo_id: string; activo: boolean }>) {
    if (!gruposPorPeriodo.has(g.periodo_id)) gruposPorPeriodo.set(g.periodo_id, []);
    gruposPorPeriodo.get(g.periodo_id)!.push({ id: g.id, grado: g.grado, activo: g.activo });
  }
  const gmPorGrupo = new Map<string, number>();
  for (const gm of (gms ?? []) as Array<{ id: string; grupo_id: string }>) {
    gmPorGrupo.set(gm.grupo_id, (gmPorGrupo.get(gm.grupo_id) ?? 0) + 1);
  }

  const out: SemestreOfertaListado[] = [];
  for (const p of (periodos ?? []) as Array<{ id: string; nombre: string }>) {
    for (let sem = 1; sem <= 6; sem++) {
      const grado = semestreAGrado(sem) ?? `S${sem}`;
      const conf = filasPorPeriodo.get(p.id)?.get(sem);
      const gruposPeriodo = gruposPorPeriodo.get(p.id) ?? [];
      const gruposGrado = gruposPeriodo.filter((g) => g.grado === grado);
      const materiasActivas = gruposGrado.reduce((acc, g) => acc + (gmPorGrupo.get(g.id) ?? 0), 0);
      out.push({
        periodoId: p.id,
        periodoNombre: p.nombre,
        semestre: sem,
        grado,
        activo: conf ?? true,
        configurado: conf !== undefined,
        gruposTotal: gruposGrado.length,
        gruposActivos: gruposGrado.filter((g) => g.activo).length,
        materiasActivas,
      });
    }
  }
  return { ok: true, periodos: out };
}


