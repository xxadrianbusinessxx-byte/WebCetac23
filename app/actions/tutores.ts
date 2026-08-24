"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { buscarAlumnoPorTexto, nombreCompletoAlumno } from "@/lib/escolar/alumnos";
import {
  alumnoTieneTutorPrincipal,
  cambiarCredencialesTutor,
  crearTutorConAlumnos,
  generarTutoresAutomaticos,
  listarCredencialesInicialesDeTutor,
  listarCurpsDeTutor,
  listarTutores,
  obtenerTutorConAlumnos,
  obtenerTutoresActivosDeAlumnos,
  previsualizarGeneracionTutores,
  type CredencialInicialTutor,
  type PrevisualizacionGeneracionTutores,
  type ResultadoGeneracionTutores,
  type ReemplazoTutor,
  type TutorRow,
} from "@/lib/escolar/tutores";




import { createClient } from "@/lib/supabase/server";

/**
 * Server Actions de TUTORES/PADRES (Bloque 6A).
 *
 * Reglas de seguridad:
 *  - ESCRITURA de tutores (crear): SOLO rol `directivo`.
 *  - LECTURA de la lista de tutores: SOLO rol `directivo`.
 *  - El tutor autenticado SOLO puede leer sus propios datos y cambiar sus
 *    propias credenciales (se valida contra `sesion.matricula` = tutor.id).
 */

// ---------------------------------------------------------------------------
// Directivo: gestión de tutores.
// ---------------------------------------------------------------------------

/** Lista todos los tutores (solo directivo). */
export async function actionListarTutores(): Promise<TutorRow[]> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return [];
  const supabase = await createClient();
  return listarTutores(supabase);
}

/**
 * Lista todos los tutores con sus credenciales iniciales (solo directivo).
 * Cada tutor incluye las contraseñas iniciales derivadas del CURP de cada uno
 * de sus hijos (últimos 8), para mostrarlas en el panel. La contraseña se
 * RECONSTRUYE desde el CURP (no se expone ningún hash).
 */
export async function actionListarTutoresConCredenciales(): Promise<
  { tutor: TutorRow; credencialesIniciales: CredencialInicialTutor[] }[]
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return [];
  const supabase = await createClient();
  const tutores = await listarTutores(supabase);
  const resultado: { tutor: TutorRow; credencialesIniciales: CredencialInicialTutor[] }[] =
    [];
  for (const tutor of tutores) {
    const credenciales = await listarCredencialesInicialesDeTutor(supabase, tutor.id);
    resultado.push({ tutor, credencialesIniciales: credenciales });
  }
  return resultado;
}


/**
 * Busca un alumno por CURP o nombre para vincularlo a un tutor (solo
 * directivo). Reutiliza `buscarAlumnoPorTexto` de alumnos. Indica si el alumno
 * ya tiene un tutor principal activo y, en ese caso, la `clave_tutor` actual
 * (para mostrarla en la UI y permitir la consolidación de hermanos, Bloque 6C).
 */
export async function actionBuscarAlumnoParaTutor(
  texto: string,
): Promise<{
  curp: string;
  nombreCompleto: string;
  yaTieneTutor: boolean;
  tutorIdActual?: string;
  claveTutorActual?: string;
} | null> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return null;
  const supabase = await createClient();
  const alumno = await buscarAlumnoPorTexto(supabase, texto);
  if (!alumno) return null;
  const yaTieneTutor = await alumnoTieneTutorPrincipal(supabase, alumno.CURP);
  let tutorIdActual: string | undefined;
  let claveTutorActual: string | undefined;
  if (yaTieneTutor) {
    const mapa = await obtenerTutoresActivosDeAlumnos(supabase, [alumno.CURP]);
    const previo = mapa.get(alumno.CURP);
    tutorIdActual = previo?.tutor_id;
    claveTutorActual = previo?.clave_tutor;
  }
  return {
    curp: alumno.CURP,
    nombreCompleto: nombreCompletoAlumno(alumno),
    yaTieneTutor,
    tutorIdActual,
    claveTutorActual,
  };
}

/**
 * Previsualiza la consolidación de hermanos (Bloque 6C) SIN crear nada: para
 * los CURP seleccionados, indica cuáles ya tienen tutor activo (y su
 * `clave_tutor`) y cuáles se asignarían por primera vez. Solo directivo.
 */
export async function actionPrevisualizarConsolidacionTutores(
  curps: string[],
): Promise<{
  alumnosConTutor: { curp: string; claveTutor: string }[];
  alumnosSinTutor: string[];
} | null> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return null;
  const supabase = await createClient();
  const mapa = await obtenerTutoresActivosDeAlumnos(supabase, curps);
  const alumnosConTutor: { curp: string; claveTutor: string }[] = [];
  const alumnosSinTutor: string[] = [];
  for (const curp of [...new Set(curps.map((c) => c.trim().toUpperCase()))].filter(Boolean)) {
    const previo = mapa.get(curp);
    if (previo) {
      alumnosConTutor.push({ curp, claveTutor: previo.clave_tutor });
    } else {
      alumnosSinTutor.push(curp);
    }
  }
  return { alumnosConTutor, alumnosSinTutor };
}

/**
 * Crea un tutor con sus alumnos vinculados (solo directivo).
 * Devuelve las credenciales iniciales para mostrarlas una sola vez.
 *
 * Si `consolidar` es true (Bloque 6C), además desactiva las relaciones previas
 * de los alumnos seleccionados y desactiva los tutores que queden huérfanos.
 */
export async function actionCrearTutor(args: {
  nombre?: string;
  apellidos?: string;
  curp?: string;
  telefono?: string;
  correo?: string;
  curpsAlumnos: string[];
  alumnoReferenciaParaUsuario: { curp: string; nombreCompleto: string };
  consolidar?: boolean;
}): Promise<
  | {
      ok: true;
      claveTutor: string;
      usuario: string;
      contraseñaInicial: string;
      curpsVinculados: string[];
      reemplazos?: ReemplazoTutor[];
      tutoresDesactivados?: string[];
    }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "Solo directivos pueden crear tutores." };
  }
  const supabase = await createClient();
  const resultado = await crearTutorConAlumnos(supabase, args);
  if (!resultado.ok) return { ok: false, error: resultado.error };
  return {
    ok: true,
    claveTutor: resultado.credencialesIniciales.clave_tutor,
    usuario: resultado.credencialesIniciales.usuario,
    contraseñaInicial: resultado.credencialesIniciales.contraseñaInicial,
    curpsVinculados: resultado.curpsVinculados,
    ...(resultado.reemplazos ? { reemplazos: resultado.reemplazos } : {}),
    ...(resultado.tutoresDesactivados
      ? { tutoresDesactivados: resultado.tutoresDesactivados }
      : {}),
  };
}


/** Obtiene un tutor con sus alumnos vinculados (solo directivo). */
export async function actionObtenerTutorDetalle(
  id: string,
): Promise<{ tutor: TutorRow; curps: string[] } | null> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return null;
  const supabase = await createClient();
  return obtenerTutorConAlumnos(supabase, id);
}

// ---------------------------------------------------------------------------
// Tutor autenticado: sus propios datos y cambio de credenciales.
// ---------------------------------------------------------------------------

/** Obtiene los datos del tutor autenticado y sus alumnos vinculados. */
export async function actionObtenerDatosTutor(): Promise<{
  tutor: TutorRow;
  curps: string[];
} | null> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "tutor") return null;
  const supabase = await createClient();
  const tutor = await obtenerTutorConAlumnos(supabase, sesion.matricula);
  if (!tutor) return null;
  return tutor;
}

/**
 * Cambia las credenciales del tutor autenticado (usuario y contraseña) y
 * marca `debe_cambiar_credenciales = false`. Solo el propio tutor.
 */
export async function actionCambiarCredencialesTutor(args: {
  usuario: string;
  contraseña: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "tutor") {
    return { ok: false, error: "Sesión de tutor no válida." };
  }
  const supabase = await createClient();
  return cambiarCredencialesTutor(supabase, sesion.matricula, args);
}

/** Lista los CURP de los alumnos del tutor autenticado. */
export async function actionListarCurpsDeTutor(): Promise<string[]> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "tutor") return [];
  const supabase = await createClient();
  return listarCurpsDeTutor(supabase, sesion.matricula);
}

// ---------------------------------------------------------------------------
// Directivo: generación masiva de tutores (Bloque 6B).
// ---------------------------------------------------------------------------

/**
 * Previsualiza la generación masiva SIN crear nada: cuántos alumnos existen,
 * cuántos ya tienen tutor y cuántos se procesarían (solo directivo).
 */
export async function actionPrevisualizarGeneracionTutores(): Promise<
  PrevisualizacionGeneracionTutores | null
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return null;
  const supabase = await createClient();
  return previsualizarGeneracionTutores(supabase);
}

/**
 * Ejecuta la generación masiva de tutores para los alumnos restantes (solo
 * directivo). Devuelve el resumen y el CSV con las credenciales iniciales de
 * los recién creados (solo en memoria, para descargar una sola vez).
 */
export async function actionGenerarTutoresAutomaticos(): Promise<
  | ResultadoGeneracionTutores
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "Solo directivos pueden generar tutores." };
  }
  const supabase = await createClient();
  try {
    return await generarTutoresAutomaticos(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    return { ok: false, error: `No se pudo generar: ${msg}` };
  }
}


