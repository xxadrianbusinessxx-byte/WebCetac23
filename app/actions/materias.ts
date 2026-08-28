"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  esMapeoColumnasMateria,
  guardarMapeoColumnasMateria,
  obtenerMapeoColumnasMateria,
  resolverMapeoColumnasAFisico,
  validarMapeoColumnasMateria,
  type MapeoColumnasMateria,
} from "@/lib/escolar/mapeo-columnas-materia";
import { normalizarNombre } from "@/lib/escolar/nombres";
import {
  guardarNombreVisibleMateria,
  listarNombresVisiblesMaterias,
  materiasVisiblesDesdeCatalogo,
  validarNombreVisible,
  type MateriaConNombreVisible,
} from "@/lib/escolar/nombres-visibles";
import { listarMateriasCompletas } from "@/lib/escolar/tablas-supabase";
import {
  resolverAsignacionesProfesor,
  resolverAsignacionesProfesorPorId,
  resolverIdentidadesCatalogo,
  type AsignacionProfesorResuelta,
} from "@/lib/escolar/catalogo-academico";
import { TABLA_GRUPO_MATERIAS } from "@/lib/escolar/tables";
import {
  gradoASemestre,
  semestresInactivos,
} from "@/lib/escolar/semestres";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Filtra las tablas de materias que deben ser VISIBLES/OPERATIVAS:
 *  - excluye las que tienen `grupo_materias.activo = false` (materia
 *    desactivada administrativamente);
 *  - excluye las de un SEMESTRE inactivo (academico_semestres). El grado se
 *    resuelve desde el catálogo (grupo_materias → grupos.grado); NUNCA se
 *    parsea el nombre físico de la tabla.
 * Si la estructura de semestres no existe, no filtra por semestre.
 * Las tablas legacy sin fila en grupo_materias se conservan (sin catálogo).
 */
async function filtrarTablasVisibles(
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
 * Lista las materias del profesor.
 *
 * C4.6 — Fuente primaria: asignaciones_profesor → grupo_materia → materia
 *   (idInterno = tabla_legacy para compatibilidad de la UI existente).
 * FALLBACK_TODAS_LAS_MATERIAS: transitorio mientras `asignaciones_profesor`
 * esté vacía (hoy = 0). Identificado internamente; NUNCA debe convertirse en
 * autoridad permanente. Lectura: disponible para roles autenticados.
 */
export async function actionListarMateriasConNombreVisible(): Promise<
  MateriaConNombreVisible[]
> {
  const supabase = await createClient();
  const sesion = await obtenerSesionPortal();
  const aliases = await listarNombresVisiblesMaterias(supabase);

  if (sesion?.rol === "maestro") {
    // C4.10/C4.11 — identidad ESTRUCTURAL primero (PROFESORES.ID desde la
    // sesión server-side). `sesion.matricula` solo como compatibilidad
    // temporal para sesiones creadas antes de C4.10 (sin profesorId).
    let asignaciones: AsignacionProfesorResuelta[] = [];
    if (typeof sesion.profesorId === "number") {
      asignaciones = await resolverAsignacionesProfesorPorId(
        supabase,
        sesion.profesorId,
      );
    } else if (sesion.matricula) {
      asignaciones = await resolverAsignacionesProfesor(supabase, sesion.matricula);
    }
    if (asignaciones.length > 0) {
      const tablasLegacy = asignaciones
        .map((a) => a.grupoMateria.tabla_legacy)
        .filter((t): t is string => Boolean(t));
      if (tablasLegacy.length > 0) {
        // C4.18 — filtrar semestre inactivo y materias desactivadas.
        const visibles = await filtrarTablasVisibles(supabase, tablasLegacy);
        if (visibles.length > 0) {
          // C4.28 — identidad (grado/grupo/carrera/asignatura) desde el
          // catálogo; NUNCA desde el nombre físico de la tabla.
          const identidades = await resolverIdentidadesCatalogo(
            supabase,
            visibles,
          );
          // C4.28 — solo materias del catálogo académico: se descartan tablas
          // físicas sin fila en grupo_materias (no deben mostrar "General").
          return materiasVisiblesDesdeCatalogo(
            visibles,
            identidades,
            aliases,
          ).filter((m) => Boolean(m.grado));
        }
      }
    }
  }

  // FALLBACK_TODAS_LAS_MATERIAS (transitorio mientras asignaciones esté vacía).
  const tablas = await listarMateriasCompletas();
  // C4.18 — la desactivación de semestre / materia oculta la lista de
  // calificaciones (sin borrar nada).
  const visibles = await filtrarTablasVisibles(supabase, tablas);
  const identidades = await resolverIdentidadesCatalogo(supabase, visibles);
  // C4.28 — solo materias del catálogo académico (nunca tablas de sistema ni
  // huérfanas; no deben aparecer en el buscador de materias).
  return materiasVisiblesDesdeCatalogo(visibles, identidades, aliases).filter(
    (m) => Boolean(m.grado),
  );
}

/**
 * Guarda únicamente el NOMBRE VISIBLE de una materia.
 *
 * SEGURIDAD:
 *   - SOLO rol «directivo» puede guardar (validado desde la sesión del
 *     servidor, nunca desde el navegador).
 *   - El `actualizado_por` sale de `sesion.matricula` (nunca del cliente).
 *   - El `idInterno` enviado se re-resuelve contra la lista REAL de tablas de
 *     materias en el servidor. Si no existe, se rechaza.
 *   - No se renombran tablas ni se mueven calificaciones.
 */
export async function actionGuardarNombreVisibleMateria(
  idInterno: string,
  nombreVisible: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return {
      ok: false,
      error: "Solo los directivos pueden modificar nombres visibles.",
    };
  }

  const idBuscado = (idInterno ?? "").trim();
  if (!idBuscado) return { ok: false, error: "Materia no válida." };

  const errorVal = validarNombreVisible(nombreVisible ?? "");
  if (errorVal) return { ok: false, error: errorVal };

  // Resolver la materia REAL desde el servidor (nunca confiar en el texto
  // enviado por el navegador como clave de tabla).
  const tablas = await listarMateriasCompletas();
  const materiaReal = tablas.find(
    (t) => normalizarNombre(t) === normalizarNombre(idBuscado),
  );
  if (!materiaReal) {
    return { ok: false, error: "La materia no existe o no está permitida." };
  }

  const supabase = await createClient();
  return guardarNombreVisibleMateria(
    supabase,
    materiaReal,
    nombreVisible.trim(),
    sesion.matricula ?? "",
  );
}

/**
 * Lee la configuración de mapeo de columnas de una materia (o null).
 * Lectura disponible para roles autenticados (la config solo afecta
 * presentación).
 */
export async function actionObtenerMapeoColumnasMateria(
  idInterno: string,
): Promise<MapeoColumnasMateria | null> {
  const id = (idInterno ?? "").trim();
  if (!id) return null;
  const supabase = await createClient();
  return obtenerMapeoColumnasMateria(supabase, id);
}

/**
 * Guarda (UPSERT) la configuración de mapeo de columnas de una materia.
 *
 * SEGURIDAD:
 *   - SOLO rol «maestro» o «directivo» (validado desde la sesión del
 *     servidor, nunca desde el navegador).
 *   - El `actualizado_por` sale de `sesion.matricula`.
 *   - El `idInterno` enviado se re-resuelve contra la lista REAL de tablas
 *     de materias. Una «materia inventada» se rechaza.
 *   - El mapeo se valida contra los ENCABEZADOS REALES del archivo.
 *   - NO modifica la tabla de la materia ni la cadena de subida.
 */
export async function actionGuardarMapeoColumnasMateria(
  idInterno: string,
  mapeo: unknown,
  encabezados: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return {
      ok: false,
      error: "Solo profesores y directivos pueden configurar columnas.",
    };
  }

  const idBuscado = (idInterno ?? "").trim();
  if (!idBuscado) return { ok: false, error: "Materia no válida." };

  if (!esMapeoColumnasMateria(mapeo)) {
    return { ok: false, error: "El mapeo de columnas no es válido." };
  }
  if (
    !Array.isArray(encabezados) ||
    !encabezados.every((h) => typeof h === "string")
  ) {
    return { ok: false, error: "Los encabezados del archivo no son válidos." };
  }

  // Resolver la materia REAL desde el servidor (nunca confiar en el texto
  // enviado por el navegador como clave de tabla).
  const tablas = await listarMateriasCompletas();
  const materiaReal = tablas.find(
    (t) => normalizarNombre(t) === normalizarNombre(idBuscado),
  );
  if (!materiaReal) {
    return { ok: false, error: "La materia no existe o no está permitida." };
  }

  // BLOQUE 7C.1: resolver cada referencia al NOMBRE FÍSICO REAL del archivo.
  // Una variante normalizada (p. ej. "Calificación final" cuando el físico es
  // "CALIFICACION FINAL") se guarda SIEMPRE como el encabezado físico exacto.
  const resolucion = resolverMapeoColumnasAFisico(mapeo, encabezados);
  if (!resolucion.ok) {
    return { ok: false, error: resolucion.errores.join(" · ") };
  }
  const mapeoFisico = resolucion.mapeo;

  const validacion = validarMapeoColumnasMateria(mapeoFisico, encabezados);
  if (!validacion.ok) {
    return { ok: false, error: validacion.errores.join(" · ") };
  }

  const supabase = await createClient();
  return guardarMapeoColumnasMateria(
    supabase,
    materiaReal,
    mapeoFisico,
    sesion.matricula ?? "",
  );
}

/**
 * C4.18 — Lista TODAS las materias con alias + estado de visibilidad
 * (solo rol directivo). Usado por el panel de Configuración de materias
 * (nombres visibles) para poder reactivar materias ocultas.
 */
export async function actionListarMateriasConfiguracion(): Promise<
  | { ok: true; materias: MateriaConNombreVisible[]; ocultas: string[] }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "No autorizado: se requiere rol directivo." };
  }

  const supabase = await createClient();
  const [aliases, tablas, gms] = await Promise.all([
    listarNombresVisiblesMaterias(supabase),
    listarMateriasCompletas(),
    supabase.from(TABLA_GRUPO_MATERIAS).select("tabla_legacy, activo"),
  ]);
  // C4.28 — identidad desde el catálogo (grupo_materias → grupos/materias/
  // carreras); los nombres físicos ya no se interpretan.
  const identidades = await resolverIdentidadesCatalogo(supabase, tablas);
  const materias = materiasVisiblesDesdeCatalogo(tablas, identidades, aliases);
  const ocultas = [
    ...new Set(
      ((gms.data ?? []) as Array<{ tabla_legacy: string; activo: boolean }>)
        .filter((g) => g.activo === false)
        .map((g) => g.tabla_legacy),
    ),
  ];
  return { ok: true, materias, ocultas };
}

/**
 * C4.18 — Activa/desactiva la visibilidad de una materia en el catálogo
 * (solo rol directivo).
 *
 * Desactivar = UPDATE `grupo_materias.activo = false` para la tabla_legacy:
 *  - oculta la materia del panel de subir calificaciones y de la vista del
 *    alumno (que ya filtra grupo_materias activos);
 *  - NO borra materias, calificaciones, grupo_materias ni datos históricos.
 * Reactivar = activo = true (se restaura sin recrear nada).
 */
export async function actionCambiarVisibilidadMateria(
  idInterno: unknown,
  visible: unknown,
): Promise<{ ok: true; mensaje: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "No autorizado: se requiere rol directivo." };
  }

  const id = String(idInterno ?? "").trim();
  if (!id) return { ok: false, error: "Materia no válida." };

  // Re-resolver contra la lista REAL de materias (nunca confiar en el texto).
  const tablas = await listarMateriasCompletas();
  if (!tablas.some((t) => normalizarNombre(t) === normalizarNombre(id))) {
    return { ok: false, error: "La materia no existe o no está permitida." };
  }

  const supabase = await createClient();
  const activo = Boolean(visible);

  const { data: filas, error: e0 } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("id")
    .eq("tabla_legacy", id)
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
    .eq("tabla_legacy", id);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    mensaje: activo
      ? "Materia activada en el catálogo."
      : "Materia desactivada (oculta del panel de calificaciones y del alumno).",
  };
}
