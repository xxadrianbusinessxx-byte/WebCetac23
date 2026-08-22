"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { listarCiclosEscolares } from "@/lib/escolar/calendario";
import {
  calcularPorcentajeAsistencia,
  confirmarAsistencias,
  configuracionVacia,
  generarPlantillaAsistencia,
  guardarConfiguracionClasesProfesor,
  listarGruposAsistencia,
  obtenerConfiguracionClasesProfesor,
  obtenerEstadosAsistenciaAlumno,
  previsualizarAsistencias,
  type ConfiguracionClasesProfesor,
  type DiaEstadoAsistencia,
  type PlanAsistencia,
  type ResumenAsistencia,
} from "@/lib/escolar/asistencias";



/**
 * Server Actions de ASISTENCIAS DEL PROFESOR (Bloque 5B).
 *
 * SEGURIDAD:
 *  - Solo `maestro` y `directivo` pueden operar.
 *  - La identidad del profesor (`profesor_clave`) SIEMPRE proviene de
 *    `sesion.matricula`. Nunca del archivo ni de un campo del navegador.
 *  - El profesor solo puede UPSERT sobre su propia `profesor_clave`.
 */

type ResultadoGrupos = {
  grupos: { grado: string; grupo: string; carrera: string }[];
  ciclos: string[];
};

export async function actionListarGruposAsistencia(): Promise<
  | { ok: true; data: ResultadoGrupos }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }

  const supabase = await createClient();
  const [grupos, ciclos] = await Promise.all([
    listarGruposAsistencia(supabase),
    listarCiclosEscolares(supabase),
  ]);

  return { ok: true, data: { grupos, ciclos } };
}

export async function actionDescargarPlantillaAsistencia(
  grado: string,
  grupo: string,
  carrera: string,
  ciclo: string,
): Promise<
  | { ok: true; csv: string; fechas: string[]; alumnos: number }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }

  const supabase = await createClient();
  const resultado = await generarPlantillaAsistencia(supabase, {
    grado,
    grupo,
    carrera,
    ciclo,
    profesorClave: sesion.matricula,
    profesorNombre: sesion.nombre || sesion.matricula,
  });

  if (!resultado.ok) return resultado;
  return {
    ok: true,
    csv: resultado.plantilla.csv,
    fechas: resultado.plantilla.fechas,
    alumnos: resultado.plantilla.alumnos.length,
  };
}

export async function actionPrevisualizarAsistencias(
  formData: FormData,
  grado: string,
  grupo: string,
  carrera: string,
  ciclo: string,
): Promise<
  | { ok: true; resumen: ResumenAsistencia; plan: PlanAsistencia }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo válido." };
  }

  const supabase = await createClient();
  const resultado = await previsualizarAsistencias(supabase, archivo, {
    grado,
    grupo,
    carrera,
    ciclo,
    profesorClave: sesion.matricula,
    profesorNombre: sesion.nombre || sesion.matricula,
  });

  if (!resultado.ok) return resultado;
  return { ok: true, resumen: resultado.plan.resumen, plan: resultado.plan };
}

export async function actionConfirmarAsistencias(
  formData: FormData,
  grado: string,
  grupo: string,
  carrera: string,
  ciclo: string,
): Promise<
  | { ok: true; resumen: ResumenAsistencia }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo válido." };
  }

  const supabase = await createClient();
  const resultado = await confirmarAsistencias(supabase, archivo, {
    grado,
    grupo,
    carrera,
    ciclo,
    profesorClave: sesion.matricula,
    profesorNombre: sesion.nombre || sesion.matricula,
  });

  if (!resultado.ok) return resultado;
  return { ok: true, resumen: resultado.plan.resumen };
}

/**
 * Obtiene la configuración semanal de clases del profesor actual (Bloque 5C).
 * Si aún no existe, devuelve una configuración vacía (todos los días en 0).
 */
export async function actionObtenerConfiguracionClasesProfesor(): Promise<
  | { ok: true; config: ConfiguracionClasesProfesor }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }

  const supabase = await createClient();
  const config = await obtenerConfiguracionClasesProfesor(
    supabase,
    sesion.matricula,
  );

  return {
    ok: true,
    config: config ?? configuracionVacia(sesion.matricula),
  };
}

/**
 * Guarda (UPSERT) la configuración semanal de clases del profesor actual.
 * La identidad SIEMPRE es `sesion.matricula`. Re-guardar actualiza, no duplica.
 */
export async function actionGuardarConfiguracionClasesProfesor(input: {
  lunes: number;
  martes: number;
  miercoles: number;
  jueves: number;
  viernes: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }

  const supabase = await createClient();
  return guardarConfiguracionClasesProfesor(supabase, {
    profesorClave: sesion.matricula,
    lunes: input.lunes,
    martes: input.martes,
    miercoles: input.miercoles,
    jueves: input.jueves,
    viernes: input.viernes,
  });
}

/**
 * Obtiene el calendario de asistencia de un alumno (por CURP) para un ciclo
 * (Bloque 5D). Devuelve los estados derivados `asistio/falta/pendiente/sin_clase`
 * y el porcentaje calculado SOLO sobre las clases registradas.
 *
 * Reutilizable para la futura visualización del alumno/padre (calendario
 * visual). NO almacena estados ni porcentaje: ambos son derivados.
 */
export async function actionObtenerEstadosAsistenciaAlumno(input: {
  curp: string;
  grado: string;
  grupo: string;
  carrera?: string;
  ciclo: string;
  profesorClave?: string;
}): Promise<
  | { ok: true; dias: DiaEstadoAsistencia[]; porcentaje: number }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) {
    return { ok: false, error: "No tienes permiso para consultar asistencias." };
  }

  const supabase = await createClient();
  const dias = await obtenerEstadosAsistenciaAlumno(supabase, input);
  return {
    ok: true,
    dias,
    porcentaje: calcularPorcentajeAsistencia(dias),
  };
}



