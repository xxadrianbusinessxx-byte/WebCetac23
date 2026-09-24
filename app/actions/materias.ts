"use server";

import { exigir } from "@/lib/auth/exigir";
import { esRol } from "@/lib/auth/permisos";
import {
  esMapeoColumnasMateria,
  guardarMapeoColumnasMateria,
  obtenerMapeoColumnasMateria,
  resolverMapeoColumnasAFisico,
  validarMapeoColumnasMateria,
  validarPesosActividades,
  type MapeoColumnasMateria,
} from "@/lib/escolar/materia/mapeo-columnas-materia";
import { normalizarNombre } from "@/lib/escolar/nombres";
import { archivoCsvAFilas } from "@/lib/escolar/csv";
import {
  guardarNombreVisibleMateria,
  listarNombresVisiblesMaterias,
  materiasVisiblesDesdeCatalogo,
  quitarNombreVisibleMateria,
  validarNombreVisible,
  type MateriaConNombreVisible,
} from "@/lib/escolar/materia/nombres-visibles";
import { listarMateriasCompletas } from "@/lib/escolar/materia/tablas-supabase";
import { generarPlantillaMateriaXlsx } from "@/lib/escolar/materia/materias";
import {
  cambiarVisibilidadMateria,
  filtrarTablasVisibles,
  listarTablasLegacyOcultas,
  resolverAsignacionesProfesor,
  resolverAsignacionesProfesorPorId,
  resolverIdentidadesCatalogo,
  type AsignacionProfesorResuelta,
} from "@/lib/escolar/catalogo/catalogo-academico";
import { createClient } from "@/lib/supabase/server";
import { leerFormData } from "@/lib/validacion/leer-form-data";
import { esquemaAliasArchivo } from "@/lib/validacion/esquemas-puro";

/**
 * Filtra las tablas de materias visibles/operativas: la decisión vive en
 * `lib/escolar/catalogo/catalogo-academico.ts` (`filtrarTablasVisibles`) y se
 * usa directamente en este archivo.
 */

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
  const g = await exigir("materia.ver_catalogo");
  if (!g.ok) return [];
  const sesion = g.sesion!;
  const supabase = await createClient();
  const aliases = await listarNombresVisiblesMaterias(supabase);

  if (esRol(sesion.rol, "maestro")) {
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
  const g = await exigir("materia.editar_alias");
  if (!g.ok) {
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
    g.sesion?.matricula ?? "",
  );
}

/**
 * PROMPT-4/T2 — Quita el alias de una materia (activo=false, nunca DELETE).
 * Reutiliza la capacidad `materia.editar_alias`: quitar un alias es editarlo.
 * La materia vuelve a mostrarse por su idInterno; el historial del alias se
 * conserva (R8) y volver a ponerlo es un clic.
 */
export async function actionQuitarAliasMateria(
  idInterno: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await exigir("materia.editar_alias");
  if (!g.ok) {
    return { ok: false, error: "No autorizado: se requiere la capacidad de editar aliases." };
  }

  const idBuscado = (idInterno ?? "").trim();
  if (!idBuscado) return { ok: false, error: "Materia no válida." };

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
  return quitarNombreVisibleMateria(supabase, materiaReal);
}

export type FilaAliasVolumen = {
  /** idInterno real (resuelto contra el catálogo). */
  idInterno: string;
  /** Alias activo hoy (idInterno si no tiene). */
  actual: string;
  /** Alias propuesto (vacío = quitar el alias). */
  propuesto: string;
  ok: boolean;
  error?: string;
};

const ENCABEZADOS_ALIAS = ["materia", "id", "tabla", "id_interno", "nombre_visible", "alias"];

function normalizarCelda(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * PROMPT-4/T2 — Previsualiza un archivo de aliases (materia;nombre_visible).
 * NO escribe nada: para cada fila reporta qué alias tiene hoy, qué propone el
 * archivo y si la materia existe en el catálogo real. Propuesto vacío = quitar
 * el alias (activo=false).
 */
export async function actionPrevisualizarAliasArchivo(
  formData: FormData,
): Promise<{ ok: true; filas: FilaAliasVolumen[] } | { ok: false; error: string }> {
  const g = await exigir("materia.editar_alias");
  if (!g.ok) return { ok: false, error: "No autorizado." };

  const entrada = leerFormData(esquemaAliasArchivo, formData);
  if (!entrada.ok) return { ok: false, error: entrada.error };
  let filasMatriz: string[][];
  try {
    const { filas } = await archivoCsvAFilas(entrada.datos.archivo);
    filasMatriz = filas;
  } catch (e) {
    return { ok: false, error: `No se pudo leer el archivo: ${String(e)}` };
  }
  const datos = filasMatriz.filter((f) => f.some((c) => (c ?? "").trim() !== ""));
  if (datos.length < 2) return { ok: false, error: "El archivo no tiene filas de datos." };

  // Detectar columnas por encabezado (normalizado, tolerante a acentos/case).
  const encabezados = (datos[0] ?? []).map((h) =>
    normalizarNombre(String(h ?? "")).replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""),
  );
  const idxMateria = encabezados.findIndex((h) =>
    ENCABEZADOS_ALIAS.slice(0, 4).some((e) => h === e),
  );
  const idxAlias = encabezados.findIndex((h) =>
    ENCABEZADOS_ALIAS.slice(4).some((e) => h === e),
  );
  if (idxMateria < 0 || idxAlias < 0) {
    return {
      ok: false,
      error: "El archivo necesita dos columnas: «materia» (idInterno) y «nombre_visible» (vacío = quitar alias).",
    };
  }

  const supabase = await createClient();
  const tablas = await listarMateriasCompletas();
  const aliases = await listarNombresVisiblesMaterias(supabase);

  const filas: FilaAliasVolumen[] = [];
  for (let i = 1; i < datos.length; i++) {
    const materiaRaw = normalizarCelda(datos[i][idxMateria]);
    const propuestoRaw = normalizarCelda(datos[i][idxAlias]);
    if (!materiaRaw) continue;
    const real = tablas.find((t) => normalizarNombre(t) === normalizarNombre(materiaRaw));
    if (!real) {
      filas.push({
        idInterno: materiaRaw,
        actual: materiaRaw,
        propuesto: propuestoRaw,
        ok: false,
        error: "Materia no encontrada en el catálogo.",
      });
      continue;
    }
    const actual = aliases.get(real) ?? real;
    const propuesto = propuestoRaw || ""; // vacío = quitar
    const errorVal =
      propuesto && propuestoRaw.length > 0 ? validarNombreVisible(propuesto) : null;
    filas.push({
      idInterno: real,
      actual,
      propuesto,
      ok: !errorVal,
      error: errorVal ?? undefined,
    });
  }
  return { ok: true, filas };
}

/**
 * PROMPT-4/T2 — Aplica los aliases previsualizados (confirmación del patrón
 * previsualizar → confirmar). El cliente manda la MISMA lista que vio en la
 * previsualización (filas con ok=true); el servidor la re-valida y escribe.
 * Cada alias se guarda (UPSERT activo=true) o se quita (activo=false).
 */
export async function actionAplicarAliasArchivo(
  filas: unknown,
): Promise<{ ok: true; aplicados: number; quitados: number; errores: number } | { ok: false; error: string }> {
  const g = await exigir("materia.editar_alias");
  if (!g.ok) return { ok: false, error: "No autorizado." };

  if (!Array.isArray(filas)) return { ok: false, error: "Lista de cambios no válida." };
  const supabase = await createClient();
  const tablas = await listarMateriasCompletas();

  let aplicados = 0;
  let quitados = 0;
  let errores = 0;
  for (const raw of filas) {
    const fila = raw as { idInterno?: unknown; propuesto?: unknown };
    const idInterno = String(fila.idInterno ?? "").trim();
    const propuesto = String(fila.propuesto ?? "").trim();
    if (!idInterno) {
      errores++;
      continue;
    }
    const real = tablas.find((t) => normalizarNombre(t) === normalizarNombre(idInterno));
    if (!real) {
      errores++;
      continue;
    }
    if (!propuesto) {
      const r = await quitarNombreVisibleMateria(supabase, real);
      if (r.ok) quitados++;
      else errores++;
    } else {
      const errorVal = validarNombreVisible(propuesto);
      if (errorVal) {
        errores++;
        continue;
      }
      const r = await guardarNombreVisibleMateria(supabase, real, propuesto, g.sesion?.matricula ?? "");
      if (r.ok) aplicados++;
      else errores++;
    }
  }
  return { ok: true, aplicados, quitados, errores };
}

/**
 * Lee la configuración de mapeo de columnas de una materia (o null).
 * Lectura disponible para roles autenticados (la config solo afecta
 * presentación).
 */
export async function actionObtenerMapeoColumnasMateria(
  idInterno: string,
): Promise<MapeoColumnasMateria | null> {
  const g = await exigir("materia.mapear_columnas");
  if (!g.ok) return null;
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
  const g = await exigir("materia.mapear_columnas");
  if (!g.ok) {
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

  // BLOQUE 9 (PIEZA 1): los pesos opcionales deben referirse a actividades
  // detectadas y su suma no puede superar 100%. Permite menos de 100.
  const validacionPesos = validarPesosActividades(
    mapeoFisico.pesosActividades,
    mapeoFisico.columnasActividades,
  );
  if (!validacionPesos.ok) {
    return { ok: false, error: validacionPesos.errores.join(" · ") };
  }

  const supabase = await createClient();
  return guardarMapeoColumnasMateria(
    supabase,
    materiaReal,
    mapeoFisico,
    g.sesion?.matricula ?? "",
  );
}

/**
 * BLOQUE 9 (PIEZA 2) — Descarga una plantilla .xlsx de MATERIA (CURP | NOMBRE)
 * para un grado/grupo/carrera. Mismo patrón de permiso que
 * `actionDescargarPlantillaAsistencia`: SOLO rol maestro o directivo.
 * Reutiliza `generarPlantillaMateriaXlsx` → `obtenerAlumnosDelGrupo`.
 */
export async function actionDescargarPlantillaMateria(
  grado: string,
  grupo: string,
  carrera: string,
): Promise<
  | { ok: true; base64: string; nombreArchivo: string; alumnos: number }
  | { ok: false; error: string }
> {
  const g = await exigir("materia.descargar_plantilla");
  if (!g.ok) {
    return {
      ok: false,
      error: "No tienes permiso para descargar plantillas de materia.",
    };
  }

  const supabase = await createClient();
  return generarPlantillaMateriaXlsx(supabase, grado, grupo, carrera);
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
  const g = await exigir("materia.ver_catalogo");
  if (!g.ok) {
    return { ok: false, error: "No autorizado: se requiere rol directivo." };
  }

  const supabase = await createClient();
  const [aliases, tablas, ocultas] = await Promise.all([
    listarNombresVisiblesMaterias(supabase),
    listarMateriasCompletas(),
    listarTablasLegacyOcultas(supabase),
  ]);
  // C4.28 — identidad desde el catálogo (grupo_materias → grupos/materias/
  // carreras); los nombres físicos ya no se interpretan.
  const identidades = await resolverIdentidadesCatalogo(supabase, tablas);
  const materias = materiasVisiblesDesdeCatalogo(tablas, identidades, aliases);
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
  const g = await exigir("materia.activar_desactivar");
  if (!g.ok) {
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

  // El UPDATE de `grupo_materias` vive en la capa de dominio
  // (`cambiarVisibilidadMateria`); la action solo valida la capacidad y el id.
  const r = await cambiarVisibilidadMateria(supabase, id, activo);
  if (!r.ok) return r;

  return {
    ok: true,
    mensaje: activo
      ? "Materia activada en el catálogo."
      : "Materia desactivada (oculta del panel de calificaciones y del alumno).",
  };
}
