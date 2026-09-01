/**
 * C2 — MIGRACIÓN/SEMILLA DEL CATÁLOGO ACADÉMICO + PREPARACIÓN DE INSCRIPCIONES
 *
 * Contenido:
 *   C2.1 planSemillaCatalogo / aplicarSemillaCatalogo  (semilla desde legacy)
 *   C2.2-C2.3 previsualizarInscripcionesDesdeEtiquetas (matching + preview, SIN escritura)
 *   C2.5 aplicarInscripcionesDesdeEtiquetas            (escritura preparada)
 *   C2.6 replicarPertenenciaEnEtiquetas                (réplica legacy UNIDIRECCIONAL)
 *
 * PRINCIPIOS CONGELADOS:
 *   - ETIQUETAS PERSONALES permanece intacta y es PERFIL PRIVADO. En C2 SOLO se
 *     LEEN GRADO/GRUPO/CARRERA para siembra/matching; nunca se convierten en
 *     fuente permanente del catálogo.
 *   - Catálogo autoritativo: periodos, carreras, materias, grupos, grupo_materias.
 *     Identidad del alumno: ALUMNOS. Profesor: PROFESORES.
 *   - NUNCA se usa el nombre de tabla legacy como identidad de materia: se
 *     interpreta con `materiaIdDesdeNombreTabla` (NUNCA parseGrupoDesdeNombreTabla,
 *     que pertenece a la lógica legacy de boleta y permanece intacto).
 *   - `tabla_legacy` es SOLO el puente físico al nombre exacto de la tabla.
 *   - La normalización (G2) es SOLO para matching; nunca modifica datos.
 *   - Las funciones de escritura NO se ejecutan por sí mismas: solo las invoca
 *     un llamador explícito (script/acción aprobada).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { claveDesdeCurp } from "./alumnos";
import { pareceCurp, normalizarCurp } from "./buscar-en-filas";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
  inscribirAlumno,
  type CarreraRow,
  type GrupoRow,
  type InscripcionRow,
  type PeriodoRow,
} from "./catalogo-academico";
import { carrerasDesdeTablas, materiaIdDesdeNombreTabla } from "./materia-identidad";
import { normalizarNombre } from "./nombres";
import {
  TABLA_ALUMNOS,
  TABLA_CARRERAS,
  TABLA_ETIQUETAS_PERSONALES,
  TABLA_GRUPO_MATERIAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_MATERIAS,
  TABLA_PERIODOS,
} from "./tables";

const TAMANO_PAGINA = 1000;

/* ===========================================================================
 * C2.1 — SEMILLA DEL CATÁLOGO (plan PURO + aplicación idempotente)
 * ========================================================================= */

export type MateriaSemilla = {
  /** Clave estable de la materia (derivada de la asignatura normalizada). */
  clave: string;
  /** Presentación: la asignatura tal como aparece en las tablas legacy. */
  nombre: string;
};

export type GrupoSemilla = {
  grado: string;
  grupo: string;
  carreraClave: string | null;
};

export type GrupoMateriaSemilla = {
  /** Nombre físico EXACTO de la tabla legacy (puente temporal). */
  tablaLegacy: string;
  grado: string;
  grupo: string;
  carreraClave: string | null;
  materiaClave: string;
};

export type PlanSemillaCatalogo = {
  periodoNombre: string;
  crearPeriodoSiFalta: boolean;
  tablasTotales: number;
  tablasSinMapear: string[];
  colisionesMateria: { clave: string; nombres: string[] }[];
  materias: MateriaSemilla[];
  carreras: string[];
  grupos: GrupoSemilla[];
  grupoMaterias: GrupoMateriaSemilla[];
};

/**
 * C2.1 — Plan de semilla a partir de la lista de nombres de tablas físicas
 * legacy. FUNCIÓN PURA (sin DB). Idempotente por diseño: los destinos
 * respetan UNIQUE / índices únicos parciales.
 */
export function planSemillaCatalogo(
  listaTablas: readonly string[],
  opts: { periodoNombre: string; crearPeriodoSiFalta?: boolean },
): PlanSemillaCatalogo {
  const carreras = carrerasDesdeTablas(listaTablas);
  const tablasSinMapear: string[] = [];
  const colisionesMateria = new Map<string, Set<string>>();
  const materias = new Map<string, MateriaSemilla>();
  const grupos = new Map<string, GrupoSemilla>();
  const grupoMaterias: GrupoMateriaSemilla[] = [];

  for (const t of listaTablas) {
    const identidad = materiaIdDesdeNombreTabla(t, carreras);
    if (!identidad || !identidad.asignatura) {
      tablasSinMapear.push(t);
      continue;
    }

    const clave = normalizarNombre(identidad.asignatura);
    if (!clave) {
      tablasSinMapear.push(t);
      continue;
    }

    // Materia (dedupe por clave; colisión si dos asignaturas → misma clave).
    const existente = materias.get(clave);
    if (existente) {
      if (existente.nombre !== identidad.asignatura) {
        const s = colisionesMateria.get(clave) ?? new Set<string>([existente.nombre]);
        s.add(identidad.asignatura);
        colisionesMateria.set(clave, s);
      }
    } else {
      materias.set(clave, { clave, nombre: identidad.asignatura });
    }

    const grado = normalizarGradoCatalogo(identidad.grado);
    const grupo = normalizarGrupoCatalogo(identidad.grupo);
    const carreraClave = identidad.carrera
      ? normalizarCarreraCatalogo(identidad.carrera)
      : null;

    const keyGrupo = `${grado}|${grupo}|${carreraClave ?? ""}`;
    if (!grupos.has(keyGrupo)) {
      grupos.set(keyGrupo, { grado, grupo, carreraClave });
    }

    grupoMaterias.push({ tablaLegacy: t, grado, grupo, carreraClave, materiaClave: clave });
  }

  return {
    periodoNombre: opts.periodoNombre.trim(),
    crearPeriodoSiFalta: opts.crearPeriodoSiFalta ?? false,
    tablasTotales: listaTablas.length,
    tablasSinMapear,
    colisionesMateria: [...colisionesMateria.entries()].map(([clave, nombres]) => ({
      clave,
      nombres: [...nombres],
    })),
    materias: [...materias.values()],
    carreras: [...carreras],
    grupos: [...grupos.values()],
    grupoMaterias,
  };
}

export type ResultadoSemillaCatalogo = {
  ok: boolean;
  error?: string;
  plan: PlanSemillaCatalogo;
  carrerasCreadas: number;
  materiasCreadas: number;
  gruposCreados: number;
  grupoMateriasCreados: number;
  grupoMateriasSinCambio: number;
  grupoMateriasConflicto: { grupo: string; materia: string; tablaLegacy: string }[];
};

/**
 * C2.1 — Aplica la semilla al catálogo (IDEMPOTENTE).
 * NO se ejecuta en esta fase: es el mecanismo que se aprobará explícitamente.
 */
export async function aplicarSemillaCatalogo(
  supabase: SupabaseClient,
  listaTablas: readonly string[],
  opts: { periodoNombre: string; crearPeriodoSiFalta?: boolean },
): Promise<ResultadoSemillaCatalogo> {
  const plan = planSemillaCatalogo(listaTablas, opts);
  const base: ResultadoSemillaCatalogo = {
    ok: true,
    plan,
    carrerasCreadas: 0,
    materiasCreadas: 0,
    gruposCreados: 0,
    grupoMateriasCreados: 0,
    grupoMateriasSinCambio: 0,
    grupoMateriasConflicto: [],
  };

  // 1) Periodo.
  const { data: periodoRow } = await supabase
    .from(TABLA_PERIODOS)
    .select("id")
    .eq("nombre", plan.periodoNombre)
    .maybeSingle();
  let periodoId: string;
  if (periodoRow) {
    periodoId = periodoRow.id;
  } else if (plan.crearPeriodoSiFalta) {
    const { data, error } = await supabase
      .from(TABLA_PERIODOS)
      .insert({ nombre: plan.periodoNombre, activo: true })
      .select("id")
      .single();
    if (error || !data) {
      return { ...base, ok: false, error: `Periodo: ${error?.message ?? "sin id"}` };
    }
    periodoId = data.id;
  } else {
    return {
      ...base,
      ok: false,
      error: `El periodo «${plan.periodoNombre}» no existe y crearPeriodoSiFalta=false.`,
    };
  }

  // 2) Carreras (dedupe por clave).
  const carreraIdPorClave = new Map<string, string>();
  for (const clave of plan.carreras) {
    const { data: c } = await supabase
      .from(TABLA_CARRERAS)
      .select("id")
      .eq("clave", clave)
      .maybeSingle();
    if (c) {
      carreraIdPorClave.set(clave, c.id);
      continue;
    }
    const { data, error } = await supabase
      .from(TABLA_CARRERAS)
      .insert({ clave, nombre: clave, activo: true })
      .select("id")
      .single();
    if (error || !data) {
      return { ...base, ok: false, error: `Carrera ${clave}: ${error?.message ?? ""}` };
    }
    carreraIdPorClave.set(clave, data.id);
    base.carrerasCreadas++;
  }

  // 3) Materias (dedupe por clave).
  const materiaIdPorClave = new Map<string, string>();
  for (const m of plan.materias) {
    const { data: x } = await supabase
      .from(TABLA_MATERIAS)
      .select("id")
      .eq("clave", m.clave)
      .maybeSingle();
    if (x) {
      materiaIdPorClave.set(m.clave, x.id);
      continue;
    }
    const { data, error } = await supabase
      .from(TABLA_MATERIAS)
      .insert({ clave: m.clave, nombre: m.nombre, activo: true })
      .select("id")
      .single();
    if (error || !data) {
      return { ...base, ok: false, error: `Materia ${m.clave}: ${error?.message ?? ""}` };
    }
    materiaIdPorClave.set(m.clave, data.id);
    base.materiasCreadas++;
  }

  // 4) Grupos (dedupe por identidad: periodo, grado, nombre, carrera NULL/no NULL).
  const grupoIdPorIdentidad = new Map<string, string>();
  for (const g of plan.grupos) {
    const carreraId = g.carreraClave ? carreraIdPorClave.get(g.carreraClave) : null;
    const baseQuery = supabase
      .from(TABLA_GRUPOS)
      .select("id")
      .eq("periodo_id", periodoId)
      .eq("grado", g.grado)
      .eq("nombre", g.grupo);
    const { data: existente } = carreraId
      ? await baseQuery.eq("carrera_id", carreraId).maybeSingle()
      : await baseQuery.is("carrera_id", null).maybeSingle();
    if (existente) {
      grupoIdPorIdentidad.set(`${g.grado}|${g.grupo}|${g.carreraClave ?? ""}`, existente.id);
      continue;
    }
    const { data, error } = await supabase
      .from(TABLA_GRUPOS)
      .insert({
        periodo_id: periodoId,
        grado: g.grado,
        nombre: g.grupo,
        carrera_id: carreraId,
        activo: true,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ...base, ok: false, error: `Grupo ${g.grado} ${g.grupo}: ${error?.message ?? ""}` };
    }
    grupoIdPorIdentidad.set(`${g.grado}|${g.grupo}|${g.carreraClave ?? ""}`, data.id);
    base.gruposCreados++;
  }

  // 5) grupo_materias (UNIQUE grupo_id+materia_id; tabla_legacy = puente físico).
  for (const gm of plan.grupoMaterias) {
    const grupoId = grupoIdPorIdentidad.get(`${gm.grado}|${gm.grupo}|${gm.carreraClave ?? ""}`);
    const materiaId = materiaIdPorClave.get(gm.materiaClave);
    if (!grupoId || !materiaId) {
      return {
        ...base,
        ok: false,
        error: `Sin referencias para ${gm.tablaLegacy} (grupo/materia no creados).`,
      };
    }
    const { data: existente } = await supabase
      .from(TABLA_GRUPO_MATERIAS)
      .select("id, tabla_legacy")
      .eq("grupo_id", grupoId)
      .eq("materia_id", materiaId)
      .maybeSingle();
    if (existente) {
      const actual = String(existente.tabla_legacy ?? "").trim();
      if (actual && actual !== gm.tablaLegacy) {
        base.grupoMateriasConflicto.push({
          grupo: `${gm.grado} ${gm.grupo}`,
          materia: gm.materiaClave,
          tablaLegacy: gm.tablaLegacy,
        });
        continue;
      }
      if (!actual) {
        const { error } = await supabase
          .from(TABLA_GRUPO_MATERIAS)
          .update({ tabla_legacy: gm.tablaLegacy })
          .eq("id", existente.id);
        if (error) return { ...base, ok: false, error: `tabla_legacy ${gm.tablaLegacy}: ${error.message}` };
        continue;
      }
      base.grupoMateriasSinCambio++;
      continue;
    }
    const { error } = await supabase.from(TABLA_GRUPO_MATERIAS).insert({
      grupo_id: grupoId,
      materia_id: materiaId,
      tabla_legacy: gm.tablaLegacy,
      activo: true,
    });
    if (error) return { ...base, ok: false, error: `${gm.tablaLegacy}: ${error.message}` };
    base.grupoMateriasCreados++;
  }

  return base;
}

/* ===========================================================================
 * C2.2–C2.3 — MATCHING ETIQUETAS → GRUPOS + PREVISUALIZACIÓN (SIN escritura)
 * ========================================================================= */

export type ResultadoMatch = "match" | "sin_match" | "ambiguo" | "sin_curp" | "duplicado";

export type DetalleInscripcionPreview = {
  curp: string;
  gradoOriginal: string;
  grupoOriginal: string;
  carreraOriginal: string;
  gradoNormalizado: string;
  grupoNormalizado: string;
  carreraNormalizada: string;
  resultado: ResultadoMatch;
  yaExisteInscripcion: boolean;
  esAlumnoExistente: boolean;
  grupoId?: string;
  candidatos: { grupoId: string; grado: string; grupo: string; carrera: string | null }[];
};

export type PreviewInscripciones = {
  periodoSeleccionado: string | null;
  periodoInexistente: boolean;
  totalRegistros: number;
  conCurpValida: number;
  sinCurp: number;
  curpsDuplicadas: string[];
  alumnosExistentes: number;
  alumnosPorCrear: number;
  matches: number;
  gruposInexistentes: number;
  matchesAmbiguos: number;
  inscripcionesYaExistentes: number;
  listosParaInsertar: number;
  detalle: DetalleInscripcionPreview[];
};

type FilaEtiquetaPertenencia = {
  curp: string;
  grado: string;
  grupo: string;
  carrera: string;
};

/**
 * @deprecated Legacy de migración (C2): lee GRADO/GRUPO/CARRERA desde
 * ETIQUETAS PERSONALES para sembrar el catálogo. La identidad académica ya se
 * resuelve desde inscripciones_alumno (filosofia.estructural §5). Se conserva
 * solo como utilidad histórica de una migración única.
 * Lectura SOLO de GRADO/GRUPO/CARRERA de ETIQUETAS PERSONALES (paginada).
 */
async function leerEtiquetasPertenencia(
  supabase: SupabaseClient,
): Promise<FilaEtiquetaPertenencia[]> {
  const filas: FilaEtiquetaPertenencia[] = [];
  let desde = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_ETIQUETAS_PERSONALES)
      .select("CURP, GRADO, GRUPO, CARRERA")
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ CURP?: string | null; GRADO?: string | null; GRUPO?: string | null; CARRERA?: string | null }>) {
      filas.push({
        curp: String(r.CURP ?? "").trim(),
        grado: String(r.GRADO ?? "").trim(),
        grupo: String(r.GRUPO ?? "").trim(),
        carrera: String(r.CARRERA ?? "").trim(),
      });
    }
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return filas;
}

/** CURPs de ALUMNOS (solo lectura, paginada). No arrastra csv/xlsx. */
async function cargarCurpsAlumnos(supabase: SupabaseClient): Promise<Set<string>> {
  const curps = new Set<string>();
  let desde = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_ALUMNOS)
      .select("CURP")
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ CURP: string }>) {
      const c = String(r.CURP ?? "").trim().toUpperCase();
      if (c) curps.add(c);
    }
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return curps;
}

/** Inscripciones ACTIVAS existentes (curp|grupo_id), paginadas. */
async function cargarInscripcionesActivas(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const set = new Set<string>();
  let desde = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_INSCRIPCIONES_ALUMNO)
      .select("curp, grupo_id")
      .eq("activo", true)
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ curp: string; grupo_id: string }>) {
      set.add(`${String(r.curp ?? "").trim().toUpperCase()}|${r.grupo_id}`);
    }
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return set;
}

/**
 * C2.2–C2.3 — Previsualización COMPLETA de inscripciones desde ETIQUETAS
 * PERSONALES (solo SELECT; NO escribe). Matching inequívoco: candidato único
 * → match; cero → sin_match; más de uno → ambiguo. Sin inferencias heurísticas.
 */
export async function previsualizarInscripcionesDesdeEtiquetas(
  supabase: SupabaseClient,
  opts?: { periodoNombre?: string },
): Promise<PreviewInscripciones> {
  const vacia: PreviewInscripciones = {
    periodoSeleccionado: opts?.periodoNombre?.trim() ?? null,
    periodoInexistente: false,
    totalRegistros: 0,
    conCurpValida: 0,
    sinCurp: 0,
    curpsDuplicadas: [],
    alumnosExistentes: 0,
    alumnosPorCrear: 0,
    matches: 0,
    gruposInexistentes: 0,
    matchesAmbiguos: 0,
    inscripcionesYaExistentes: 0,
    listosParaInsertar: 0,
    detalle: [],
  };

  // 1) Periodo operativo (activo). Si no se indica, el más reciente activo.
  let periodo: PeriodoRow | null = null;
  if (opts?.periodoNombre?.trim()) {
    const { data, error } = await supabase
      .from(TABLA_PERIODOS)
      .select("*")
      .eq("nombre", opts.periodoNombre.trim())
      .eq("activo", true)
      .maybeSingle();
    if (!error && data) periodo = data as PeriodoRow;
  } else {
    const { data, error } = await supabase
      .from(TABLA_PERIODOS)
      .select("*")
      .eq("activo", true)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!error && data?.length) periodo = data[0] as PeriodoRow;
  }
  if (!periodo) return { ...vacia, periodoInexistente: true };

  // 2) Grupos vigentes del periodo + claves de carrera.
  const { data: gruposData, error: eG } = await supabase
    .from(TABLA_GRUPOS)
    .select("*")
    .eq("periodo_id", periodo.id)
    .eq("activo", true);
  if (eG || !gruposData) return { ...vacia, periodoInexistente: true };
  const grupos = gruposData as GrupoRow[];

  const carreraIds = [
    ...new Set(grupos.map((g) => g.carrera_id).filter((x): x is string => Boolean(x))),
  ];
  const claveCarreraPorId = new Map<string, string>();
  if (carreraIds.length) {
    const { data: carrerasData } = await supabase
      .from(TABLA_CARRERAS)
      .select("*")
      .in("id", carreraIds);
    for (const c of (carrerasData ?? []) as CarreraRow[]) {
      claveCarreraPorId.set(c.id, normalizarCarreraCatalogo(c.clave));
    }
  }

  // Índice de candidatos por identidad normalizada.
  const porIdentidad = new Map<string, GrupoRow[]>();
  for (const g of grupos) {
    const key = `${normalizarGradoCatalogo(g.grado)}|${normalizarGrupoCatalogo(g.nombre)}|${
      g.carrera_id ? (claveCarreraPorId.get(g.carrera_id) ?? "") : ""
    }`;
    const arr = porIdentidad.get(key) ?? [];
    arr.push(g);
    porIdentidad.set(key, arr);
  }

  // 3) Alumnos existentes e inscripciones activas (solo lectura).
  const [curpsAlumnos, inscripcionesActivas] = await Promise.all([
    cargarCurpsAlumnos(supabase),
    cargarInscripcionesActivas(supabase),
  ]);

  // 4) Registros de ETIQUETAS PERSONALES.
  const etiquetas = await leerEtiquetasPertenencia(supabase);
  const resultado: PreviewInscripciones = { ...vacia, periodoSeleccionado: periodo.nombre };
  const vistos = new Set<string>();

  for (const e of etiquetas) {
    const curp = normalizarCurp(e.curp);
    const base = {
      curp,
      gradoOriginal: e.grado,
      grupoOriginal: e.grupo,
      carreraOriginal: e.carrera,
      gradoNormalizado: normalizarGradoCatalogo(e.grado),
      grupoNormalizado: normalizarGrupoCatalogo(e.grupo),
      carreraNormalizada: normalizarCarreraCatalogo(e.carrera),
    };

    resultado.totalRegistros++;

    if (!curp || !pareceCurp(curp)) {
      resultado.sinCurp++;
      resultado.detalle.push({ ...base, resultado: "sin_curp", yaExisteInscripcion: false, esAlumnoExistente: false, candidatos: [] });
      continue;
    }
    if (vistos.has(curp)) {
      resultado.curpsDuplicadas.push(curp);
      resultado.detalle.push({ ...base, resultado: "duplicado", yaExisteInscripcion: false, esAlumnoExistente: curpsAlumnos.has(curp), candidatos: [] });
      continue;
    }
    vistos.add(curp);
    resultado.conCurpValida++;

    const esAlumnoExistente = curpsAlumnos.has(curp);
    if (esAlumnoExistente) resultado.alumnosExistentes++;
    else resultado.alumnosPorCrear++;

    const key = `${base.gradoNormalizado}|${base.grupoNormalizado}|${base.carreraNormalizada}`;
    const candidatos = porIdentidad.get(key) ?? [];
    const mapaCandidatos = candidatos.map((c) => ({
      grupoId: c.id,
      grado: c.grado,
      grupo: c.nombre,
      carrera: c.carrera_id ? (claveCarreraPorId.get(c.carrera_id) ?? null) : null,
    }));

    if (candidatos.length === 0) {
      resultado.gruposInexistentes++;
      resultado.detalle.push({ ...base, resultado: "sin_match", yaExisteInscripcion: false, esAlumnoExistente, candidatos: [] });
      continue;
    }
    if (candidatos.length > 1) {
      resultado.matchesAmbiguos++;
      resultado.detalle.push({ ...base, resultado: "ambiguo", yaExisteInscripcion: false, esAlumnoExistente, candidatos: mapaCandidatos });
      continue;
    }

    const grupoId = candidatos[0]!.id;
    const yaExiste = inscripcionesActivas.has(`${curp}|${grupoId}`);
    resultado.matches++;
    if (yaExiste) resultado.inscripcionesYaExistentes++;
    else resultado.listosParaInsertar++;
    resultado.detalle.push({
      ...base,
      resultado: "match",
      yaExisteInscripcion: yaExiste,
      esAlumnoExistente,
      grupoId,
      candidatos: mapaCandidatos,
    });
  }

  return resultado;
}

/* ===========================================================================
 * C2.5 — APLICACIÓN DE INSCRIPCIONES (preparada; NO se ejecuta en esta fase)
 * ========================================================================= */

/**
 * C2.4 — Asegura la IDENTIDAD del alumno en ALUMNOS.
 * - CURP es la identidad; nunca se modifica.
 * - CLAVE se deriva con `claveDesdeCurp` SOLO al crear; nunca se sobrescribe.
 * - Si el alumno ya existe, no se toca nada.
 */
export async function asegurarIdentidadAlumno(
  supabase: SupabaseClient,
  curp: string,
): Promise<{ ok: true; creado: boolean } | { ok: false; error: string }> {
  const c = normalizarCurp(curp);
  if (!c || !pareceCurp(c)) return { ok: false, error: "CURP inválida." };
  const { data } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP")
    .eq("CURP", c)
    .maybeSingle();
  if (data) return { ok: true, creado: false };
  const { error } = await supabase.from(TABLA_ALUMNOS).insert({
    CURP: c,
    CLAVE: claveDesdeCurp(c),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, creado: true };
}

/**
 * C2.5 — Aplica las inscripciones con match inequívoco de una preview.
 * Idempotente vía UNIQUE(curp, grupo_id). Si el alumno no existe en ALUMNOS,
 * crea su identidad (CURP + CLAVE derivada) antes de inscribir. `unaActiva`
 * desactiva otras inscripciones activas del alumno (regla de negocio en la capa).
 */
export async function aplicarInscripcionesDesdeEtiquetas(
  supabase: SupabaseClient,
  preview: PreviewInscripciones,
  opts?: { unaActiva?: boolean },
): Promise<
  | { ok: true; insertadas: number; yaExistentes: number; alumnosCreados: number }
  | { ok: false; error: string }
> {
  let insertadas = 0;
  let yaExistentes = 0;
  let alumnosCreados = 0;
  for (const d of preview.detalle) {
    if (d.resultado !== "match" || !d.grupoId) continue;
    if (d.yaExisteInscripcion) {
      yaExistentes++;
      continue;
    }
    if (!d.esAlumnoExistente) {
      const identidad = await asegurarIdentidadAlumno(supabase, d.curp);
      if (!identidad.ok) return { ok: false, error: `${d.curp}: ${identidad.error}` };
      if (identidad.creado) alumnosCreados++;
    }
    const r = await inscribirAlumno(supabase, d.curp, d.grupoId, { unaActiva: opts?.unaActiva });
    if (!r.ok) return { ok: false, error: `${d.curp}: ${r.error}` };
    insertadas++;
  }
  return { ok: true, insertadas, yaExistentes, alumnosCreados };
}

/* ===========================================================================
 * C2.6 — RÉPLICA LEGACY (diseño/documentación; NO se invoca en C2)
 *
 * Dirección ÚNICA: inscripciones_alumno → ETIQUETAS PERSONALES.GRADO/GRUPO/
 * CARRERA. Solo como réplica de compatibilidad durante la transición. NUNCA:
 * ETIQUETAS → catálogo como sincronización permanente.
 * ========================================================================= */

/**
 * @deprecated Legacy (C2.6): réplica unidireccional de pertenencia hacia
 * ETIQUETAS PERSONALES (GRADO/GRUPO/CARRERA). La identidad académica ya no debe
 * escribirse en ETIQUETAS PERSONALES: la fuente es inscripciones_alumno
 * (filosofia.estructural §5). Se conserva solo por compatibilidad histórica.
 *
 * C2.6 — Réplica unidireccional de pertenencia hacia ETIQUETAS PERSONALES.
 * Preparada para la futura carga masiva operativa; NO se llama en C2.
 */
export async function replicarPertenenciaEnEtiquetas(
  supabase: SupabaseClient,
  curp: string,
  pertenencia: { grado: string; grupo: string; carrera: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = normalizarCurp(curp);
  if (!c) return { ok: false, error: "CURP inválida." };
  const { error } = await supabase
    .from(TABLA_ETIQUETAS_PERSONALES)
    .update({
      GRADO: pertenencia.grado,
      GRUPO: pertenencia.grupo,
      CARRERA: pertenencia.carrera,
    })
    .eq("CURP", c);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}




