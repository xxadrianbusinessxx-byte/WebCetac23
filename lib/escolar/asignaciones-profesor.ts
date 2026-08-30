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
  TABLA_PROFESORES,
} from "./tables";
import { resolverGrupoMateria, resolverGrupoMateriasBatch } from "./catalogo-academico";
import { nombreProfesor, type ProfesorRow } from "./profesores";
import {
  listarNombresVisiblesMaterias,
  nombreVisibleDesdeMapa,
} from "./nombres-visibles";

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

/**
 * O8 — Batch de profesores por PROFESORES.ID en UNA consulta (`in(ID)`).
 * Devuelve un Map ID → ProfesorRow. Evita el full-scan de PROFESORES por
 * cada asignación (antes: 1 `range(0,4999)` por profesor).
 */
export async function obtenerProfesoresPorIds(
  supabase: SupabaseClient,
  profesorIds: readonly number[],
): Promise<Map<number, ProfesorRow>> {
  const ids = [
    ...new Set(
      profesorIds.filter(
        (x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0,
      ),
    ),
  ];
  const mapa = new Map<number, ProfesorRow>();
  if (ids.length === 0) return mapa;

  const { data, error } = await supabase
    .from(TABLA_PROFESORES)
    .select('ID, "NOMBRE/PROFESOR/DIRECTIVO", CLAVE, Permisos')
    .in("ID", ids);
  if (error || !data) return mapa;
  for (const p of data as ProfesorRow[]) mapa.set(p.ID, p);
  return mapa;
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

  // C4.28 — RECONCILIACIÓN MÍNIMA ANTI-DUPLICADOS.
  // Conviven dos constraints: la UNIQUE legacy (grupo_materia_id,
  // profesor_clave) = "asignaciones_profesor_unico", y la UNIQUE parcial
  // estructural (grupo_materia_id, profesor_id) WHERE profesor_id IS NOT NULL.
  // El error "duplicate key ... asignaciones_profesor_unico" aparece cuando una
  // fila legacy (profesor_id NULL + profesor_clave) ya ocupa el par
  // (grupo_materia_id, profesor_clave) y se intenta INSERTAR de nuevo.
  // Por eso se inspeccionan TODAS las filas del grupo_materia y se resuelve:
  //   a) fila ESTRUCTURAL con profesor_id == PROFESORES.ID:
  //        activa → mensaje claro (no insertar);
  //        inactiva → reactivar (activo=true, hasta=null) conservando historial.
  //   b) fila LEGACY con profesor_id NULL y profesor_clave == CLAVE:
  //        reconciliar: profesor_id = PROFESORES.ID, activo = true; se conserva
  //        historial y datos. CLAVE solo actúa como MATCH HISTÓRICO de filas
  //        legacy, NUNCA como identidad.
  //   c) ninguna → INSERT normal.
  const { data: filasGm, error: eDup } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("id, profesor_id, profesor_clave, activo, desde, hasta")
    .eq("grupo_materia_id", grupoMateriaId);
  if (eDup) return { ok: false, error: eDup.message };

  type FilaAsignacionGm = {
    id: string;
    profesor_id: number | null;
    profesor_clave: string | null;
    activo: boolean;
    desde: string | null;
    hasta: string | null;
  };
  const filas = (filasGm ?? []) as FilaAsignacionGm[];
  const claveProf = String(profesor.CLAVE ?? "").trim().toUpperCase();
  const etiqueta = `${resuelto.grupo.grado} ${resuelto.grupo.nombre} / ${resuelto.materia.nombre}`;

  // a) Estructural por PROFESORES.ID.
  const estructural = filas.find(
    (f) => typeof f.profesor_id === "number" && f.profesor_id === profesorId,
  );
  if (estructural) {
    if (estructural.activo) {
      return {
        ok: false,
        error: `Ya existe una asignación ACTIVA de PROFESORES.ID ${profesorId} para ese grupo-materia (${etiqueta}).`,
      };
    }
    const { error: eUp } = await supabase
      .from(TABLA_ASIGNACIONES_PROFESOR)
      .update({ activo: true, hasta: null })
      .eq("id", estructural.id);
    if (eUp) return { ok: false, error: eUp.message };
    return {
      ok: true,
      mensaje: `Asignación REACTIVADA: PROFESORES.ID ${profesorId} → ${etiqueta} (historial conservado).`,
      asignacionId: estructural.id,
    };
  }

  // b) Fila legacy con profesor_id NULL y profesor_clave == CLAVE.
  const legacy = filas.find(
    (f) =>
      f.profesor_id === null &&
      String(f.profesor_clave ?? "").trim().toUpperCase() === claveProf,
  );
  if (legacy) {
    const { error: eUp } = await supabase
      .from(TABLA_ASIGNACIONES_PROFESOR)
      .update({ profesor_id: profesorId, activo: true, hasta: null })
      .eq("id", legacy.id);
    if (eUp) return { ok: false, error: eUp.message };
    return {
      ok: true,
      mensaje: `Asignación legacy RECONCILIADA: la fila existente (${legacy.id.slice(0, 8)}…) se actualizó con PROFESORES.ID ${profesorId} → ${etiqueta}. Historial conservado; CLAVE solo queda como dato histórico.`,
      asignacionId: legacy.id,
    };
  }

  // c) INSERT. `profesor_clave` se copia desde la fila de PROFESORES como dato
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
    mensaje: `Asignación creada: PROFESORES.ID ${profesorId} → ${etiqueta}.`,
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
  /** Nombre de la materia desde el catálogo (materias.nombre). */
  materiaNombre: string;
  /** Nombre VISIBLE de la materia (alias → materias.nombre → id). Solo presentación. */
  materiaNombreVisible: string;
  carreraClave: string | null;
  periodoNombre: string;
  /** Nombre físico de la tabla (solo debugging administrativo). */
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

  // C4.28 — nombre visible de la materia desde materias_nombres_visibles
  // (la tabla física tras el rename es clave del alias; nunca se expone el
  // nombre físico como identidad académica).
  const aliases = await listarNombresVisiblesMaterias(supabase);

  // O8 — Batch: resuelve TODOS los grupo_materias en pocas consultas
  // (`resolverGrupoMateriasBatch`) y TODOS los profesores en una (`in(ID)`),
  // en lugar de ~6 consultas por asignación (incluido un full-scan de
  // PROFESORES por cada una).
  const grupoMateriaIds = [
    ...new Set(filas.map((f) => f.grupo_materia_id)),
  ];
  const profesorIds = filas
    .map((f) => f.profesor_id)
    .filter((x): x is number => typeof x === "number");
  const [resueltos, profesores] = await Promise.all([
    resolverGrupoMateriasBatch(supabase, grupoMateriaIds),
    obtenerProfesoresPorIds(supabase, profesorIds),
  ]);

  const salida: AsignacionAdminListado[] = [];
  for (const f of filas) {
    const resuelto = resueltos.get(f.grupo_materia_id) ?? null;
    const prof =
      typeof f.profesor_id === "number"
        ? (profesores.get(f.profesor_id) ?? null)
        : null;
    const tablaLegacy = resuelto?.grupoMateria.tabla_legacy ?? null;
    const aliasResuelto =
      tablaLegacy && resuelto?.grupoMateria.tabla_legacy
        ? nombreVisibleDesdeMapa(aliases, resuelto.grupoMateria.tabla_legacy)
        : "";
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
      materiaNombreVisible:
        (aliasResuelto && aliasResuelto !== tablaLegacy
          ? aliasResuelto
          : "") ||
        (resuelto?.materia.nombre?.trim() ?? "") ||
        "—",
      carreraClave: resuelto?.carrera?.clave ?? null,
      periodoNombre: resuelto?.periodo.nombre ?? "—",
      tablaLegacy,
      activo: f.activo,
      desde: f.desde,
      hasta: f.hasta,
    });
  }
  return { ok: true, asignaciones: salida };
}


