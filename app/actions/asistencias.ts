"use server";
import { obtenerCicloOperativoGlobal } from "@/lib/escolar/ciclo-estado";


import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { listarCiclosEscolares, normalizarCicloEscolar } from "@/lib/escolar/calendario";
import {
  calcularPorcentajeAsistencia,
  confirmarAsistencias,
  generarPlantillaAsistencia,
  listarGruposAsistencia,
  obtenerAlumnosDelGrupo,
  obtenerEstadosAsistenciaAlumno,
  previsualizarAsistencias,
  profesorImparteEnGrupo,
  type DiaEstadoAsistencia,
  type PlanAsistencia,
  type ResumenAsistencia,
} from "@/lib/escolar/asistencias";
import { resolverAsignacionesProfesor } from "@/lib/escolar/catalogo-academico";
import {
  consultarHorarioGrupoPorIdentidad,
  materiasDelHorario,
  totalBloquesGrupoPorDia,
} from "@/lib/escolar/horario-semanal";

import {
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_CARRERAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_JUSTIFICACIONES_ASISTENCIA,
  TABLA_PERIODOS,
} from "@/lib/escolar/tables";
import { listarCurpsDeTutor } from "@/lib/escolar/tutores";
import {
  resolverContextoAlumnoDesdeInscripcion,
  resumenClasesYAsistencia,
} from "@/lib/escolar/justificaciones";

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
  /** Ciclos legacy del calendario (texto) + el periodo OPERATIVO (unión). */
  ciclos: string[];
  /** Nombre normalizado del periodo OPERATIVO actual, si existe (default UI). */
  cicloOperativo: string | null;
  /** Aviso cuando no hay un único periodo OPERATIVO (para mostrarlo en la UI). */
  avisoOperativo: string | null;
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
  // Pieza C — resuelve el periodo OPERATIVO con el MISMO helper que usa
  // /configuracion (obtenerCicloOperativoGlobal) y lo incluye como default.
  const [grupos, ciclosLegacy, operativo] = await Promise.all([
    listarGruposAsistencia(supabase),
    listarCiclosEscolares(supabase),
    obtenerCicloOperativoGlobal(supabase),
  ]);

  let cicloOperativo: string | null = null;
  let avisoOperativo: string | null = null;
  if (!operativo.ok) {
    avisoOperativo = operativo.error ?? "F1: no hay un único ciclo OPERATIVO.";
  } else if (operativo.periodo) {
    cicloOperativo = normalizarCicloEscolar(String(operativo.periodo.nombre));
  } else {
    avisoOperativo =
      "No hay ningún periodo OPERATIVO activado todavía. Elige un ciclo manualmente o activa el ciclo en Configuración.";
  }

  // Coexistencia documentada (deuda listarCiclosEscolares vs calendario texto):
  // se conservan los ciclos legacy del calendario y se garantiza que el
  // periodo OPERATIVO siempre esté disponible en el selector.
  const ciclos = [
    ...new Set([
      ...ciclosLegacy,
      ...(cicloOperativo ? [cicloOperativo] : []),
    ]),
  ].sort((a, b) => b.localeCompare(a, "es"));

  return { ok: true, data: { grupos, ciclos, cicloOperativo, avisoOperativo } };
}

export async function actionDescargarPlantillaAsistencia(
  grado: string,
  grupo: string,
  carrera: string,
  ciclo: string,
  materiaClave: string,
): Promise<
  | {
      ok: true;
      base64: string;
      nombreArchivo: string;
      fechas: string[];
      alumnos: number;
      /** FASE HORARIO — true cuando la fila CLASES se derivó del horario. */
      usaHorario: boolean;
      /** Aviso de la derivación (p. ej. sin asignación en el grupo). */
      aviso?: string | null;
    }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }

  if (!materiaClave.trim()) {
    return { ok: false, error: "Selecciona la materia para generar la plantilla." };
  }

  const supabase = await createClient();
  const resultado = await generarPlantillaAsistencia(supabase, {
    grado,
    grupo,
    carrera,
    ciclo,
    materiaClave,
    profesorClave: sesion.matricula,
    profesorNombre: sesion.nombre || sesion.matricula,
  });

  if (!resultado.ok) return resultado;
  return {
    ok: true,
    base64: resultado.plantilla.base64,
    nombreArchivo: resultado.plantilla.nombreArchivo,
    fechas: resultado.plantilla.fechas,
    alumnos: resultado.plantilla.alumnos.length,
    usaHorario: resultado.plantilla.usaHorario,
    aviso: resultado.plantilla.aviso,
  };
}

export async function actionPrevisualizarAsistencias(
  formData: FormData,
  grado: string,
  grupo: string,
  carrera: string,
  ciclo: string,
  materiaClave: string,
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
  if (!materiaClave.trim()) {
    return { ok: false, error: "Selecciona la materia para analizar la plantilla." };
  }

  const supabase = await createClient();
  const resultado = await previsualizarAsistencias(supabase, archivo, {
    grado,
    grupo,
    carrera,
    ciclo,
    materiaClave,
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
  materiaClave: string,
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
  if (!materiaClave.trim()) {
    return { ok: false, error: "Selecciona la materia para guardar la plantilla." };
  }

  const supabase = await createClient();
  const resultado = await confirmarAsistencias(supabase, archivo, {
    grado,
    grupo,
    carrera,
    ciclo,
    materiaClave,
    profesorClave: sesion.matricula,
    profesorNombre: sesion.nombre || sesion.matricula,
  });

  if (!resultado.ok) return resultado;
  return { ok: true, resumen: resultado.plan.resumen };
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
        ciclo: string;
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

  // C4.3/C4.25 — Fuente ÚNICA: inscripciones_alumno (activa) → grupos → carreras.
  // Sin fallback hacia ETIQUETAS PERSONALES (identidad académica SOLO desde la
  // inscripción que controla el directivo).
  const { data: inscripciones, error: errIns } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("grupo_id, activo")
    .eq("curp", curp)
    .eq("activo", true)
    .limit(2);

  let grado = "";
  let grupo = "";
  let carrera = "";
  let ciclo = "";

  if (errIns || !inscripciones || inscripciones.length === 0) {
    return { ok: false, error: "El alumno no tiene inscripción activa." };
  } else if (inscripciones.length > 1) {
    // CASO E — múltiples inscripciones activas: anomalía; no elegir arbitrariamente.
    return {
      ok: false,
      error: "El alumno tiene más de una inscripción activa. Revisa el catálogo.",
    };
  } else {
    const { data: detalleGrupo, error: errGrupo } = await supabase
      .from(TABLA_GRUPOS)
      .select("grado, nombre, carrera_id, periodo_id, activo")
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
    if (detalleGrupo.periodo_id) {
      const { data: detallePeriodo } = await supabase
        .from(TABLA_PERIODOS)
        .select("nombre")
        .eq("id", detalleGrupo.periodo_id)
        .maybeSingle();
      ciclo = String(detallePeriodo?.nombre ?? "");
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
      ciclo,
    },
  };
}

/** ¿Fecha en el futuro? (formato YYYY-MM-DD) */
function esFechaFuturaLocal(fecha: string): boolean {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(f.getTime())) return false;
  return f.getTime() > hoy.getTime();
}

/**
 * Registra (UPSERT) una justificación de falta para un alumno en una fecha.
 * Solo el tutor del alumno (o el propio alumno) puede solicitarla.
 * Re-solicitar la misma fecha actualiza el motivo (solo si sigue pendiente).
 * Validaciones server-side: fecha no futura, falta real registrada, y no existe
 * justificación aprobada/rechazada previa. Identidad académica SOLO desde la
 * inscripción.
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
  if (esFechaFuturaLocal(fecha)) {
    return { ok: false, error: "No se puede justificar una fecha futura." };
  }

  const supabase = await createClient();

  // Permisos: tutor (solo sus alumnos), alumno (solo su propia CURP) o
  // profesor/directivo (BLOQUE 9 / PIEZA 3 — validado abajo con la función
  // YA EXISTENTE `profesorImparteEnGrupo`, que verifica `clases_impartidas`).
  let solicitanteTipo: "tutor" | "alumno" | "profesor" = "tutor";
  let solicitanteId = sesion.matricula;
  const rolProfesorJustifica =
    sesion.rol === "maestro" || sesion.rol === "directivo";
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
  } else if (!rolProfesorJustifica) {
    return { ok: false, error: "No tienes permiso para justificar asistencias." };
  }

  // Contexto académico SOLO desde la inscripción (sin fallback legacy).
  const contexto = await resolverContextoAlumnoDesdeInscripcion(supabase, curp);
  if (!contexto) {
    return { ok: false, error: "El alumno no tiene inscripción activa; no se puede justificar." };
  }

  // BLOQUE 9 (PIEZA 3): el profesor solo justifica faltas en los grupos donde
  // realmente imparte clase (validación existente, NO se reimplementa).
  if (rolProfesorJustifica) {
    const imparte = await profesorImparteEnGrupo(
      supabase,
      sesion.matricula,
      contexto.grado,
      contexto.grupo,
    );
    if (!imparte) {
      return {
        ok: false,
        error: "Solo puedes justificar faltas en los grupos donde impartes clase.",
      };
    }
    solicitanteTipo = "profesor";
    solicitanteId = sesion.matricula;
  }
  // Debe existir una falta real ese día.
  const { esperadas, asistidas } = await resumenClasesYAsistencia(supabase, {
    curp,
    grado: contexto.grado,
    grupo: contexto.grupo,
    fecha,
  });
  if (esperadas <= 0) {
    return { ok: false, error: "Ese día no hay clase registrada para el grupo del alumno." };
  }
  if (asistidas > 0) {
    return { ok: false, error: "El alumno no tiene falta registrada ese día." };
  }

  // Estados previos: no re-solicitar algo aprobado o rechazado (historial).
  const { data: previa } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("id, estado")
    .eq("curp_alumno", curp)
    .eq("fecha", fecha)
    .maybeSingle();
  if (previa && previa.estado === "aprobada") {
    return { ok: false, error: "Esa falta ya fue aprobada." };
  }
  if (previa && previa.estado === "rechazada") {
    return {
      ok: false,
      error: "Esa falta ya fue rechazada por la administración. Contacta con la dirección.",
    };
  }

  // UPSERT: una justificación por (curp, fecha). Re-solicitar actualiza.
  const { error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .upsert(
      {
        curp_alumno: curp,
        fecha,
        grado: contexto.grado,
        grupo: contexto.grupo,
        carrera: contexto.carrera,
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

/**
 * BLOQUE 9 (PIEZA 4) — Anula (resta 1 a) el aporte de asistencia que el
 * profesor registró para un alumno en una fecha concreta.
 *
 * SEGURIDAD:
 *   - SOLO rol «maestro» o «directivo».
 *   - El profesor debe impartir en el grupo (profesorImparteEnGrupo, existente).
 *   - UPDATE puntual (NO upsert-insert): scoped a `profesor_clave =
 *     sesion.matricula` + curp + fecha + grado + grupo. El WHERE por
 *     profesor_clave garantiza que NUNCA se toca el aporte de otro profesor.
 *   - Resta 1 con piso en 0 (GREATEST(clases_asistidas - 1, 0) emulado en el
 *     servidor con Math.max; el CHECK `clases_asistidas >= 0` de la tabla
 *     sigue protegiendo contra negativos).
 */
export async function actionAnularAsistenciaProfesor(input: {
  curp: string;
  fecha: string;
  grado: string;
  grupo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso para anular asistencias." };
  }

  const curp = input.curp.trim().toUpperCase();
  const fecha = input.fecha.trim();
  const grado = input.grado.trim();
  const grupo = input.grupo.trim();
  if (!curp || !fecha || !grado || !grupo) {
    return { ok: false, error: "Indica CURP, fecha, grado y grupo." };
  }
  if (esFechaFuturaLocal(fecha)) {
    return { ok: false, error: "No se puede anular una fecha futura." };
  }

  const supabase = await createClient();

  // Validación existente: el profesor solo opera en los grupos donde imparte.
  const imparte = await profesorImparteEnGrupo(
    supabase,
    sesion.matricula,
    grado,
    grupo,
  );
  if (!imparte) {
    return {
      ok: false,
      error: "Solo puedes anular asistencias en los grupos donde impartes clase.",
    };
  }

  // Buscar SOLO la fila de ESTE profesor (profesor_clave = sesión).
  const { data: fila, error: errBuscar } = await supabase
    .from(TABLA_ASISTENCIA_ALUMNOS)
    .select("id, clases_asistidas")
    .eq("profesor_clave", sesion.matricula)
    .eq("curp", curp)
    .eq("fecha", fecha)
    .eq("grado", grado)
    .eq("grupo", grupo)
    .maybeSingle();

  if (errBuscar) return { ok: false, error: errBuscar.message };
  if (!fila) {
    return {
      ok: false,
      error: "No hay asistencia registrada por ti ese día para este alumno.",
    };
  }

  // Resta 1 con piso en 0 (GREATEST(clases_asistidas - 1, 0)).
  const nuevoValor = Math.max((Number(fila.clases_asistidas) || 0) - 1, 0);

  // UPDATE puntual sobre la fila concreta (id) — nunca la de otro profesor.
  const { error: errUpdate } = await supabase
    .from(TABLA_ASISTENCIA_ALUMNOS)
    .update({ clases_asistidas: nuevoValor })
    .eq("id", fila.id);

  if (errUpdate) return { ok: false, error: errUpdate.message };
  return { ok: true };
}

/**
 * BLOQUE 9 (PIEZA 4) — Lista los grupos donde el profesor de sesión imparte
 * clase (`resolverAsignacionesProfesor`, catálogo) con los alumnos de cada
 * grupo (`obtenerAlumnosDelGrupo`, que ya maneja catálogo + fallback legacy).
 *
 * PERF: los alumnos de cada grupo se resuelven en PARALELO (Promise.all).
 * NO se hace un buscador sobre los 461 alumnos completos: solo sobre los
 * grupos asignados al profesor de la sesión.
 */
export async function actionListarAlumnosGruposProfesor(): Promise<
  | {
      ok: true;
      grupos: {
        grado: string;
        grupo: string;
        carrera: string;
        alumnos: { curp: string; nombre: string }[];
      }[];
    }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso para consultar alumnos." };
  }

  const supabase = await createClient();
  const asignaciones = await resolverAsignacionesProfesor(
    supabase,
    sesion.matricula,
  );
  if (asignaciones.length === 0) {
    return {
      ok: false,
      error:
        "No tienes grupos asignados en el catálogo (asignaciones_profesor). La administración debe crear tus asignaciones.",
    };
  }

  // Agrupar por (grado, grupo, carrera) sin duplicados.
  const gruposUnicos = new Map<
    string,
    { grado: string; grupo: string; carrera: string }
  >();
  for (const a of asignaciones) {
    const grado = String(a.grupo.grado ?? "").trim();
    const grupo = String(a.grupo.nombre ?? "").trim();
    const carrera = String(a.carrera?.clave ?? "").trim();
    if (!grado || !grupo) continue;
    gruposUnicos.set(`${grado}|${grupo}|${carrera}`, { grado, grupo, carrera });
  }
  const grupos = [...gruposUnicos.values()];

  const porGrupo = await Promise.all(
    grupos.map(async (g) => ({
      ...g,
      alumnos: (
        await obtenerAlumnosDelGrupo(supabase, g.grado, g.grupo, g.carrera)
      ).map((al) => ({ curp: al.curp, nombre: al.nombre })),
    })),
  );

  return { ok: true, grupos: porGrupo };
}

/**
 * FASE HORARIO — Materias disponibles en el horario oficial del grupo.
 * Cualquier profesor puede descargar la plantilla de una materia; el sistema
 * calcula automáticamente cuántas clases tiene esa materia cada día.
 */
export type MateriaHorarioUI = {
  clave: string;
  nombre: string;
  totalSemana: number;
  porDia: Record<string, number>;
};

export async function actionObtenerMateriasHorarioGrupo(input: {
  grado: string;
  grupo: string;
  carrera: string;
  ciclo: string;
}): Promise<
  | {
      ok: true;
      usaHorario: boolean;
      aviso: string | null;
      materias: MateriaHorarioUI[];
      porDiaGrupo: Record<string, number>;
    }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (!sesion || (sesion.rol !== "maestro" && sesion.rol !== "directivo")) {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }
  const supabase = await createClient();
  const consulta = await consultarHorarioGrupoPorIdentidad(supabase, {
    ciclo: input.ciclo,
    grado: input.grado,
    grupo: input.grupo,
    carrera: input.carrera,
  });
  if (!consulta) {
    return {
      ok: true,
      usaHorario: false,
      aviso: "El grupo no tiene horario oficial cargado para este periodo.",
      materias: [],
      porDiaGrupo: {},
    };
  }
  const materias: MateriaHorarioUI[] = materiasDelHorario(
    consulta.bloques,
  ).map((m) => ({
    clave: m.clave,
    nombre: m.nombre,
    totalSemana: m.totalSemana,
    porDia: { ...m.porDia } as Record<string, number>,
  }));
  const porDiaGrupo = totalBloquesGrupoPorDia(
    consulta.bloques,
  ) as Record<string, number>;
  return { ok: true, usaHorario: true, aviso: null, materias, porDiaGrupo };
}

/**
 * FASE CONSOLIDACIÓN — Ciclo escolar ACTIVO del catálogo (resolución
 * automática para el profesor, que NO debe seleccionar el ciclo manualmente
 * si el sistema puede resolverlo). Solo lectura para maestro/directivo.
 */
export async function actionObtenerCicloActual(): Promise<
  | { ok: true; ciclo: string | null }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (!sesion || (sesion.rol !== "maestro" && sesion.rol !== "directivo")) {
    return { ok: false, error: "No tienes permiso para consultar asistencias." };
  }
  const supabase = await createClient();
  const r = await obtenerCicloOperativoGlobal(supabase);
  if (!r.ok) return { ok: false, error: r.error ?? "F1: no hay un único ciclo OPERATIVO." };
  return { ok: true, ciclo: r.periodo ? String(r.periodo.nombre) : null };
}

