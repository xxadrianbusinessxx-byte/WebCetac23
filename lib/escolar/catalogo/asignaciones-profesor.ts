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
  TABLA_CARRERAS,
  TABLA_GRUPO_MATERIAS,
  TABLA_PERIODOS,
  TABLA_PROFESORES,
} from "../tables.ts";
import { resolverGrupoMateria, resolverGrupoMateriasBatch } from "./catalogo-academico.ts";
import { nombreProfesor, type ProfesorRow } from "./profesores.ts";
import {
  bloqueaPorOtroDueno,
  errorMateriaConOtroDueno,
  planAsignarMateria,
  type FilaAsignacionDeMateria,
} from "./asignacion-materia-puro.ts";
import {
  listarNombresVisiblesMaterias,
  nombreVisibleDesdeMapa,
} from "../materia/nombres-visibles.ts";

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
 * Asigna una materia de grupo a un profesor: crea (o reactiva) su asignación y
 * REEMPLAZA al dueño activo que tuviera (2026-11-17: un dueño activo por
 * materia; es la ÚNICA vía para dar la propiedad — subir asistencia ya no la da).
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
    /** true = si la materia ya tiene otro dueño activo, reemplazarlo. Por
     *  defecto NO: el alta en lote nunca barre a los demás profesores. */
    reemplazar?: unknown;
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

  // Un dueño ACTIVO por materia (2026-11-17). La decisión —reactivar,
  // reconciliar una fila legacy (C4.28), insertar, y qué otros dueños activos
  // se reemplazan— es pura: `planAsignarMateria`. Conviven dos UNIQUE legacy
  // ((grupo_materia_id, profesor_clave) y la parcial por profesor_id), por eso
  // se inspeccionan TODAS las filas de la materia. La CLAVE solo es match
  // histórico de filas legacy, NUNCA identidad.
  const { data: filasGm, error: eDup } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("id, profesor_id, profesor_clave, activo")
    .eq("grupo_materia_id", grupoMateriaId);
  if (eDup) return { ok: false, error: eDup.message };

  const plan = planAsignarMateria(
    (filasGm ?? []) as FilaAsignacionDeMateria[],
    profesorId,
    String(profesor.CLAVE ?? ""),
  );
  const etiqueta = `${resuelto.grupo.grado} ${resuelto.grupo.nombre} / ${resuelto.materia.nombre}`;

  if (bloqueaPorOtroDueno(plan, input.reemplazar === true)) {
    return { ok: false, error: errorMateriaConOtroDueno(plan.reemplazados) };
  }

  if (plan.accion.tipo === "ya_activa") {
    return {
      ok: false,
      error: `Ya existe una asignación ACTIVA de PROFESORES.ID ${profesorId} para ese grupo-materia (${etiqueta}).`,
    };
  }

  // 1) Reemplazo: los otros dueños activos pasan a inactivos ANTES de activar
  //    al nuevo (la UNIQUE parcial de un dueño activo lo exige). Si lo que
  //    sigue fallara, la materia queda sin dueño —nunca con dos— y basta con
  //    reintentar.
  if (plan.desactivar.length > 0) {
    const { error: eDes } = await supabase
      .from(TABLA_ASIGNACIONES_PROFESOR)
      .update({ activo: false, hasta: new Date().toISOString() })
      .in("id", plan.desactivar);
    if (eDes) return { ok: false, error: eDes.message };
  }
  const reemplazo = plan.reemplazados.length
    ? ` Reemplaza a PROFESORES.ID ${plan.reemplazados.join(", ")} (queda inactiva, con historial).`
    : "";

  // 2) El nuevo dueño.
  if (plan.accion.tipo === "reactivar") {
    const { error: eUp } = await supabase
      .from(TABLA_ASIGNACIONES_PROFESOR)
      .update({ activo: true, hasta: null })
      .eq("id", plan.accion.filaId);
    if (eUp) return { ok: false, error: eUp.message };
    return {
      ok: true,
      mensaje: `Asignación REACTIVADA: PROFESORES.ID ${profesorId} → ${etiqueta} (historial conservado).${reemplazo}`,
      asignacionId: plan.accion.filaId,
    };
  }

  if (plan.accion.tipo === "reconciliar") {
    const { error: eUp } = await supabase
      .from(TABLA_ASIGNACIONES_PROFESOR)
      .update({ profesor_id: profesorId, activo: true, hasta: null })
      .eq("id", plan.accion.filaId);
    if (eUp) return { ok: false, error: eUp.message };
    return {
      ok: true,
      mensaje: `Asignación legacy RECONCILIADA: la fila existente (${plan.accion.filaId.slice(0, 8)}…) se actualizó con PROFESORES.ID ${profesorId} → ${etiqueta}. Historial conservado; CLAVE solo queda como dato histórico.${reemplazo}`,
      asignacionId: plan.accion.filaId,
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
    mensaje: `Asignación creada: PROFESORES.ID ${profesorId} → ${etiqueta}.${reemplazo}`,
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

/* ---------------------------------------------------------------------------
 * OFERTA DE grupo_materias PARA EL SELECTOR ADMINISTRATIVO
 * ------------------------------------------------------------------------- */

type GrupoMateriaRef = {
  id: string;
  grado: string;
  nombre: string;
  carrera_id: string | null;
  periodo_id: string;
};

type MateriaRef = { id: string; clave: string; nombre: string };

/** PostgREST embeds pueden venir como objeto o como array según la FK. */
function aUno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return (v[0] ?? null) as T | null;
  return (v ?? null) as T | null;
}

type GrupoMateriaJoin = {
  id: string;
  tabla_legacy: string | null;
  activo: boolean;
  grupos: GrupoMateriaRef | GrupoMateriaRef[] | null;
  materias: MateriaRef | MateriaRef[] | null;
};

export type GrupoMateriaParaAsignacion = {
  grupoMateriaId: string;
  /** Presentación humana: grado + grupo + carrera (ej. "2DO A RH"). */
  descripcion: string;
  /** Nombre visible de la materia (alias → materias.nombre → materias.clave). */
  materiaNombre: string;
  /** Solo debugging administrativo. */
  materiaClave: string;
  carreraClave: string | null;
  periodoNombre: string;
  /** Nombre físico de la tabla; solo debugging (la UI NO lo expone). */
  tablaLegacy: string | null;
  /** Dueño ACTIVO hoy (2026-11-17), o null. Asignar la materia a otro lo reemplaza. */
  profesorActual: { id: number; nombre: string } | null;
};

/**
 * Lista la oferta de grupo_materias ACTIVA (grupo + carrera + materia +
 * periodo) para el selector administrativo de asignaciones.
 *
 * El nombre visible de la materia sale del alias existente
 * (materias_nombres_visibles) o del catálogo (materias.nombre/clave); NUNCA del
 * nombre físico de la tabla (C4.28). Antes vivía en la Server Action.
 */
export async function listarGruposMateriasParaAsignacion(
  supabase: SupabaseClient,
): Promise<GrupoMateriaParaAsignacion[] | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select(
      "id, tabla_legacy, activo, grupos(id, grado, nombre, carrera_id, periodo_id), materias(id, clave, nombre)",
    )
    .eq("activo", true)
    .order("tabla_legacy");
  if (error) return { ok: false, error: error.message };

  const gms = (data ?? []) as unknown as GrupoMateriaJoin[];
  const periodoIds = [
    ...new Set(
      gms.map((g) => aUno(g.grupos)?.periodo_id).filter((x): x is string => Boolean(x)),
    ),
  ];
  const carreraIds = [
    ...new Set(
      gms.map((g) => aUno(g.grupos)?.carrera_id).filter((x): x is string => Boolean(x)),
    ),
  ];

  const [periodosRes, carrerasRes] = await Promise.all([
    periodoIds.length
      ? supabase.from(TABLA_PERIODOS).select("id, nombre").in("id", periodoIds)
      : Promise.resolve({ data: [], error: null }),
    carreraIds.length
      ? supabase.from(TABLA_CARRERAS).select("id, clave").in("id", carreraIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const periodoPorId = new Map(
    ((periodosRes.data ?? []) as Array<{ id: string; nombre: string }>).map(
      (p) => [p.id, p.nombre],
    ),
  );
  const carreraPorId = new Map(
    ((carrerasRes.data ?? []) as Array<{ id: string; clave: string }>).map(
      (c) => [c.id, c.clave],
    ),
  );

  const aliases = await listarNombresVisiblesMaterias(supabase);

  // Dueño activo de cada materia: el selector lo muestra para que el técnico
  // sepa a quién reemplaza. Dos consultas fijas, sin N+1.
  const duenos = await listarDuenosActivosDeMaterias(
    supabase,
    gms.map((g) => g.id),
  );
  const profesoresDueno = await obtenerProfesoresPorIds(supabase, [...duenos.values()]);

  return gms.map((g) => {
    const grupo = aUno(g.grupos);
    const materia = aUno(g.materias);
    const carreraClave = grupo?.carrera_id
      ? (carreraPorId.get(grupo.carrera_id) ?? null)
      : null;
    const grupoDesc = `${grupo?.grado ?? ""} ${grupo?.nombre ?? ""}`.trim();
    const aliasResuelto = g.tabla_legacy
      ? nombreVisibleDesdeMapa(aliases, g.tabla_legacy)
      : "";
    const materiaNombre =
      (aliasResuelto && aliasResuelto !== g.tabla_legacy ? aliasResuelto : "") ||
      (materia?.nombre?.trim() ?? "") ||
      (materia?.clave?.trim() ?? "—");
    return {
      grupoMateriaId: g.id,
      descripcion: grupoDesc
        ? `${grupoDesc}${carreraClave ? " " + carreraClave : ""}`
        : g.id,
      materiaNombre,
      materiaClave: materia?.clave ?? "—",
      carreraClave,
      periodoNombre: grupo?.periodo_id
        ? (periodoPorId.get(grupo.periodo_id) ?? "—")
        : "—",
      tablaLegacy: g.tabla_legacy ?? null,
      profesorActual: (() => {
        const id = duenos.get(g.id);
        if (id === undefined) return null;
        const p = profesoresDueno.get(id);
        return { id, nombre: (p && nombreProfesor(p)) || `ID ${id}` };
      })(),
    };
  });
}

/**
 * `grupo_id` de los grupos donde el profesor tiene ASIGNACIONES ACTIVAS
 * (`asignaciones_profesor` → `grupo_materias`).
 *
 * Es el alcance R-4 del panel de asistencias: cuando el profesor ya tiene
 * asignaciones, su alcance se acota a esos grupos. Bajada de
 * `app/actions/asistencias.ts` (PROMPT E · R-1).
 */
export async function listarGrupoIdsAsignadosProfesor(
  supabase: SupabaseClient,
  profesorId: number,
  limite = 500,
): Promise<Set<string>> {
  const { data: asig } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("grupo_materias!inner(grupo_id)")
    .eq("profesor_id", profesorId)
    .eq("activo", true)
    .limit(limite);

  const grupoIds = new Set<string>();
  for (const a of asig ?? []) {
    const gm = (a as { grupo_materias?: unknown }).grupo_materias;
    const g = Array.isArray(gm) ? gm[0] : gm;
    const gid = (g as { grupo_id?: string } | undefined)?.grupo_id;
    if (gid) grupoIds.add(String(gid));
  }
  return grupoIds;
}



/**
 * Dueño ACTIVO de cada materia de grupo pedida → `Map<grupoMateriaId,
 * profesorId>`. Una materia sin asignación activa no aparece en el mapa.
 *
 * La propiedad de una materia vive SOLO en `asignaciones_profesor` y la asigna
 * el técnico (2026-11-17): subir asistencia ya no la da. La usan los
 * justificantes para saber qué profesor justifica cada falta. Una sola
 * consulta, sin N+1. Lectura mínima: quien llama decide qué hacer con el dato.
 */
export async function listarDuenosActivosDeMaterias(
  supabase: SupabaseClient,
  grupoMateriaIds: readonly string[],
): Promise<Map<string, number>> {
  const duenos = new Map<string, number>();
  const ids = [...new Set(grupoMateriaIds.filter(Boolean))];
  if (ids.length === 0) return duenos;
  const { data, error } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("grupo_materia_id, profesor_id")
    .in("grupo_materia_id", ids)
    .eq("activo", true);
  if (error || !data) return duenos;
  for (const fila of data as { grupo_materia_id: string; profesor_id: number | null }[]) {
    if (typeof fila.profesor_id === "number") {
      duenos.set(fila.grupo_materia_id, fila.profesor_id);
    }
  }
  return duenos;
}

/**
 * Lo que el profesor tiene ASIGNADO (activo): sus materias de grupo y los grupos
 * donde están. Es el alcance de lectura de asistencia (2026-11-18): el dueño de
 * una materia ve su asistencia aunque la haya capturado otro (Servicio Escolar,
 * el directivo). Una consulta, sin N+1. Sin asignaciones, o si la lectura falla,
 * conjuntos vacíos: quien llama cae en la regla anterior (lo que él capturó).
 */
export async function listarAlcanceAsignadoProfesor(
  supabase: SupabaseClient,
  profesorId: number,
): Promise<{
  materias: Set<string>;
  grupos: { grupoId: string; grado: string; grupo: string }[];
}> {
  const materias = new Set<string>();
  const grupos = new Map<string, { grupoId: string; grado: string; grupo: string }>();
  const id = Number(profesorId);
  if (!Number.isInteger(id) || id <= 0) return { materias, grupos: [] };

  const { data, error } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("grupo_materia_id, grupo_materias!inner(grupo_id, grupos!inner(grado, nombre))")
    .eq("profesor_id", id)
    .eq("activo", true)
    .limit(500);
  if (error || !data) return { materias, grupos: [] };

  // PostgREST puede devolver la relación incrustada como objeto o como arreglo de uno.
  const uno = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  type Grupo = { grado: string | null; nombre: string | null };
  type GrupoMateria = { grupo_id: string | null; grupos: Grupo | Grupo[] | null };
  for (const fila of data as unknown as {
    grupo_materia_id: string;
    grupo_materias: GrupoMateria | GrupoMateria[] | null;
  }[]) {
    if (fila.grupo_materia_id) materias.add(String(fila.grupo_materia_id));
    const gm = uno(fila.grupo_materias);
    const g = uno(gm?.grupos);
    if (gm?.grupo_id && !grupos.has(gm.grupo_id)) {
      grupos.set(gm.grupo_id, {
        grupoId: String(gm.grupo_id),
        grado: String(g?.grado ?? "").trim().toUpperCase(),
        grupo: String(g?.nombre ?? "").trim().toUpperCase(),
      });
    }
  }
  return { materias, grupos: [...grupos.values()] };
}
