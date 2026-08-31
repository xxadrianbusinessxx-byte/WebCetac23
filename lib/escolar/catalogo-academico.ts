/**
 * CATÁLOGO ACADÉMICO — CAPA DE RESOLUCIÓN (FASE C1)
 *
 * Responsabilidad: resolver la OFERTA académica y las RELACIONES OPERATIVAS
 * (inscripciones y asignaciones) desde las tablas nuevas del catálogo:
 *
 *   periodos · carreras · materias · grupos · grupo_materias
 *   inscripciones_alumno · asignaciones_profesor
 *
 * PRINCIPIOS (congelados en FASE 3.2):
 *   - Este módulo NO conoce las tablas de calificaciones legacy; solo usa
 *     `grupo_materias.tabla_legacy` como dato de adaptación (puente físico).
 *   - ETIQUETAS PERSONALES queda fuera de este módulo (perfil privado).
 *   - `inscripciones_alumno.curp` y `asignaciones_profesor.profesor_clave`
 *     NO tienen FK a tablas legacy; la validación de existencia se hace en
 *     la capa (ALUMNOS / PROFESORES).
 *   - C4.11: `asignaciones_profesor.profesor_id` (INTEGER) es la identidad
 *     ESTRUCTURAL del profesor y referencia `PROFESORES.ID`. `profesor_clave`
 *     se conserva como compatibilidad/histórico (asistencia y código legacy)
 *     mientras dure la transición; NO resuelve asignaciones nuevas.
 *   - La regla «una inscripción activa por alumno» es de NEGOCIO: este módulo
 *     ofrece `inscribirAlumno({ unaActiva: true })`, no una constraint rígida.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { gradoASemestre, semestreActivoDeGrupo } from "./semestres";
import {
  TABLA_ASIGNACIONES_PROFESOR,
  TABLA_CARRERAS,
  TABLA_GRUPO_MATERIAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_MATERIAS,
  TABLA_PERIODOS,
} from "./tables";

/* ---------------------------------------------------------------------------
 * TIPOS DE FILA (catálogo)
 * ------------------------------------------------------------------------- */

export type PeriodoRow = {
  id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type CarreraRow = {
  id: string;
  clave: string;
  nombre: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type MateriaRow = {
  id: string;
  clave: string;
  nombre: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type GrupoRow = {
  id: string;
  periodo_id: string;
  grado: string;
  nombre: string;
  carrera_id: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type GrupoMateriaRow = {
  id: string;
  grupo_id: string;
  materia_id: string;
  tabla_legacy: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type InscripcionRow = {
  id: string;
  curp: string;
  grupo_id: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type AsignacionProfesorRow = {
  id: string;
  grupo_materia_id: string;
  profesor_clave: string;
  /** C4.11 — Identidad estructural (PROFESORES.ID). Nullable: filas legacy
   *  solo tienen profesor_clave hasta que la administración las recree. */
  profesor_id?: number | null;
  activo: boolean;
  desde: string;
  hasta: string | null;
  created_at: string;
  updated_at: string;
};

/* ---------------------------------------------------------------------------
 * RESULTADOS RESUELTOS
 * ------------------------------------------------------------------------- */

export type GrupoAlumnoResuelto = {
  inscripcion: InscripcionRow;
  grupo: GrupoRow;
  periodo: PeriodoRow;
  carrera: CarreraRow | null;
};

export type MateriaAlumnoResuelta = {
  grupoMateriaId: string;
  tablaLegacy: string | null;
  materia: MateriaRow;
};

export type GrupoMateriaResuelto = {
  grupoMateria: GrupoMateriaRow;
  materia: MateriaRow;
  grupo: GrupoRow;
  periodo: PeriodoRow;
  carrera: CarreraRow | null;
};

export type AsignacionProfesorResuelta = {
  asignacion: AsignacionProfesorRow;
  grupoMateria: GrupoMateriaRow;
  grupo: GrupoRow;
  periodo: PeriodoRow;
  carrera: CarreraRow | null;
  materia: MateriaRow;
};

/* ---------------------------------------------------------------------------
 * UTILIDADES
 * ------------------------------------------------------------------------- */

function normCurp(curp: string): string {
  return curp.trim().toUpperCase();
}

function normClave(clave: string): string {
  return clave.trim().toUpperCase();
}

/* ---------------------------------------------------------------------------
 * NORMALIZACIÓN PARA MATCHING (G2 — usada por C2)
 *
 * Estas funciones SOLO sirven para comparar datos legacy (ETIQUETAS
 * PERSONALES, archivos) contra registros del catálogo. NO modifican el valor
 * almacenado en `grupos` ni en ETIQUETAS PERSONALES, y NO son identidad: la
 * identidad persistida sigue siendo (periodo, grado, nombre, carrera_id).
 *
 * Equivalencias consideradas SEGURAS:
 *   - GRADO (solo representaciones inequívocas del mismo ordinal):
 *       «1º» «1°» «1RO» «1RO.» → 1RO
 *       «2º» «2°» «2DO» «2DO.» → 2DO
 *       «3º» «3°» «3RO» «3RO.» → 3RO
 *       «4º» «4°» «4TO» «4TO.» → 4TO
 *       «5º» «5°» «5TO» «5TO.» → 5TO
 *       «6º» «6°» «6TO» «6TO.» → 6TO
 *     NO se asume «2D0» = «2DO» ni «4O» = «4TO» (ambigüedad O/0 no resuelta).
 *   - CARRERA: mayúsculas, espacios repetidos y acentos/tildes. NO se fusionan
 *     nombres distintos (ej. «MECATRONICA» vs «ROBOTICA» siguen siendo
 *     distintas; solo «MECATRÓNICA» y «MECATRONICA» son equivalentes).
 *   - GRUPO: mayúsculas y espacios. NO se convierten «A-1», «A1» y «A» en la
 *     misma identidad (los separadores son significativos).
 * ------------------------------------------------------------------------- */

/** Normalización base determinista: trim, mayúsculas, sin acentos, espacios colapsados. */
export function normalizarTextoCatalogo(texto: string): string {
  const t = (texto ?? "").trim().toUpperCase();
  const sinAcentos = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return sinAcentos.replace(/\s+/g, " ");
}

/** Equivalencias seguras de representación del GRADO (ver documentación superior). */
const GRADO_EQUIVALENCIAS: Readonly<Record<string, string>> = {
  "1º": "1RO",
  "1°": "1RO",
  "1RO.": "1RO",
  "2º": "2DO",
  "2°": "2DO",
  "2DO.": "2DO",
  "3º": "3RO",
  "3°": "3RO",
  "3RO.": "3RO",
  "4º": "4TO",
  "4°": "4TO",
  "4TO.": "4TO",
  "5º": "5TO",
  "5°": "5TO",
  "5TO.": "5TO",
  "6º": "6TO",
  "6°": "6TO",
  "6TO.": "6TO",
};

/** Normaliza un GRADO para comparación (matching legacy ↔ catálogo). */
export function normalizarGradoCatalogo(grado: string): string {
  const base = normalizarTextoCatalogo(grado);
  return GRADO_EQUIVALENCIAS[base] ?? base;
}

/** Normaliza un GRUPO para comparación (sin fusionar «A-1»/«A1»/«A»). */
export function normalizarGrupoCatalogo(grupo: string): string {
  return normalizarTextoCatalogo(grupo);
}

/** Normaliza una CARRERA para comparación (sin fusionar nombres distintos). */
export function normalizarCarreraCatalogo(carrera: string): string {
  return normalizarTextoCatalogo(carrera);
}

/* ---------------------------------------------------------------------------
 * INSCRIPCIONES
 * ------------------------------------------------------------------------- */

/**
 * Inscripción ACTIVA de un alumno. null si no tiene.
 *
 * REGLA (G4): si por una inconsistencia temporal existieran VARIAS
 * inscripciones activas para el mismo CURP, el criterio de selección es
 * `created_at DESC` (la más reciente). La regla de negocio «una inscripción
 * activa por alumno» se mantiene en la capa de aplicación; NO se crea una
 * restricción estructural nueva.
 */
export async function obtenerInscripcionActiva(
  supabase: SupabaseClient,
  curp: string,
): Promise<InscripcionRow | null> {
  const c = normCurp(curp);
  if (!c) return null;
  const { data, error } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("*")
    .eq("curp", c)
    .eq("activo", true)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return data[0] as InscripcionRow;
}

/** Crea o re-activa la relación alumno → grupo. UPSERT por (curp, grupo_id). */
export async function inscribirAlumno(
  supabase: SupabaseClient,
  curp: string,
  grupoId: string,
  opts?: { unaActiva?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = normCurp(curp);
  const g = grupoId.trim();
  if (!c || !g) return { ok: false, error: "CURP y grupo son obligatorios." };
  if (opts?.unaActiva) {
    const { error: up } = await supabase
      .from(TABLA_INSCRIPCIONES_ALUMNO)
      .update({ activo: false })
      .eq("curp", c)
      .eq("activo", true)
      .neq("grupo_id", g);
    if (up) return { ok: false, error: up.message };
  }
  const { error } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .upsert(
      { curp: c, grupo_id: g, activo: true },
      { onConflict: "curp,grupo_id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/* ---------------------------------------------------------------------------
 * GRUPOS / OFERTA
 * ------------------------------------------------------------------------- */

/** Grupo activo del alumno, con periodo y carrera resueltos. */
export async function resolverGrupoAlumno(
  supabase: SupabaseClient,
  curp: string,
): Promise<GrupoAlumnoResuelto | null> {
  const inscripcion = await obtenerInscripcionActiva(supabase, curp);
  if (!inscripcion) return null;

  const { data: grupo, error: eG } = await supabase
    .from(TABLA_GRUPOS)
    .select("*")
    .eq("id", inscripcion.grupo_id)
    .eq("activo", true)
    .maybeSingle();
  if (eG || !grupo) return null;

  const { data: periodo, error: eP } = await supabase
    .from(TABLA_PERIODOS)
    .select("*")
    .eq("id", (grupo as GrupoRow).periodo_id)
    .eq("activo", true)
    .maybeSingle();
  if (eP || !periodo) return null;

  let carrera: CarreraRow | null = null;
  const carreraId = (grupo as GrupoRow).carrera_id;
  if (carreraId) {
    const { data: c, error: eC } = await supabase
      .from(TABLA_CARRERAS)
      .select("*")
      .eq("id", carreraId)
      .maybeSingle();
    if (!eC && c) carrera = c as CarreraRow;
  }

  return {
    inscripcion,
    grupo: grupo as GrupoRow,
    periodo: periodo as PeriodoRow,
    carrera,
  };
}

/** Materias del grupo del alumno (inscripción activa). */
export async function resolverMateriasAlumno(
  supabase: SupabaseClient,
  curp: string,
): Promise<MateriaAlumnoResuelta[]> {
  const grupo = await resolverGrupoAlumno(supabase, curp);
  if (!grupo) return [];

  const { data: gms, error: e1 } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("*")
    .eq("grupo_id", grupo.grupo.id)
    .eq("activo", true);
  if (e1 || !gms?.length) return [];

  const filasGm = gms as GrupoMateriaRow[];
  const materiaIds = [...new Set(filasGm.map((gm) => gm.materia_id))];
  const { data: materias, error: e2 } = await supabase
    .from(TABLA_MATERIAS)
    .select("*")
    .in("id", materiaIds)
    .eq("activo", true);
  if (e2 || !materias) return [];

  const porId = new Map((materias as MateriaRow[]).map((m) => [m.id, m]));
  const out: MateriaAlumnoResuelta[] = [];
  for (const gm of filasGm) {
    const materia = porId.get(gm.materia_id);
    if (materia) out.push({ grupoMateriaId: gm.id, tablaLegacy: gm.tabla_legacy, materia });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * IDENTIDAD DESDE CATÁLOGO (C4.28)
 *
 * Resuelve grado / grupo / carrera / asignatura desde la cadena autoritativa
 *
 *     grupo_materias.tabla_legacy → grupos → carreras
 *     grupo_materias.materia_id   → materias
 *
 * usando `tabla_legacy` SOLO como clave física. NUNCA parsea el nombre físico
 * (los identificadores físicos inmutables [GRADO][CARRERA][GRUPO]MAT### no
 * llevan semántica académica: solo identificación).
 * ------------------------------------------------------------------------- */

export type MateriaIdentidadCatalogo = {
  /** Nombre físico EXACTO de la tabla (puente de almacenamiento). */
  tablaLegacy: string;
  grupoMateriaId: string;
  /** Estado de disponibilidad del grupo_materia (activo). */
  gmActivo: boolean;
  grado: string;
  grupo: string;
  carreraClave: string | null;
  /** Nombre de presentación de la materia desde `materias` (catálogo). */
  asignatura: string;
};

/** Normaliza un embed de PostgREST (objeto o array) a un único objeto. */
function embedAUno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return (v[0] ?? null) as T | null;
  return (v ?? null) as T | null;
}

/**
 * C4.28 — Mapa `tabla_legacy` → identidad académica desde el catálogo.
 * Solo lectura; devuelve un Map vacío si no hay correspondencias.
 * `gmActivo` informa si el grupo_materia está disponible (no filtra: la
 * visibilidad se decide en la capa de acciones).
 */
export async function resolverIdentidadesCatalogo(
  supabase: SupabaseClient,
  tablasLegacy: readonly string[],
): Promise<Map<string, MateriaIdentidadCatalogo>> {
  const mapa = new Map<string, MateriaIdentidadCatalogo>();
  const tablas = [
    ...new Set(
      (tablasLegacy ?? [])
        .map((t) => (t ?? "").trim())
        .filter((t): t is string => Boolean(t)),
    ),
  ];
  if (!tablas.length) return mapa;

  const { data, error } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select(
      "id, tabla_legacy, activo, grupos(id, grado, nombre, carrera_id), materias(id, clave, nombre)",
    )
    .in("tabla_legacy", tablas);
  if (error || !data?.length) return mapa;

  const filas = data as Array<{
    id: string;
    tabla_legacy: string | null;
    activo: boolean;
    grupos:
      | { id: string; grado: string; nombre: string; carrera_id: string | null }
      | { id: string; grado: string; nombre: string; carrera_id: string | null }[]
      | null;
    materias:
      | { id: string; clave: string; nombre: string | null }
      | { id: string; clave: string; nombre: string | null }[]
      | null;
  }>;

  const carreraIds = [
    ...new Set(
      filas
        .map((f) => embedAUno(f.grupos)?.carrera_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const carreraClavePorId = new Map<string, string>();
  if (carreraIds.length) {
    const { data: carreras, error: eCarr } = await supabase
      .from(TABLA_CARRERAS)
      .select("id, clave")
      .in("id", carreraIds);
    if (!eCarr) {
      for (const c of (carreras ?? []) as Array<{ id: string; clave: string }>) {
        carreraClavePorId.set(c.id, c.clave);
      }
    }
  }

  for (const f of filas) {
    const t = (f.tabla_legacy ?? "").trim();
    if (!t) continue;
    const grupo = embedAUno(f.grupos);
    const materia = embedAUno(f.materias);
    if (!grupo || !materia) continue;
    mapa.set(t, {
      tablaLegacy: t,
      grupoMateriaId: f.id,
      gmActivo: Boolean(f.activo),
      grado: String(grupo.grado ?? "").trim(),
      grupo: String(grupo.nombre ?? "").trim(),
      carreraClave: grupo.carrera_id
        ? (carreraClavePorId.get(grupo.carrera_id) ?? null)
        : null,
      asignatura: String(materia.nombre ?? materia.clave ?? "").trim(),
    });
  }
  return mapa;
}

/** Busca el grupo por su identidad natural (periodo, grado, nombre, carrera). */
export async function resolverGrupoPorIdentidad(
  supabase: SupabaseClient,
  identidad: {
    periodo: string;
    grado: string;
    grupo: string;
    carrera?: string | null;
  },
): Promise<GrupoRow | null> {
  const periodoNombre = identidad.periodo.trim().toUpperCase();
  const grado = identidad.grado.trim().toUpperCase();
  const nombre = identidad.grupo.trim().toUpperCase();
  const carrera = identidad.carrera?.trim().toUpperCase() || null;
  if (!periodoNombre || !grado || !nombre) return null;

  const { data: periodo, error: e0 } = await supabase
    .from(TABLA_PERIODOS)
    .select("id")
    .eq("nombre", periodoNombre)
    .maybeSingle();
  if (e0 || !periodo) return null;

  let carreraId: string | null = null;
  if (carrera) {
    const { data: c, error: eC } = await supabase
      .from(TABLA_CARRERAS)
      .select("id")
      .eq("clave", carrera)
      .maybeSingle();
    if (eC || !c) return null;
    carreraId = c.id;
  }

  const base = supabase
    .from(TABLA_GRUPOS)
    .select("*")
    .eq("periodo_id", periodo.id)
    .eq("grado", grado)
    .eq("nombre", nombre);

  const { data: grupo, error: eG } = carreraId
    ? await base.eq("carrera_id", carreraId).maybeSingle()
    : await base.is("carrera_id", null).maybeSingle();
  if (eG || !grupo) return null;
  return grupo as GrupoRow;
}

/* ---------------------------------------------------------------------------
 * GRUPO_MATERIA
 * ------------------------------------------------------------------------- */

/** Resuelve un grupo_materia con su materia, grupo, periodo y carrera. */
export async function resolverGrupoMateria(
  supabase: SupabaseClient,
  grupoMateriaId: string,
): Promise<GrupoMateriaResuelto | null> {
  const id = grupoMateriaId.trim();
  if (!id) return null;

  const { data: gm, error: e1 } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("*")
    .eq("id", id)
    .eq("activo", true)
    .maybeSingle();
  if (e1 || !gm) return null;
  const grupoMateria = gm as GrupoMateriaRow;

  const { data: materia, error: e2 } = await supabase
    .from(TABLA_MATERIAS)
    .select("*")
    .eq("id", grupoMateria.materia_id)
    .eq("activo", true)
    .maybeSingle();
  if (e2 || !materia) return null;

  const { data: grupo, error: e3 } = await supabase
    .from(TABLA_GRUPOS)
    .select("*")
    .eq("id", grupoMateria.grupo_id)
    .eq("activo", true)
    .maybeSingle();
  if (e3 || !grupo) return null;

  const { data: periodo, error: e4 } = await supabase
    .from(TABLA_PERIODOS)
    .select("*")
    .eq("id", (grupo as GrupoRow).periodo_id)
    .eq("activo", true)
    .maybeSingle();
  if (e4 || !periodo) return null;

  let carrera: CarreraRow | null = null;
  const carreraId = (grupo as GrupoRow).carrera_id;
  if (carreraId) {
    const { data: c, error: e5 } = await supabase
      .from(TABLA_CARRERAS)
      .select("*")
      .eq("id", carreraId)
      .maybeSingle();
    if (!e5 && c) carrera = c as CarreraRow;
  }

  return {
    grupoMateria,
    materia: materia as MateriaRow,
    grupo: grupo as GrupoRow,
    periodo: periodo as PeriodoRow,
    carrera,
  };
}

/**
 * O8 — Resuelve VARIOS grupo_materias en pocas consultas (`in(id)` + joins en
 * memoria). Devuelve un Map id → GrupoMateriaResuelto (null si no resuelve,
 * con la misma semántica que `resolverGrupoMateria`).
 *
 * Los ids sin resolución quedan con `null` (grupo_materia inactivo/inexistente
 * o algún elemento requerido inactivo/faltante), igual que `resolverGrupoMateria`.
 */
export async function resolverGrupoMateriasBatch(
  supabase: SupabaseClient,
  grupoMateriaIds: readonly string[],
): Promise<Map<string, GrupoMateriaResuelto | null>> {
  const ids = [...new Set(grupoMateriaIds.map((x) => x.trim()).filter(Boolean))];
  const mapa = new Map<string, GrupoMateriaResuelto | null>();
  for (const id of ids) mapa.set(id, null);
  if (ids.length === 0) return mapa;

  const { data: gms, error: e1 } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("*")
    .in("id", ids)
    .eq("activo", true);
  if (e1 || !gms?.length) return mapa;

  const gmPorId = new Map((gms as GrupoMateriaRow[]).map((g) => [g.id, g]));
  const grupoIds = [...new Set([...gmPorId.values()].map((g) => g.grupo_id))];
  const materiaIds = [...new Set([...gmPorId.values()].map((g) => g.materia_id))];

  const [{ data: materias, error: e2 }, { data: grupos, error: e3 }] =
    await Promise.all([
      supabase.from(TABLA_MATERIAS).select("*").in("id", materiaIds).eq("activo", true),
      supabase.from(TABLA_GRUPOS).select("*").in("id", grupoIds).eq("activo", true),
    ]);
  if (e2 || !materias || e3 || !grupos) return mapa;

  const materiaPorId = new Map((materias as MateriaRow[]).map((m) => [m.id, m]));
  const grupoPorId = new Map((grupos as GrupoRow[]).map((g) => [g.id, g]));

  const periodoIds = [...new Set([...grupoPorId.values()].map((g) => g.periodo_id))];
  const carreraIds = [
    ...new Set(
      [...grupoPorId.values()]
        .map((g) => g.carrera_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  const [{ data: periodos, error: e4 }, { data: carreras, error: e5 }] =
    await Promise.all([
      supabase.from(TABLA_PERIODOS).select("*").in("id", periodoIds).eq("activo", true),
      carreraIds.length
        ? supabase.from(TABLA_CARRERAS).select("*").in("id", carreraIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (e4 || !periodos || e5 || !carreras) return mapa;

  const periodoPorId = new Map((periodos as PeriodoRow[]).map((p) => [p.id, p]));
  const carreraPorId = new Map((carreras as CarreraRow[]).map((c) => [c.id, c]));

  for (const [gid, gm] of gmPorId) {
    const materia = materiaPorId.get(gm.materia_id);
    const grupo = grupoPorId.get(gm.grupo_id);
    if (!materia || !grupo) continue;
    const periodo = periodoPorId.get(grupo.periodo_id);
    if (!periodo) continue;
    mapa.set(gid, {
      grupoMateria: gm,
      materia,
      grupo,
      periodo,
      carrera: grupo.carrera_id ? (carreraPorId.get(grupo.carrera_id) ?? null) : null,
    });
  }
  return mapa;
}

/* ---------------------------------------------------------------------------
 * ASIGNACIONES DE PROFESOR
 * ------------------------------------------------------------------------- */

/**
 * Asignaciones activas de un profesor, con oferta resuelta.
 *
 * CONTRATO LEGACY (compatibilidad temporal): resuelve por `profesor_clave`
 * (PROFESORES.CLAVE). CLAVE es AMBIGUA (4321 ×15, 8080 ×3) y NO es identidad
 * estructural. No usar para autorización nueva. La fuente de autorización
 * futura es `resolverAsignacionesProfesorPorId` (PROFESORES.ID).
 */
export async function resolverAsignacionesProfesor(
  supabase: SupabaseClient,
  profesorClave: string,
): Promise<AsignacionProfesorResuelta[]> {
  const clave = normClave(profesorClave);
  if (!clave) return [];

  const { data: asignaciones, error: e1 } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("*")
    .eq("profesor_clave", clave)
    .eq("activo", true);
  if (e1 || !asignaciones?.length) return [];

  return resolverAsignacionesCore(supabase, asignaciones as AsignacionProfesorRow[]);
}

/**
 * C4.11 — Resolución por identidad ESTRUCTURAL:
 *
 *   sesion.profesorId (PROFESORES.ID)
 *     → asignaciones_profesor.profesor_id
 *     → grupo_materias
 *
 * NUNCA resuelve por CLAVE ni NOMBRE. Devuelve [] si el profesor no tiene
 * asignaciones activas, si el id es inválido o si la columna/RLS no permite
 * leer (no lanza). Con `asignaciones_profesor = 0` devuelve [] (el fallback
 * `FALLBACK_TODAS_LAS_MATERIAS` permanece activo en la capa de acciones).
 */
export async function resolverAsignacionesProfesorPorId(
  supabase: SupabaseClient,
  profesorId: number,
): Promise<AsignacionProfesorResuelta[]> {
  const id = Number(profesorId);
  if (!Number.isInteger(id) || id <= 0) return [];

  const { data: asignaciones, error: e1 } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("*")
    .eq("profesor_id", id)
    .eq("activo", true);
  if (e1 || !asignaciones?.length) return [];

  return resolverAsignacionesCore(supabase, asignaciones as AsignacionProfesorRow[]);
}

/**
 * Núcleo compartido de resolución: a partir de filas de asignaciones ya
 * filtradas (por clave legacy o por profesor_id), resuelve la oferta completa.
 */
async function resolverAsignacionesCore(
  supabase: SupabaseClient,
  filasAsig: AsignacionProfesorRow[],
): Promise<AsignacionProfesorResuelta[]> {
  const gmIds = [...new Set(filasAsig.map((a) => a.grupo_materia_id))];

  const { data: gms, error: e2 } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("*")
    .in("id", gmIds)
    .eq("activo", true);
  if (e2 || !gms?.length) return [];

  const gmPorId = new Map((gms as GrupoMateriaRow[]).map((g) => [g.id, g]));
  const grupoIds = [...new Set([...gmPorId.values()].map((g) => g.grupo_id))];
  const materiaIds = [...new Set([...gmPorId.values()].map((g) => g.materia_id))];

  const [{ data: grupos, error: e3 }, { data: materias, error: e4 }] =
    await Promise.all([
      supabase.from(TABLA_GRUPOS).select("*").in("id", grupoIds).eq("activo", true),
      supabase.from(TABLA_MATERIAS).select("*").in("id", materiaIds).eq("activo", true),
    ]);
  if (e3 || !grupos || e4 || !materias) return [];

  const grupoPorId = new Map((grupos as GrupoRow[]).map((g) => [g.id, g]));
  const materiaPorId = new Map((materias as MateriaRow[]).map((m) => [m.id, m]));

  const periodoIds = [...new Set([...grupoPorId.values()].map((g) => g.periodo_id))];
  const carreraIds = [
    ...new Set(
      [...grupoPorId.values()]
        .map((g) => g.carrera_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  const [{ data: periodos, error: e5 }, { data: carreras, error: e6 }] =
    await Promise.all([
      supabase.from(TABLA_PERIODOS).select("*").in("id", periodoIds).eq("activo", true),
      carreraIds.length
        ? supabase.from(TABLA_CARRERAS).select("*").in("id", carreraIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (e5 || !periodos || e6 || !carreras) return [];

  const periodoPorId = new Map((periodos as PeriodoRow[]).map((p) => [p.id, p]));
  const carreraPorId = new Map((carreras as CarreraRow[]).map((c) => [c.id, c]));

  const out: AsignacionProfesorResuelta[] = [];
  for (const asig of filasAsig) {
    const gm = gmPorId.get(asig.grupo_materia_id);
    if (!gm) continue;
    const grupo = grupoPorId.get(gm.grupo_id);
    const materia = materiaPorId.get(gm.materia_id);
    const periodo = grupo ? periodoPorId.get(grupo.periodo_id) : undefined;
    if (!grupo || !materia || !periodo) continue;
    out.push({
      asignacion: asig,
      grupoMateria: gm,
      grupo,
      periodo,
      carrera: grupo.carrera_id ? (carreraPorId.get(grupo.carrera_id) ?? null) : null,
      materia,
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * VALIDACIÓN DE ACCESO
 * ------------------------------------------------------------------------- */

/** ¿El alumno pertenece (inscripción activa) a un grupo_materia VIGENTE? */
export async function validarAccesoAlumno(
  supabase: SupabaseClient,
  curp: string,
  grupoMateriaId: string,
): Promise<boolean> {
  const resuelto = await resolverGrupoMateria(supabase, grupoMateriaId);
  if (!resuelto) return false;
  const inscripcion = await obtenerInscripcionActiva(supabase, curp);
  return inscripcion?.grupo_id === resuelto.grupoMateria.grupo_id;
}

/**
 * FASE 7 (6A-4) — Validación LIGERA de acceso de un alumno a una materia por
 * `tabla_legacy` (nombre físico de la tabla).
 *
 * Equivale, con MENOS consultas, a la cadena anterior que ejecutaba
 * `actionObtenerVistaMateria`:
 *   resolverGrupoAlumno (inscripción + grupo + periodo) + semestre +
 *   resolverMateriasAlumno (grupo + grupo_materias + materias) +
 *   validarAccesoAlumno (grupo_materia + materia + grupo + inscripción)
 *   ≈ 15 requests, con inscripción/grupo resueltos hasta 3 veces.
 *
 * Verifica EXACTAMENTE las mismas reglas de acceso (6 consultas):
 *   1) existe la inscripción ACTIVA del alumno;
 *   2) existe grupo_materias ACTIVO del grupo de esa inscripción con
 *      `tabla_legacy` == tabla solicitada;
 *   3) el GRUPO está activo (y aporta periodo_id + grado);
 *   4) el PERIODO del grupo está activo;
 *   5) el SEMESTRE del grado está activo (si el grado mapea a semestre);
 *   6) la MATERIA (catálogo) referenciada está activa.
 *
 * NO cambia identidad ni semántica de búsqueda: la localización del alumno
 * dentro de la tabla de materia sigue usando CURP primero y nombre después
 * (buscar-en-filas). Esta función solo reduce el trabajo de AUTORIZACIÓN.
 */
export async function verificarAccesoAlumnoMateria(
  supabase: SupabaseClient,
  curp: string,
  nombreTablaMateria: string,
): Promise<boolean> {
  const tabla = nombreTablaMateria.trim();
  if (!tabla) return false;

  // 1) Inscripción ACTIVA (misma semántica que obtenerInscripcionActiva).
  const inscripcion = await obtenerInscripcionActiva(supabase, curp);
  if (!inscripcion) return false;

  // 2) grupo_materias ACTIVO del grupo de la inscripción con esa tabla_legacy.
  //    (Se filtra por grupo_id desde el principio, igual que la resolución
  //    anterior lo hacía por el grupo del alumno.)
  const { data: gms, error: eGm } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("id, grupo_id, materia_id")
    .eq("grupo_id", inscripcion.grupo_id)
    .eq("tabla_legacy", tabla)
    .eq("activo", true)
    .limit(1);
  const gm = (gms ?? [])[0];
  if (eGm || !gm) return false;

  // 3) El GRUPO debe estar ACTIVO (aporta periodo_id + grado para el semestre).
  const { data: grupo, error: eGr } = await supabase
    .from(TABLA_GRUPOS)
    .select("id, periodo_id, grado, activo")
    .eq("id", gm.grupo_id)
    .eq("activo", true)
    .maybeSingle();
  if (eGr || !grupo) return false;

  // 4) El PERIODO del grupo debe estar ACTIVO.
  const { data: periodo, error: eP } = await supabase
    .from(TABLA_PERIODOS)
    .select("id, activo")
    .eq("id", grupo.periodo_id)
    .eq("activo", true)
    .maybeSingle();
  if (eP || !periodo) return false;

  // 5) SEMESTRE activo (estructura ausente ⇒ true, mismo criterio que hoy).
  const semestre = gradoASemestre(grupo.grado);
  if (semestre !== null && !(await semestreActivoDeGrupo(supabase, grupo))) {
    return false;
  }

  // 6) La MATERIA (catálogo) referenciada debe estar ACTIVA.
  const { data: materia, error: eM } = await supabase
    .from(TABLA_MATERIAS)
    .select("id, activo")
    .eq("id", gm.materia_id)
    .eq("activo", true)
    .maybeSingle();
  if (eM || !materia) return false;

  return true;
}

/**
 * ¿El profesor tiene una asignación ACTIVA para un grupo_materia VIGENTE?
 * Rechaza si la asignación, el grupo_materia, el grupo o la materia están
 * inactivos (resuelto se apoya en `resolverGrupoMateria`, que filtra activo).
 */
export async function validarAccesoProfesor(
  supabase: SupabaseClient,
  profesorClave: string,
  grupoMateriaId: string,
): Promise<boolean> {
  const clave = normClave(profesorClave);
  if (!clave) return false;
  const resuelto = await resolverGrupoMateria(supabase, grupoMateriaId);
  if (!resuelto) return false;
  const { data, error } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("id")
    .eq("grupo_materia_id", resuelto.grupoMateria.id)
    .eq("profesor_clave", clave)
    .eq("activo", true)
    .maybeSingle();
  return !error && Boolean(data);
}

/* ---------------------------------------------------------------------------
 * CO-DOCENCIA (G4)
 * La BD permite varios profesores ACTIVOS para el mismo `grupo_materia`
 * porque la unicidad es UNIQUE(grupo_materia_id, profesor_clave), que no
 * impide múltiples filas activas. El ALTA de un co-docente será un UPSERT
 * adicional (aún no implementado); `cambiarProfesor` NO es la operación para
 * co-docencia: es ROTACIÓN.
 * ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * CAMBIO DE PROFESOR (rotación) — solo cambia la asignación.
 * ------------------------------------------------------------------------- */

/**
 * ROTACIÓN (G4): desactiva la asignación vigente anterior (activo=false,
 * `hasta`=ahora), crea o reactiva la del nuevo profesor (activo=true, `desde`).
 * NO modifica grupo, materia, grupo_materias, tabla_legacy ni calificaciones.
 */
export async function cambiarProfesor(
  supabase: SupabaseClient,
  grupoMateriaId: string,
  nuevoProfesorClave: string,
  desde?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gmId = grupoMateriaId.trim();
  const clave = normClave(nuevoProfesorClave);
  if (!gmId || !clave) {
    return { ok: false, error: "Grupo-materia y profesor son obligatorios." };
  }

  const existe = await resolverGrupoMateria(supabase, gmId);
  if (!existe) return { ok: false, error: "El grupo-materia no existe." };

  // Desactivar las asignaciones vigentes del grupo (excepto la del nuevo).
  const { data: actuales } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("id, profesor_clave, activo")
    .eq("grupo_materia_id", gmId)
    .eq("activo", true);
  for (const a of (actuales ?? []) as Array<{ id: string; profesor_clave: string }>) {
    if (a.profesor_clave === clave) continue;
    const { error: up } = await supabase
      .from(TABLA_ASIGNACIONES_PROFESOR)
      .update({ activo: false, hasta: new Date().toISOString() })
      .eq("id", a.id);
    if (up) return { ok: false, error: up.message };
  }

  // Crear o re-activar la asignación del nuevo profesor.
  const { error } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .upsert(
      {
        grupo_materia_id: gmId,
        profesor_clave: clave,
        activo: true,
        desde: desde ?? new Date().toISOString(),
        hasta: null,
      },
      { onConflict: "grupo_materia_id,profesor_clave" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
