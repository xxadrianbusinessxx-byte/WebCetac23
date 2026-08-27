/**
 * C4.12 — ADMINISTRACIÓN EXPLÍCITA DE ASIGNACIONES DE PROFESOR.
 *
 * Identidad estructural:
 *
 *   profesor_id (PROFESORES.ID) + grupo_materia_id (grupo_materias.id)
 *
 * Principios (congelados):
 *   - Las asignaciones SOLO se crean por administración explícita. NUNCA se
 *     infieren por CLAVE, NOMBRE, carrera, grupo anterior, historial de
 *     asistencia/calificaciones, ETIQUETAS ni heurísticas.
 *   - La autoridad del ACTOR autenticado se resuelve en la capa de acciones
 *     (obtenerSesionPortal + rol). Este módulo recibe el OBJETIVO
 *     administrativo (profesorId / grupoMateriaId) y lo valida contra el
 *     catálogo real.
 *   - CLAVE se copia en `profesor_clave` SOLO como dato histórico (columna
 *     NOT NULL legacy). NUNCA resuelve identidad ni autorización.
 *   - No se elimina `profesor_clave`. No se retira FALLBACK_TODAS_LAS_MATERIAS.
 *   - Requiere el DDL de C4.11 (supabase/migrar-asignaciones-profesor-id.sql).
 *     Si la columna `profesor_id` no existe, toda operación devuelve un error
 *     controlado (ERROR_DDL_PENDIENTE); nunca se improvisa el esquema.
 *   - Desactivación = UPDATE activo=false + hasta (sin DELETE, se conserva
 *     historial).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TABLA_ASIGNACIONES_PROFESOR,
} from "./tables";
import { resolverGrupoMateria } from "./catalogo-academico";
import { nombreProfesor, type ProfesorRow } from "./profesores";

export const ERROR_DDL_PENDIENTE =
  "Esquema C4.11 pendiente: aplicar supabase/migrar-asignaciones-profesor-id.sql (columna asignaciones_profesor.profesor_id) antes de administrar asignaciones.";

export type ResultadoAdmin =
  | { ok: true; mensaje: string; asignacionId?: string }
  | { ok: false; error: string };

/* ---------------------------------------------------------------------------
 * VALIDADORES PUROS (sin acceso a BD)
 * ------------------------------------------------------------------------- */

export function parsearProfesorId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsearUuid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!UUID_RE.test(v)) return null;
  return v;
}

export function parsearFechaIso(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/* ---------------------------------------------------------------------------
 * ESQUEMA REAL
 * ------------------------------------------------------------------------- */

/** Verifica que la columna `profesor_id` exista (DDL C4.11 aplicado). */
export async function verificarEsquemaProfesorId(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("profesor_id")
    .limit(1);
  if (!error) return { ok: true };
  const mensaje = String(error.message ?? "");
  if (/\b42703\b/.test(mensaje) || /does not exist/i.test(mensaje)) {
    return { ok: false, error: ERROR_DDL_PENDIENTE };
  }
  return { ok: false, error: mensaje };
}

/** Profesor por PROFESORES.ID (nunca por CLAVE). */
export async function obtenerProfesorPorId(
  supabase: SupabaseClient,
  profesorId: number,
): Promise<ProfesorRow | null> {
  const { data, error } = await supabase
    .from("PROFESORES")
    .select('ID, "NOMBRE/PROFESOR/DIRECTIVO", CLAVE, Permisos')
    .range(0, 4999);
  if (error || !data?.length) return null;
  return (data as ProfesorRow[]).find((p) => p.ID === profesorId) ?? null;
}

/* ---------------------------------------------------------------------------
 * CREAR / DESACTIVAR
 * ------------------------------------------------------------------------- */

/**
 * Crea una asignación explícita profesor → grupo_materia.
 * Todas las validaciones son server-side; el servidor deriva grupo, materia,
 * carrera, periodo y tabla_legacy desde `grupo_materias` (nunca del cliente).
 */
export async function crearAsignacion(
  supabase: SupabaseClient,
  input: {
    profesorId: unknown;
    grupoMateriaId: unknown;
    desde?: unknown;
    hasta?: unknown;
  },
): Promise<ResultadoAdmin> {
  const profesorId = parsearProfesorId(input.profesorId);
  if (!profesorId) {
    return {
      ok: false,
      error: "profesorId debe ser un entero positivo (PROFESORES.ID).",
    };
  }

  const grupoMateriaId = parsearUuid(input.grupoMateriaId);
  if (!grupoMateriaId) {
    return { ok: false, error: "grupoMateriaId debe ser un UUID válido." };
  }

  const desde = parsearFechaIso(input.desde);
  const hasta = parsearFechaIso(input.hasta);
  if (
    input.desde !== undefined &&
    input.desde !== null &&
    input.desde !== "" &&
    !desde
  ) {
    return { ok: false, error: "desde no es una fecha ISO 8601 válida." };
  }
  if (
    input.hasta !== undefined &&
    input.hasta !== null &&
    input.hasta !== "" &&
    !hasta
  ) {
    return { ok: false, error: "hasta no es una fecha ISO 8601 válida." };
  }
  if (desde && hasta && hasta < desde) {
    return { ok: false, error: "hasta debe ser mayor o igual que desde." };
  }

  // Identidad del profesor objetivo: PROFESORES.ID (nunca CLAVE).
  const profesor = await obtenerProfesorPorId(supabase, profesorId);
  if (!profesor) {
    return { ok: false, error: `No existe PROFESORES.ID = ${profesorId}.` };
  }

  // Oferta: grupo_materia + materia + grupo + periodo (+ carrera) ACTIVOS.
  const resuelto = await resolverGrupoMateria(supabase, grupoMateriaId);
  if (!resuelto) {
    return {
      ok: false,
      error:
        "El grupo-materia no existe o no está activo (grupo_materias, materia, grupo y periodo deben estar activos).",
    };
  }

  // Esquema C4.11 (columna profesor_id).
  const esquema = await verificarEsquemaProfesorId(supabase);
  if (!esquema.ok) {
    return { ok: false, error: esquema.error ?? ERROR_DDL_PENDIENTE };
  }

  // Duplicado activo lógico (la UNIQUE estructural (grupo_materia_id,
  // profesor_id) se auditará en una fase posterior; aquí se impide en capa).
  const { data: existente, error: eDup } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("id")
    .eq("grupo_materia_id", grupoMateriaId)
    .eq("profesor_id", profesorId)
    .eq("activo", true)
    .maybeSingle();
  if (eDup) return { ok: false, error: eDup.message };
  if (existente) {
    return {
      ok: false,
      error:
        "Ya existe una asignación ACTIVA de ese profesor para ese grupo-materia.",
    };
  }

  // INSERT. `profesor_clave` se copia desde la fila de PROFESORES como dato
  // HISTÓRICO (columna NOT NULL legacy); no resuelve identidad ni autoriza.
  const { data: nueva, error: eIns } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .insert({
      profesor_id: profesorId,
      profesor_clave: profesor.CLAVE,
      grupo_materia_id: grupoMateriaId,
      activo: true,
      desde: desde ?? new Date().toISOString(),
      hasta: hasta ?? null,
    })
    .select("id")
    .single();
  if (eIns) return { ok: false, error: eIns.message };

  return {
    ok: true,
    mensaje: `Asignación creada: ${profesorId} → ${resuelto.grupo.grado} ${resuelto.grupo.nombre} / ${resuelto.materia.nombre}.`,
    asignacionId: (nueva as { id?: string })?.id,
  };
}

/**
 * Desactiva una asignación (activo=false + hasta=ahora). Sin DELETE:
 * se conserva el historial.
 */
export async function desactivarAsignacion(
  supabase: SupabaseClient,
  asignacionIdRaw: unknown,
): Promise<ResultadoAdmin> {
  const asignacionId = parsearUuid(asignacionIdRaw);
  if (!asignacionId) {
    return { ok: false, error: "asignacionId debe ser un UUID válido." };
  }

  const esquema = await verificarEsquemaProfesorId(supabase);
  if (!esquema.ok) {
    return { ok: false, error: esquema.error ?? ERROR_DDL_PENDIENTE };
  }

  const { data: existente, error: e1 } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("id")
    .eq("id", asignacionId)
    .eq("activo", true)
    .maybeSingle();
  if (e1) return { ok: false, error: e1.message };
  if (!existente) {
    return { ok: false, error: "La asignación no existe o ya está inactiva." };
  }

  const { error: eUpd } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .update({ activo: false, hasta: new Date().toISOString() })
    .eq("id", asignacionId);
  if (eUpd) return { ok: false, error: eUpd.message };

  return { ok: true, mensaje: "Asignación desactivada (historial conservado)." };
}

/* ---------------------------------------------------------------------------
 * LISTADO ADMINISTRATIVO
 * ------------------------------------------------------------------------- */

export type AsignacionAdminListado = {
  asignacionId: string;
  profesorId: number | null;
  profesorNombre: string;
  profesorClave: string | null;
  grupoMateriaId: string;
  grupoDescripcion: string;
  materiaNombre: string;
  carreraClave: string | null;
  periodoNombre: string;
  tablaLegacy: string | null;
  activo: boolean;
  desde: string | null;
  hasta: string | null;
};

/**
 * Lista asignaciones con información derivada del catálogo. La CLAVE solo se
 * expone como dato histórico informativo; la identidad mostrada es
 * PROFESORES.ID. Con 0 filas devuelve [].
 */
export async function listarAsignacionesAdmin(
  supabase: SupabaseClient,
): Promise<
  | { ok: true; asignaciones: AsignacionAdminListado[] }
  | { ok: false; error: string }
> {
  const esquema = await verificarEsquemaProfesorId(supabase);
  if (!esquema.ok) {
    return { ok: false, error: esquema.error ?? ERROR_DDL_PENDIENTE };
  }

  const { data, error } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select(
      "id, grupo_materia_id, profesor_id, profesor_clave, activo, desde, hasta",
    )
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const filas = (data ?? []) as Array<{
    id: string;
    grupo_materia_id: string;
    profesor_id: number | null;
    profesor_clave: string | null;
    activo: boolean;
    desde: string | null;
    hasta: string | null;
  }>;
  if (!filas.length) return { ok: true, asignaciones: [] };

  const salida: AsignacionAdminListado[] = [];
  for (const f of filas) {
    const resuelto = await resolverGrupoMateria(supabase, f.grupo_materia_id);
    const prof =
      typeof f.profesor_id === "number"
        ? await obtenerProfesorPorId(supabase, f.profesor_id)
        : null;
    salida.push({
      asignacionId: f.id,
      profesorId: f.profesor_id ?? null,
      profesorNombre: prof
        ? nombreProfesor(prof)
        : `PROFESORES.ID ${f.profesor_id ?? "?"}`,
      profesorClave: f.profesor_clave ?? null,
      grupoMateriaId: f.grupo_materia_id,
      grupoDescripcion: resuelto
        ? `${resuelto.grupo.grado} ${resuelto.grupo.nombre}`
        : f.grupo_materia_id,
      materiaNombre: resuelto?.materia.nombre ?? "—",
      carreraClave: resuelto?.carrera?.clave ?? null,
      periodoNombre: resuelto?.periodo.nombre ?? "—",
      tablaLegacy: resuelto?.grupoMateria.tabla_legacy ?? null,
      activo: f.activo,
      desde: f.desde,
      hasta: f.hasta,
    });
  }
  return { ok: true, asignaciones: salida };
}


