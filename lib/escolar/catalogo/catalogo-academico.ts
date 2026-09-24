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
import { gradoASemestre, semestreActivoDeGrupo, semestresInactivos } from "../ciclo/semestres.ts";
import {
  TABLA_ASIGNACIONES_PROFESOR,
  TABLA_CARRERAS,
  TABLA_GRUPO_MATERIAS,
  TABLA_GRUPOS,
  TABLA_MATERIAS,
  TABLA_PERIODOS,
} from "../tables.ts";
import {
  normClave,
  obtenerInscripcionActiva,
  resolverGrupoMateria,
  resolverIdentidadesCatalogo,
  type AsignacionProfesorResuelta,
  type AsignacionProfesorRow,
  type CarreraRow,
  type GrupoMateriaRow,
  type GrupoRow,
  type MateriaRow,
  type PeriodoRow,
} from "./catalogo-academico-resolucion.ts";

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

/**
 * FASE 2 — ¿El profesor (por CLAVE) imparte en el grupo de la inscripción
 * ACTIVA del alumno?
 *
 * Fuente única académica: asignaciones_profesor → grupo_materias → grupos →
 * inscripciones_alumno. Se usa para autorizar la consulta del perfil de un
 * alumno por parte de un maestro (solo lectura). NO usa ETIQUETAS PERSONALES.
 */
export async function profesorTieneAccesoAlumno(
  supabase: SupabaseClient,
  profesorClave: string,
  curp: string,
): Promise<boolean> {
  const clave = normClave(profesorClave);
  const c = curp.trim().toUpperCase();
  if (!clave || !c) return false;

  const inscripcion = await obtenerInscripcionActiva(supabase, c);
  if (!inscripcion) return false;

  const { data: asignaciones, error: e1 } = await supabase
    .from(TABLA_ASIGNACIONES_PROFESOR)
    .select("grupo_materia_id")
    .eq("profesor_clave", clave)
    .eq("activo", true);
  if (e1 || !asignaciones?.length) return false;

  const gmIds = [
    ...new Set(
      (asignaciones as { grupo_materia_id: string }[]).map((a) => a.grupo_materia_id),
    ),
  ];
  const { data: gms, error: e2 } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("grupo_id")
    .in("id", gmIds);
  if (e2 || !gms?.length) return false;

  return (gms as { grupo_id: string }[]).some(
    (g) => g.grupo_id === inscripcion.grupo_id,
  );
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

/* ---------------------------------------------------------------------------
 * C4.18 — ¿PUEDE CARGARSE/ACTUALIZARSE ESTA MATERIA?
 * ------------------------------------------------------------------------- */

/**
 * C4.18 — ¿Por qué una materia NO debe cargarse/actualizarse? Devuelve el
 * motivo (materia desactivada en `grupo_materias`, o semestre inactivo) o null
 * si no hay impedimento.
 *
 * Antes vivía en `app/actions/escolar.ts`: decide sobre el CATÁLOGO, no sobre
 * la sesión, así que pertenece a esta capa.
 */
export async function motivoMateriaNoCargable(
  supabase: SupabaseClient,
  idInterno: string,
): Promise<string | null> {
  const id = idInterno.trim();
  if (!id) return null;
  const { data: gms } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("tabla_legacy, activo")
    .eq("tabla_legacy", id);
  if (gms && gms.length > 0 && gms.every((g) => g.activo === false)) {
    return "La materia está desactivada en el catálogo.";
  }
  // C4.28 — el semestre se resuelve desde el catálogo (grupo_materias →
  // grupos.grado). El nombre físico de la tabla NUNCA se parsea.
  const identidades = await resolverIdentidadesCatalogo(supabase, [id]);
  const identidad = identidades.get(id);
  if (identidad?.grado) {
    const sem = gradoASemestre(identidad.grado);
    if (sem !== null) {
      const inactivos = await semestresInactivos(supabase);
      if (inactivos.has(sem)) return "el semestre de esta materia está inactivo";
    }
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * C4.18 — VISIBILIDAD DE LAS TABLAS DE MATERIA EN EL CATÁLOGO
 * ------------------------------------------------------------------------- */

/**
 * Filtra las tablas de materias que deben ser VISIBLES/OPERATIVAS:
 *  - excluye las que tienen `grupo_materias.activo = false` (materia
 *    desactivada administrativamente);
 *  - excluye las de un SEMESTRE inactivo (academico_semestres). El grado se
 *    resuelve desde el catálogo (grupo_materias → grupos.grado); NUNCA se
 *    parsea el nombre físico de la tabla.
 * Si la estructura de semestres no existe, no filtra por semestre.
 * Las tablas legacy sin fila en grupo_materias se conservan (sin catálogo).
 *
 * Antes vivía en `app/actions/materias.ts`: es una lectura del catálogo.
 */
export async function filtrarTablasVisibles(
  supabase: SupabaseClient,
  tablas: readonly string[],
): Promise<string[]> {
  const [gmsRes, identidades] = await Promise.all([
    supabase.from(TABLA_GRUPO_MATERIAS).select("tabla_legacy, activo"),
    resolverIdentidadesCatalogo(supabase, tablas),
  ]);
  const inactivas = new Set(
    ((gmsRes.data ?? []) as Array<{ tabla_legacy: string | null; activo: boolean }>)
      .filter((g) => g.activo === false)
      .map((g) => g.tabla_legacy),
  );
  const semInactivos = await semestresInactivos(supabase);
  const out: string[] = [];
  for (const t of tablas) {
    if (inactivas.has(t)) continue;
    const identidad = identidades.get(t);
    const grado = identidad?.grado ?? null;
    if (grado) {
      const sem = gradoASemestre(grado);
      if (sem !== null && semInactivos.has(sem)) continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * Tablas legacy marcadas como desactivadas (`activo = false`) en
 * `grupo_materias`: son las materias OCULTAS que el panel de configuración
 * ofrece reactivar. Antes vivía en `app/actions/materias.ts`.
 */
export async function listarTablasLegacyOcultas(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("tabla_legacy, activo");
  return [
    ...new Set(
      ((data ?? []) as Array<{ tabla_legacy: string; activo: boolean }>)
        .filter((g) => g.activo === false)
        .map((g) => g.tabla_legacy),
    ),
  ];
}

/**
 * C4.18 — Activa/desactiva la visibilidad de una materia en el catálogo.
 *
 * Desactivar = UPDATE `grupo_materias.activo = false` para la tabla_legacy:
 *  - oculta la materia del panel de subir calificaciones y de la vista del
 *    alumno (que ya filtra grupo_materias activos);
 *  - NO borra materias, calificaciones, grupo_materias ni datos históricos.
 * Reactivar = activo = true (se restaura sin recrear nada).
 *
 * Antes vivía en `app/actions/materias.ts`.
 */
export async function cambiarVisibilidadMateria(
  supabase: SupabaseClient,
  idInterno: string,
  activo: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: filas, error: e0 } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("id")
    .eq("tabla_legacy", idInterno)
    .limit(1);
  if (e0) return { ok: false, error: e0.message };
  if (!filas?.length) {
    return {
      ok: false,
      error: "La materia no está asociada al catálogo; no se puede cambiar su visibilidad.",
    };
  }

  const { error } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .update({ activo })
    .eq("tabla_legacy", idInterno);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/* ---------------------------------------------------------------------------
 * PROMPT E · R-3 — este archivo tenía 1 186 líneas. Se partió por
 * responsabilidad; las partes se re-exportan aquí para que ningún import
 * existente se rompa (§10):
 *
 *   · ./catalogo-academico-resolucion.ts — tipos, normalización y resolución
 *     (inscripciones, identidad de materia y oferta grupo_materias).
 *
 * Lo que queda aquí es la ADMINISTRACIÓN del catálogo: acceso y atribución de
 * profesor, y visibilidad de las materias.
 * ------------------------------------------------------------------------- */

export * from "./catalogo-academico-resolucion.ts";
