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
  profesorImparteEnGrupo,
  type ConfiguracionClasesProfesor,

  type DiaEstadoAsistencia,
  type PlanAsistencia,
  type ResumenAsistencia,
} from "@/lib/escolar/asistencias";

import {
  TABLA_CARRERAS,
  TABLA_ETIQUETAS_PERSONALES,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_JUSTIFICACIONES_ASISTENCIA,
} from "@/lib/escolar/tables";
import { listarCurpsDeTutor } from "@/lib/escolar/tutores";

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

  const curp = input.curp.trim().toUpperCase();
  if (!curp) {
    return { ok: false, error: "Indica la CURP del alumno." };
  }

  // Endurecimiento de permisos por rol:
  //  - alumno: solo su propia CURP (sesion.curp).
  //  - tutor: solo CURP de sus alumnos vinculados (relación activa).
  //  - maestro: solo alumnos de grupos donde imparte clase (según sus propios
  //    registros de `clases_impartidas`) y SIEMPRE limitado a su profesor_clave.
  //  - directivo: acceso total (sin restricción de grupo ni profesor).
  if (sesion.rol === "alumno") {
    if (!sesion.curp || sesion.curp.trim().toUpperCase() !== curp) {
      return { ok: false, error: "Solo puedes consultar tu propia asistencia." };
    }
  } else if (sesion.rol === "tutor") {
    const supabase = await createClient();
    const curps = await listarCurpsDeTutor(supabase, sesion.matricula);
    if (!curps.includes(curp)) {
      return { ok: false, error: "No tienes relación con ese alumno." };
    }
  } else if (sesion.rol === "maestro") {
    const supabase = await createClient();
    const imparte = await profesorImparteEnGrupo(
      supabase,
      sesion.matricula,
      input.grado,
      input.grupo,
    );
    if (!imparte) {
      return {
        ok: false,
        error:
          "Solo puedes consultar asistencias de los grupos donde impartes clase.",
      };
    }
    // Un maestro SIEMPRE consulta su propio aporte (nunca el global ni el de
    // otro profesor).
    input.profesorClave = sesion.matricula;
  } else if (sesion.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso para consultar asistencias." };
  }

  const supabase = await createClient();
  const dias = await obtenerEstadosAsistenciaAlumno(supabase, {
    ...input,
    curp,
  });

  return {
    ok: true,
    dias,
    porcentaje: calcularPorcentajeAsistencia(dias),
  };
}

/**
 * Obtiene el contexto de un alumno (grado/grupo/carrera/nombre) para que un
 * TUTOR pueda visualizar su asistencia. El tutor solo puede consultar alumnos
 * con los que tenga una relación activa (tutor_alumnos).
 */
export async function actionObtenerContextoAlumnoParaTutor(input: {
  curp: string;
}): Promise<
  | {
      ok: true;
      alumno: {
        curp: string;
        nombre: string;
        grado: string;
        grupo: string;
        carrera: string;
      };
    }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (!sesion || sesion.rol !== "tutor") {
    return { ok: false, error: "No tienes permiso para consultar alumnos." };
  }

  const curp = input.curp.trim().toUpperCase();
  if (!curp) {
    return { ok: false, error: "Indica la CURP del alumno." };
  }

  const supabase = await createClient();

  // El tutor solo puede consultar alumnos con relación activa.
  const curps = await listarCurpsDeTutor(supabase, sesion.matricula);
  if (!curps.includes(curp)) {
    return { ok: false, error: "No tienes relación con ese alumno." };
  }

  // C4.3 — Fuente primaria: inscripciones_alumno (activa) → grupos → carreras.
  // Fallback LEGACY temporal (ETIQUETAS PERSONALES) si no hay inscripción activa.
  const { data: inscripciones, error: errIns } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("grupo_id, activo")
    .eq("curp", curp)
    .eq("activo", true)
    .limit(2);

  let grado = "";
  let grupo = "";
  let carrera = "";

  if (errIns || !inscripciones || inscripciones.length === 0) {
    // Fallback LEGACY temporal (alumno sin inscripción activa).
    const { data: etiquetas, error: errEtiquetas } = await supabase
      .from(TABLA_ETIQUETAS_PERSONALES)
      .select("CURP, GRADO, GRUPO, CARRERA")
      .eq("CURP", curp)
      .limit(1)
      .maybeSingle();
    if (errEtiquetas || !etiquetas) {
      return { ok: false, error: "No se encontró el alumno en el grupo." };
    }
    grado = String(etiquetas.GRADO ?? "");
    grupo = String(etiquetas.GRUPO ?? "");
    carrera = String(etiquetas.CARRERA ?? "");
  } else if (inscripciones.length > 1) {
    // CASO E — múltiples inscripciones activas: anomalía; no elegir arbitrariamente.
    return {
      ok: false,
      error: "El alumno tiene más de una inscripción activa. Revisa el catálogo.",
    };
  } else {
    const { data: detalleGrupo, error: errGrupo } = await supabase
      .from(TABLA_GRUPOS)
      .select("grado, nombre, carrera_id, activo")
      .eq("id", inscripciones[0].grupo_id)
      .maybeSingle();
    if (errGrupo || !detalleGrupo || detalleGrupo.activo === false) {
      return {
        ok: false,
        error: "El grupo del alumno no es válido o está inactivo.",
      };
    }
    grado = String(detalleGrupo.grado ?? "");
    grupo = String(detalleGrupo.nombre ?? "");
    if (detalleGrupo.carrera_id) {
      const { data: detalleCarrera } = await supabase
        .from(TABLA_CARRERAS)
        .select("clave")
        .eq("id", detalleGrupo.carrera_id)
        .maybeSingle();
      carrera = String(detalleCarrera?.clave ?? "");
    }
  }

  // Nombre completo desde ALUMNOS.
  const { data: alumno, error: errAlumno } = await supabase
    .from("ALUMNOS")
    .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO")
    .eq("CURP", curp)
    .limit(1)
    .maybeSingle();
  if (errAlumno || !alumno) {
    return { ok: false, error: "No se encontró el alumno." };
  }

  const nombre = [
    alumno.NOMBRE,
    alumno.P_APELLIDO,
    alumno.S_APELLIDO,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    ok: true,
    alumno: {
      curp,
      nombre,
      grado,
      grupo,
      carrera,
    },
  };
}

/**
 * Registra (UPSERT) una justificación de falta para un alumno en una fecha.
 * Solo el tutor del alumno (o el propio alumno) puede solicitarla.
 * Re-solicitar la misma fecha actualiza el motivo, no duplica.
 */
export async function actionSolicitarJustificacionAsistencia(input: {
  curp: string;
  fecha: string;
  motivo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) {
    return { ok: false, error: "No tienes permiso para justificar asistencias." };
  }

  const curp = input.curp.trim().toUpperCase();
  const fecha = input.fecha.trim();
  const motivo = input.motivo.trim();
  if (!curp || !fecha || !motivo) {
    return { ok: false, error: "Indica CURP, fecha y motivo." };
  }
  if (motivo.length > 500) {
    return { ok: false, error: "El motivo no puede superar 500 caracteres." };
  }

  const supabase = await createClient();

  // Permisos: tutor (solo sus alumnos) o alumno (solo su propia CURP).
  let solicitanteTipo: "tutor" | "alumno" = "tutor";
  let solicitanteId = sesion.matricula;
  if (sesion.rol === "tutor") {
    const curps = await listarCurpsDeTutor(supabase, sesion.matricula);
    if (!curps.includes(curp)) {
      return { ok: false, error: "No tienes relación con ese alumno." };
    }
  } else if (sesion.rol === "alumno") {
    if (!sesion.curp || sesion.curp.trim().toUpperCase() !== curp) {
      return { ok: false, error: "Solo puedes justificar tu propia asistencia." };
    }
    solicitanteTipo = "alumno";
  } else {
    return { ok: false, error: "No tienes permiso para justificar asistencias." };
  }

  // UPSERT: una justificación por (curp, fecha). Re-solicitar actualiza.
  const { error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .upsert(
      {
        curp_alumno: curp,
        fecha,
        motivo,
        estado: "pendiente",
        solicitante_tipo: solicitanteTipo,
        solicitante_id: solicitanteId,
      },
      { onConflict: "curp_alumno,fecha" },
    );

  if (error) {
    return { ok: false, error: "No se pudo guardar la justificación." };
  }
  return { ok: true };
}




