"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { carrerasDesdeTablas } from "@/lib/escolar/materia-identidad";
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
  materiasConNombreVisible,
  validarNombreVisible,
  type MateriaConNombreVisible,
} from "@/lib/escolar/nombres-visibles";
import { listarMateriasCompletas } from "@/lib/escolar/tablas-supabase";
import { createClient } from "@/lib/supabase/server";

/**
 * Lista todas las materias reales con su identidad (grado, grupo, carrera,
 * asignatura) y su nombre visible. Lectura: disponible para roles autenticados.
 */
export async function actionListarMateriasConNombreVisible(): Promise<
  MateriaConNombreVisible[]
> {
  const supabase = await createClient();
  const tablas = await listarMateriasCompletas();
  const aliases = await listarNombresVisiblesMaterias(supabase);
  const carreras = carrerasDesdeTablas(tablas);
  return materiasConNombreVisible(tablas, aliases, carreras);
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
