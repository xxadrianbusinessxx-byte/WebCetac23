import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLA_GRUPO_MATERIAS } from "../tables.ts";
import type { ContextoAsistencia } from "./asistencia-comun.ts";
import {
  buscarGrupoEnLista,
  clavesEquivalenciaMateria,
  materiaClaveHorario,
  obtenerBloquesHorario,
  obtenerGruposConCarreraDePeriodo,
  obtenerPeriodoPorNombre,
} from "../horario/horario-semanal.ts";

/**
 * PROMPT S (Parte A) — resolución de la materia de una subida de asistencia.
 *
 * Resuelve el `grupo_materias.id` (ACTIVO) del grupo del periodo operativo +
 * la materia elegida (`ctx.materiaClave`, la misma clave del horario con la
 * que se generó la plantilla) y su nombre visible (alias ?? nombre), para la
 * fila `MATERIA` de la plantilla y su validación. Consultas FIJAS (sin N+1
 * por alumno/fila).
 *
 * Puente preferido: `horario_semanal.materia_id` (vínculo best-effort al
 * catálogo). Respaldo: equivalencia de claves (materias.clave/nombre) contra
 * el grupo_materias del grupo.
 */
export async function resolverGrupoMateriaIdSubida(
  supabase: SupabaseClient,
  ctx: ContextoAsistencia,
): Promise<
  | { ok: true; grupoMateriaId: string | null; nombreVisible: string | null }
  | { ok: false; error: string }
> {
  const claveBuscada = materiaClaveHorario(ctx.materiaClave ?? "");
  if (!claveBuscada) return { ok: true, grupoMateriaId: null, nombreVisible: null };

  // 1) Periodo (el contexto trae el id del operativo cuando es posible).
  let periodoId = ctx.periodoId ?? null;
  if (!periodoId) {
    const periodo = await obtenerPeriodoPorNombre(supabase, ctx.ciclo);
    if (!periodo) return { ok: true, grupoMateriaId: null, nombreVisible: null };
    periodoId = periodo.id;
  }

  // 2) Grupo por identidad académica (mismas normalizaciones del horario).
  const grupos = await obtenerGruposConCarreraDePeriodo(supabase, periodoId);
  const grupo = buscarGrupoEnLista(grupos, ctx.grado, ctx.grupo, ctx.carrera);
  if (!grupo) return { ok: true, grupoMateriaId: null, nombreVisible: null };

  // 3) materia_id del catálogo desde el HORARIO oficial (puente preferido).
  const bloques = await obtenerBloquesHorario(supabase, {
    periodoId,
    grupoId: grupo.id,
  });
  const materiaIds = new Set<string>();
  for (const b of bloques) {
    const claveBloque =
      b.materia_clave || materiaClaveHorario(b.materia_nombre);
    if (claveBloque === claveBuscada && b.materia_id) materiaIds.add(b.materia_id);
  }

  // 4) grupo_materias ACTIVO del grupo: primero el vinculado por el horario,
  //    después cualquier materia del grupo equivalente por clave. Se trae
  //    también el alias (nombre visible) para la fila MATERIA de la plantilla.
  const { data: gms, error } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select(
      "id, activo, materia_id, materias!inner(id, clave, nombre), materias_nombres_visibles(nombre_visible, activo)",
    )
    .eq("grupo_id", grupo.id);
  if (error) return { ok: false, error: error.message };

  const filas = (gms ?? []) as Array<{
    id: string;
    activo: boolean;
    materia_id: string | null;
    materias:
      | { id: string; clave: string; nombre: string }
      | { id: string; clave: string; nombre: string }[]
      | null;
    materias_nombres_visibles:
      | { nombre_visible: string | null; activo: boolean | null }
      | { nombre_visible: string | null; activo: boolean | null }[]
      | null;
  }>;
  const activas = filas.filter((g) => g.activo !== false);
  const materiaDe = (g: (typeof activas)[number]) =>
    Array.isArray(g.materias) ? g.materias[0] : g.materias;
  const aliasDe = (g: (typeof activas)[number]) =>
    Array.isArray(g.materias_nombres_visibles)
      ? g.materias_nombres_visibles[0]
      : g.materias_nombres_visibles;
  // Nombre visible (alias activo ?? nombre): la misma fuente que la boleta.
  const nombreVisibleDe = (g: (typeof activas)[number]) => {
    const alias = aliasDe(g);
    if (alias && alias.activo !== false && alias.nombre_visible?.trim()) {
      return alias.nombre_visible.trim();
    }
    return materiaDe(g)?.nombre ?? "";
  };

  const porHorario = activas.find((g) => g.materia_id && materiaIds.has(g.materia_id));
  if (porHorario) {
    return {
      ok: true,
      grupoMateriaId: porHorario.id,
      nombreVisible: nombreVisibleDe(porHorario),
    };
  }

  const porClave = activas.find((g) => {
    const m = materiaDe(g);
    if (!m) return false;
    return (
      materiaClaveHorario(m.nombre ?? "") === claveBuscada ||
      materiaClaveHorario(m.clave ?? "") === claveBuscada ||
      clavesEquivalenciaMateria(m.nombre ?? "").includes(claveBuscada) ||
      clavesEquivalenciaMateria(m.clave ?? "").includes(claveBuscada)
    );
  });
  if (porClave) {
    return {
      ok: true,
      grupoMateriaId: porClave.id,
      nombreVisible: nombreVisibleDe(porClave),
    };
  }

  return { ok: true, grupoMateriaId: null, nombreVisible: null };
}
