"use server";
import { obtenerCicloOperativoGlobal } from "@/lib/escolar/ciclo/ciclo-estado";


import { exigir } from "@/lib/auth/exigir";
import { esRol } from "@/lib/auth/permisos";
import { createClient } from "@/lib/supabase/server";
import {
  resolverOperativoConParciales,
  resolverOperativoYValidarParcial,
} from "@/lib/escolar/ciclo/evaluaciones";
import {
  calcularPorcentajeAsistencia,
  confirmarAsistencias,
  esquemaAtribucionDisponible,
  fijarClasesAsistidas,
  generarPlantillaAsistencia,
  listarAportesDeProfesorEnDia,
  listarGruposAsistencia,
  obtenerAlumnosDelGrupo,
  obtenerEstadosAsistenciaAlumno,
  previsualizarAsistencias,
  profesorImparteEnGrupo,
  resolverIdentidadAlumnoInscripcion,
  resumenAsistenciaPorParcial,
  type DiaEstadoAsistencia,
  type ParcialAsistencia,
  type PlanAsistencia,
  type ResumenAsistencia,
  type ResumenPorParcial,
} from "@/lib/escolar/asistencia/asistencias";
import {
  consultarHorarioGrupoPorIdentidad,
  listarGrupoIdsConHorario,
  obtenerGruposConCarreraDePeriodo,
  materiasDelHorario,
  totalBloquesGrupoPorDia,
} from "@/lib/escolar/horario/horario-semanal";
import { listarGrupoIdsAsignadosProfesor } from "@/lib/escolar/catalogo/asignaciones-profesor";
import { leerFormData } from "@/lib/validacion/leer-form-data";
import { esquemaArchivoAsistencias } from "@/lib/validacion/esquemas-puro";
import { consultarPeriodo } from "@/lib/escolar/ciclo/ciclo-estado";
import { obtenerNombreCompletoAlumno } from "@/lib/escolar/alumno/alumnos";
import { listarCurpsDeTutor } from "@/lib/escolar/tutores/tutores";
import {
  estadoJustificacionPrevia,
  guardarJustificacionDiaCompleto,
  resolverContextoAlumnoDesdeInscripcion,
  resumenClasesYAsistencia,
} from "@/lib/escolar/asistencia/justificaciones";

/**
 * Server Actions de ASISTENCIAS DEL PROFESOR (Bloque 5B + Prompt C/D).
 *
 * SEGURIDAD:
 *  - Solo `maestro` y `directivo` pueden operar.
 *  - La identidad del profesor es SIEMPRE `sesion.profesorId` (PROFESORES.ID).
 *    Nunca del archivo ni de un campo del navegador. `profesor_clave`
 *    (contraseña) dejó de ser criterio de identidad y de búsqueda (D-4).
 *  - Sin `profesorId` en sesión (sesión vieja) se pide volver a iniciar sesión;
 *    no se escribe ni se consulta usando la contraseña.
 */

type ResultadoGrupos = {
  grupos: { grado: string; grupo: string; carrera: string }[];
  /** Periodo OPERATIVO (ciclo global) resuelto con obtenerCicloOperativoGlobal. */
  periodoOperativo: { id: string; nombre: string } | null;
  /** Parciales ACTIVOS del periodo operativo (periodos_evaluacion). */
  parciales: {
    id: string;
    numero: number;
    nombre: string;
    fecha_inicio: string;
    fecha_fin: string;
  }[];
  /** Aviso (sin operativo / esquema de parciales pendiente / sin parciales). */
  avisoOperativo: string | null;
};

export async function actionListarGruposAsistencia(): Promise<
  | { ok: true; data: ResultadoGrupos }
  | { ok: false; error: string }
> {
  const g = await exigir("asistencia.ver_grupo");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }

  const supabase = await createClient();
  const [operativo, grupos] = await Promise.all([
    resolverOperativoConParciales(supabase),
    listarGruposAsistencia(supabase),
  ]);

  let periodoOperativo: ResultadoGrupos["periodoOperativo"] = null;
  let parciales: ResultadoGrupos["parciales"] = [];
  let avisoOperativo: string | null = null;
  if (!operativo.ok) {
    avisoOperativo = operativo.error;
  } else {
    periodoOperativo = {
      id: operativo.periodoId,
      nombre: operativo.periodoNombre,
    };
    parciales = operativo.parciales.map((e) => ({
      id: e.id,
      numero: e.numero,
      nombre: e.nombre,
      fecha_inicio: e.fecha_inicio,
      fecha_fin: e.fecha_fin,
    }));
    if (parciales.length === 0) {
      avisoOperativo =
        "El periodo OPERATIVO no tiene parciales activos. Configúralos en /configuracion antes de descargar plantillas.";
    }
  }

  return {
    ok: true,
    data: { grupos, periodoOperativo, parciales, avisoOperativo },
  };
}

export async function actionDescargarPlantillaAsistencia(
  grado: string,
  grupo: string,
  carrera: string,
  materiaClave: string,
  evaluacionId?: string | null,
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
  const g = await exigir("asistencia.subir");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }
  const sesion = g.sesion!;

  if (!materiaClave.trim()) {
    return { ok: false, error: "Selecciona la materia para generar la plantilla." };
  }

  const supabase = await createClient();
  const operativo = await resolverOperativoYValidarParcial(
    supabase,
    evaluacionId ?? null,
  );
  if (!operativo.ok) return { ok: false, error: operativo.error };
  const resultado = await generarPlantillaAsistencia(supabase, {
    grado,
    grupo,
    carrera,
    ciclo: operativo.periodoNombre,
    periodoId: operativo.periodoId,
    evaluacionId: evaluacionId ?? null,
    evaluaciones: operativo.parciales,
    materiaClave,
    profesorClave: sesion.matricula,
    profesorId: sesion.profesorId,
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
  materiaClave: string,
  evaluacionId?: string | null,
): Promise<
  | { ok: true; resumen: ResumenAsistencia; plan: PlanAsistencia }
  | { ok: false; error: string }
> {
  const g = await exigir("asistencia.subir");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }
  const sesion = g.sesion!;

  const entrada = leerFormData(esquemaArchivoAsistencias, formData);
  if (!entrada.ok) return { ok: false, error: entrada.error };
  if (!materiaClave.trim()) {
    return { ok: false, error: "Selecciona la materia para analizar la plantilla." };
  }

  const supabase = await createClient();
  const operativo = await resolverOperativoYValidarParcial(
    supabase,
    evaluacionId ?? null,
  );
  if (!operativo.ok) return { ok: false, error: operativo.error };
  const resultado = await previsualizarAsistencias(supabase, entrada.datos.archivo, {
    grado,
    grupo,
    carrera,
    ciclo: operativo.periodoNombre,
    periodoId: operativo.periodoId,
    evaluacionId: evaluacionId ?? null,
    evaluaciones: operativo.parciales,
    materiaClave,
    profesorClave: sesion.matricula,
    profesorId: sesion.profesorId,
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
  materiaClave: string,
  evaluacionId?: string | null,
): Promise<
  | { ok: true; resumen: ResumenAsistencia }
  | { ok: false; error: string }
> {
  const g = await exigir("asistencia.subir");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para gestionar asistencias." };
  }
  const sesion = g.sesion!;

  const entrada = leerFormData(esquemaArchivoAsistencias, formData);
  if (!entrada.ok) return { ok: false, error: entrada.error };
  if (!materiaClave.trim()) {
    return { ok: false, error: "Selecciona la materia para guardar la plantilla." };
  }

  const supabase = await createClient();
  const operativo = await resolverOperativoYValidarParcial(
    supabase,
    evaluacionId ?? null,
  );
  if (!operativo.ok) return { ok: false, error: operativo.error };
  const resultado = await confirmarAsistencias(supabase, entrada.datos.archivo, {
    grado,
    grupo,
    carrera,
    ciclo: operativo.periodoNombre,
    periodoId: operativo.periodoId,
    evaluacionId: evaluacionId ?? null,
    evaluaciones: operativo.parciales,
    materiaClave,
    profesorClave: sesion.matricula,
    profesorId: sesion.profesorId,
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
  profesorClave?: string;
}): Promise<
  | {
      ok: true;
      dias: DiaEstadoAsistencia[];
      porcentaje: number;
      /** Nombre del periodo OPERATIVO (ciclo global) usado. */
      cicloNombre: string;
      grado: string;
      grupo: string;
      carrera: string;
      parciales: ParcialAsistencia[];
      resumenPorParcial: ResumenPorParcial[];
      conflictosParcial: {
        fecha: string;
        parciales: { id: string; numero: number; nombre: string }[];
      }[];
      diasSinParcial: string[];
    }
  | { ok: false; error: string }
> {
  const g = await exigir("asistencia.ver_alumno");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para consultar asistencias." };
  }
  const sesion = g.sesion!;

  const curp = input.curp.trim().toUpperCase();
  if (!curp) {
    return { ok: false, error: "Indica la CURP del alumno." };
  }

  const supabase = await createClient();

  // Alcance por rol (ortogonal a la capacidad; dice SOBRE QUÉ alumno):
  //  - alumno: solo su propia CURP (sesion.curp).
  //  - tutor: solo CURP de sus alumnos vinculados (relación activa).
  //  - maestro: solo alumnos de grupos donde imparte clase (validado abajo con
  //    la inscripción resuelta del alumno) y SIEMPRE su propio aporte.
  //  - directivo: acceso total (sin restricción de grupo ni profesor).
  if (esRol(sesion.rol, "alumno")) {
    if (!sesion.curp || sesion.curp.trim().toUpperCase() !== curp) {
      return { ok: false, error: "Solo puedes consultar tu propia asistencia." };
    }
  } else if (esRol(sesion.rol, "tutor")) {
    const curps = await listarCurpsDeTutor(supabase, sesion.matricula);
    if (!curps.includes(curp)) {
      return { ok: false, error: "No tienes relación con ese alumno." };
    }
  } else if (!esRol(sesion.rol, "directivo") && !esRol(sesion.rol, "maestro")) {
    return { ok: false, error: "No tienes permiso para consultar asistencias." };
  }

  // CICLO GLOBAL — el ciclo y sus parciales salen del periodo OPERATIVO
  // (obtenerCicloOperativoGlobal), nunca de un parámetro del cliente.
  const operativo = await resolverOperativoConParciales(supabase);
  if (!operativo.ok) return { ok: false, error: operativo.error };

  // Identidad académica SOLO desde la inscripción ACTIVA de la CURP (mismo
  // patrón que actionObtenerHorarioAlumno): el cliente no manda grado/grupo.
  // La consulta vive en lib/escolar/asistencia/asistencias.ts.
  const resuelta = await resolverIdentidadAlumnoInscripcion(supabase, curp);
  if (!resuelta.ok) return { ok: false, error: resuelta.error };
  const { grado, grupo, carrera, periodoId } = resuelta.identidad;
  if (periodoId && periodoId !== operativo.periodoId) {
    return {
      ok: false,
      error:
        "La inscripción del alumno pertenece a un periodo distinto del OPERATIVO actual.",
    };
  }

  // Maestro: debe impartir en el grupo del alumno y ve SOLO su propio aporte.
  // PROMPT C/D: la identidad es SIEMPRE `profesor_id` (PROFESORES.ID); sin ella
  // la sesión es vieja → volver a iniciar sesión (no se consulta por clave).
  if (esRol(sesion.rol, "maestro")) {
    const pidMaestro = Number(sesion.profesorId);
    if (!Number.isInteger(pidMaestro) || pidMaestro <= 0) {
      return {
        ok: false,
        error:
          "Tu sesión no incluye la identidad de profesor (PROFESORES.ID). Vuelve a iniciar sesión para consultar asistencias.",
      };
    }
    const imparte = await profesorImparteEnGrupo(
      supabase,
      grado,
      grupo,
      sesion.profesorId,
    );
    if (!imparte) {
      return {
        ok: false,
        error:
          "Solo puedes consultar asistencias de los grupos donde impartes clase.",
      };
    }
  }

  const dias = await obtenerEstadosAsistenciaAlumno(supabase, {
    curp,
    grado,
    grupo,
    carrera: carrera || undefined,
    ciclo: operativo.periodoNombre,
    periodoId: operativo.periodoId,
    profesorId: esRol(sesion.rol, "maestro") ? sesion.profesorId : null,
  });

  const resumen = resumenAsistenciaPorParcial(
    dias.map((d) => ({ fecha: d.fecha, tipo: d.tipo, estado: d.estado })),
    operativo.parciales,
  );

  return {
    ok: true,
    dias,
    porcentaje: calcularPorcentajeAsistencia(dias),
    cicloNombre: operativo.periodoNombre,
    grado,
    grupo,
    carrera,
    parciales: operativo.parciales,
    resumenPorParcial: resumen.resumenes,
    conflictosParcial: resumen.conflictos,
    diasSinParcial: resumen.diasSinParcial,
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
  const g = await exigir("asistencia.ver_alumno");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para consultar alumnos." };
  }
  const sesion = g.sesion;
  if (!sesion || !esRol(sesion.rol, "tutor")) {
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
  // inscripción que controla el directivo). La consulta vive en la capa de dominio.
  const resuelta = await resolverIdentidadAlumnoInscripcion(supabase, curp);
  if (!resuelta.ok) return { ok: false, error: resuelta.error };
  const { grado, grupo, carrera, periodoId } = resuelta.identidad;

  // Nombre del ciclo con el lector central de periodos (misma fuente única).
  let ciclo = "";
  if (periodoId) {
    const detallePeriodo = await consultarPeriodo(supabase, periodoId);
    ciclo = String(detallePeriodo.periodo?.nombre ?? "");
  }

  // Nombre completo desde ALUMNOS.
  const nombre = await obtenerNombreCompletoAlumno(supabase, curp);
  if (nombre === null) {
    return { ok: false, error: "No se encontró el alumno." };
  }

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
  const g = await exigir("justificacion.solicitar");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para justificar asistencias." };
  }
  const sesion = g.sesion!;

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
    esRol(sesion.rol, "maestro") || esRol(sesion.rol, "directivo");
  if (esRol(sesion.rol, "tutor")) {
    const curps = await listarCurpsDeTutor(supabase, sesion.matricula);
    if (!curps.includes(curp)) {
      return { ok: false, error: "No tienes relación con ese alumno." };
    }
  } else if (esRol(sesion.rol, "alumno")) {
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
  // PROMPT C/D: identidad SIEMPRE por `profesor_id`; sin ella la sesión es vieja
  // → volver a iniciar sesión (nunca se busca por la contraseña).
  if (rolProfesorJustifica) {
    const pidJustifica = Number(sesion.profesorId);
    if (!Number.isInteger(pidJustifica) || pidJustifica <= 0) {
      return {
        ok: false,
        error:
          "Tu sesión no incluye la identidad de profesor (PROFESORES.ID). Vuelve a iniciar sesión para justificar faltas.",
      };
    }
    const imparte = await profesorImparteEnGrupo(
      supabase,
      contexto.grado,
      contexto.grupo,
      sesion.profesorId,
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
  const previa = await estadoJustificacionPrevia(supabase, {
    curp,
    fecha,
    materiaClave: "",
    conColumnaMateria: false,
  });
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
  return guardarJustificacionDiaCompleto(supabase, {
    curp,
    fecha,
    contexto,
    motivo,
    solicitanteTipo,
    solicitanteId,
  });
}

/**
 * BLOQUE 9 (PIEZA 4) + PROMPT C/D — Anula (resta 1 a) el aporte de asistencia
 * que el profesor registró para un alumno en una fecha concreta.
 *
 * SEGURIDAD:
 *   - SOLO rol «maestro» o «directivo».
 *   - El profesor debe impartir en el grupo (profesorImparteEnGrupo).
 *   - La identidad es SIEMPRE `profesor_id` (PROFESORES.ID). `profesor_clave`
 *     ya NO es criterio (regla D-4: la comparten 16 profesores).
 *   - Con atribución por materia puede haber VARIAS filas del mismo
 *     profesor/alumno/día (una por materia). La anulación es del DÍA (resta 1
 *     al total) y se elige la fila con mayor aporte (determinista).
 *   - UPDATE puntual sobre el `id` de esa fila; NUNCA la de otro profesor.
 *   - Resta 1 con piso en 0 (GREATEST(clases_asistidas - 1, 0) emulado con
 *     Math.max; el CHECK `clases_asistidas >= 0` sigue protegiendo).
 */
export async function actionAnularAsistenciaProfesor(input: {
  curp: string;
  fecha: string;
  grado: string;
  grupo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await exigir("asistencia.anular");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para anular asistencias." };
  }
  const sesion = g.sesion!;

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

  // PROMPT C/D — identidad estructural PROFESORES.ID (nunca la contraseña).
  const profesorId = Number(sesion.profesorId);
  if (!Number.isInteger(profesorId) || profesorId <= 0) {
    return {
      ok: false,
      error:
        "Tu sesión no incluye la identidad de profesor (PROFESORES.ID). Vuelve a iniciar sesión para anular asistencias.",
    };
  }
  const imparte = await profesorImparteEnGrupo(
    supabase,
    grado,
    grupo,
    profesorId,
  );
  if (!imparte) {
    return {
      ok: false,
      error: "Solo puedes anular asistencias en los grupos donde impartes clase.",
    };
  }

  // Esquema C aplicado (columna profesor_id en asistencia_alumnos). Sin él no
  // se escribe nada (nada de operaciones por la contraseña).
  if (!(await esquemaAtribucionDisponible(supabase))) {
    return {
      ok: false,
      error:
        "Esquema de atribución pendiente: aplica supabase/agregar-atribucion-profesor-asistencia.sql antes de anular asistencias.",
    };
  }

  // Filas de ESTE profesor para ese alumno/día (puede haber una por materia).
  const aportes = await listarAportesDeProfesorEnDia(supabase, {
    profesorId,
    curp,
    fecha,
    grado,
    grupo,
  });
  if (!aportes.ok) return { ok: false, error: aportes.error };
  const filas = aportes.filas;
  if (filas.length === 0) {
    // Las 81 filas históricas tienen profesor_id NULL (clave compartida): no
    // son atribuibles de forma inequívoca (no se inventa backfill).
    return {
      ok: false,
      error:
        "No hay asistencia registrada por ti ese día para este alumno (las filas históricas sin profesor_id no son atribuibles).",
    };
  }

  // Fila objetivo: la de mayor aporte (resta 1 al total del día).
  const objetivo =
    [...filas].sort(
      (a, b) =>
        (Number(b.clases_asistidas) || 0) - (Number(a.clases_asistidas) || 0),
    )[0] ?? null;
  if (!objetivo || (Number(objetivo.clases_asistidas) || 0) <= 0) {
    return { ok: false, error: "La asistencia de ese día ya está en cero." };
  }

  // Resta 1 con piso en 0 (GREATEST(clases_asistidas - 1, 0)).
  const nuevoValor = Math.max((Number(objetivo.clases_asistidas) || 0) - 1, 0);

  // UPDATE puntual sobre la fila concreta (id) — nunca la de otro profesor.
  return fijarClasesAsistidas(supabase, String(objetivo.id), nuevoValor);
}


/**
 * BLOQUE 9 (PIEZA 4) + PROMPT C (R-4) — Lista los grupos del periodo OPERATIVO
 * que tienen HORARIO oficial cargado, con los alumnos de cada grupo
 * (`obtenerAlumnosDelGrupo`).
 *
 * Alcance (R-4):
 *  - maestro con asignaciones ACTIVAS (asignaciones_profesor) → solo los
 *    grupos de sus asignaciones en el operativo (la atribución por subida de
 *    plantillas hace crecer este conjunto solo);
 *  - maestro sin asignaciones (día 1) o directivo → comportamiento previo:
 *    grupos del operativo con horario cargado.
 *
 * > `resolverAsignacionesProfesor` NO se borra: queda @deprecated para este
 * > uso; R-4 lo reactiva como fuente cuando `asignaciones_profesor` se pueble.
 *
 * PERF: alumnos por grupo en PARALELO (Promise.all). 2 consultas para los
 * grupos con horario (grupos del periodo + distinct grupo_id de horario) y 1
 * extra para las asignaciones activas del maestro.
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
  const g = await exigir("asistencia.ver_grupo");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para consultar alumnos." };
  }
  const sesion = g.sesion!;

  const supabase = await createClient();
  // CICLO GLOBAL — el periodo operativo es la única fuente del ciclo.
  const operativo = await obtenerCicloOperativoGlobal(supabase);
  if (!operativo.ok) {
    return {
      ok: false,
      error: operativo.error ?? "No hay un único ciclo OPERATIVO.",
    };
  }
  if (!operativo.periodo) {
    return {
      ok: false,
      error:
        "No hay ningún periodo OPERATIVO activado. Actívalo en /configuracion para usar este panel.",
    };
  }

  const grupos = await obtenerGruposConCarreraDePeriodo(
    supabase,
    String(operativo.periodo.id),
  );
  if (grupos.length === 0) {
    return { ok: true, grupos: [] };
  }

  // Grupos del periodo con HORARIO cargado (1 consulta; sin N+1 por grupo).
  const conHorario = await listarGrupoIdsConHorario(
    supabase,
    String(operativo.periodo.id),
  );
  const elegibles = grupos.filter((g) => conHorario.has(g.id));
  if (elegibles.length === 0) {
    return {
      ok: false,
      error:
        "El periodo operativo no tiene horario oficial cargado todavía. Carga el horario en /configuracion para consultar alumnos.",
    };
  }

  // PROMPT C (R-4) — cuando el profesor YA tiene asignaciones ACTIVAS
  // (asignaciones_profesor), su alcance se acota a los grupos de esas
  // asignaciones (grupo_materias → grupos). Profesor nuevo sin asignaciones,
  // o con asignaciones fuera del operativo: conserva el comportamiento actual
  // (grupos del operativo con horario).
  let alcance = elegibles;
  if (
    esRol(sesion.rol, "maestro") &&
    sesion.profesorId != null &&
    Number.isInteger(Number(sesion.profesorId)) &&
    Number(sesion.profesorId) > 0
  ) {
    const grupoIdsAsignados = await listarGrupoIdsAsignadosProfesor(
      supabase,
      Number(sesion.profesorId),
    );
    if (grupoIdsAsignados.size > 0) {
      const restringidos = elegibles.filter((g) => grupoIdsAsignados.has(g.id));
      if (restringidos.length > 0) alcance = restringidos;
    }
  }

  const porGrupo = await Promise.all(
    alcance.map(async (g) => ({
      grado: g.grado,
      grupo: g.nombre,
      carrera: g.carreraClave,
      alumnos: (
        await obtenerAlumnosDelGrupo(supabase, g.grado, g.nombre, g.carreraClave)
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
  const g = await exigir("horario.ver_grupo");
  if (!g.ok) {
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
  const g = await exigir("ciclo.ver_operativo");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para consultar asistencias." };
  }
  const supabase = await createClient();
  const r = await obtenerCicloOperativoGlobal(supabase);
  if (!r.ok) return { ok: false, error: r.error ?? "F1: no hay un único ciclo OPERATIVO." };
  return { ok: true, ciclo: r.periodo ? String(r.periodo.nombre) : null };
}

