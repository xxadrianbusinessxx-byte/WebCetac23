"use server";

/**
 * C4.25 — SERVER ACTIONS DEL CIRCUITO DE JUSTIFICACIONES DE ASISTENCIA.
 *
 * Reutiliza la tabla `justificaciones_asistencia`, el mecanismo real de
 * asistencia (`asistencia_alumnos`) y la identidad académica SOLO desde la
 * inscripción. El cliente solo propone; el servidor decide (rol, permisos,
 * fechas, faltas reales, estados e integridad de la asistencia).
 *
 * SEGURIDAD:
 *  - La identidad sale SIEMPRE de exigir() (cookie firmada).
 *  - Tutor → sesion.matricula → listarCurpsDeTutor() → alumno autorizado.
 *  - Alumno → solo su propia CURP. Directivo → acceso administrativo.
 *  - Aprobación/rechazo validan de nuevo en servidor.
 */
import { exigir } from "@/lib/auth/exigir";
import { esRol } from "@/lib/auth/permisos";
import type { PortalSessionPayload } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { leerFormData } from "@/lib/validacion/leer-form-data";
import { esquemaSolicitarJustificacion } from "@/lib/validacion/esquemas-puro";
import { listarCurpsDeTutor } from "@/lib/escolar/tutores/tutores";
import {
  aplicarAsistenciaJustificada,
  asegurarBucketJustificaciones,
  bloquesPorMateriaDiaDe,
  crearMensajeJustificacion,
  esNombreArchivoJustificacionSeguro,
  estadoJustificacionPrevia,
  guardarJustificacionConArchivo,
  justificacionesTienenColumnaMateria,
  JUSTIFICACION_MAX_BYTES,
  JUSTIFICACION_MIME_PERMITIDOS,
  JUSTIFICACION_MOTIVO_MAX,
  listarJustificacionesConDetalle,
  listarJustificacionesDeCurp,
  listarJustificacionesDeCurps,
  listarJustificacionesPendientes,
  listarMensajesDeTutorConDetalle,
  listarMensajesJustificacion,
  marcarEstadoJustificacion,
  marcarMensajesJustificacionLeidos,
  materiaTieneClaseEnDia,
  obtenerJustificacion,
  resolverContextoAlumnoDesdeInscripcion,
  resolverTutorDeAlumno,
  resumenClasesYAsistencia,
  urlFirmadaJustificacion,
  verificarEsquemaJustificaciones,
  type FilaJustificacion,
  type JustificacionConDetalle,
  type MensajeJustificacionConDetalle,
} from "@/lib/escolar/asistencia/justificaciones";

/**
 * Los tipos de presentación viven en la capa de dominio (`lib/escolar/asistencia/justificaciones.ts`) y la UI los
 * importa DE AHÍ, con `import type`.
 *
 * NO SE REEXPORTAN DESDE ESTE ARCHIVO, y no es estilo: un `"use server"` solo
 * puede exportar funciones async. Al compilar con Turbopack —lo que hace Vercel—
 * Next trata cada nombre de una lista `export type { … }` como si fuera una
 * Server Action y genera `registerServerReference(ElTipo, …)`: como el tipo no
 * existe en tiempo de ejecución, el módulo de acciones de `/oceano` revienta al
 * cargarse con `ReferenceError` y caen TODAS las acciones de la app con 500.
 * En `next dev --webpack` no pasa, por eso no se vio en local. Lo vigila C14.
 */

const NO_AUTORIZADO = { ok: false, error: "No tienes permiso." } as const;

function esFechaFutura(fecha: string): boolean {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(f.getTime())) return false;
  return f.getTime() > hoy.getTime();
}

/** ¿El tutor (o alumno) puede operar sobre esta CURP? (alcance, no capacidad) */
async function sesionAutorizaCurp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sesion: PortalSessionPayload,
  curp: string,
): Promise<boolean> {
  if (esRol(sesion.rol, "directivo")) return true;
  // PROFESOR (Prompt B): accede desde "Asistencia de mis alumnos" (grupos con
  // horario). El circuito reutiliza las mismas reglas que tutor/alumno.
  if (esRol(sesion.rol, "maestro")) return true;
  if (esRol(sesion.rol, "tutor")) {
    const curps = await listarCurpsDeTutor(supabase, sesion.matricula);
    return curps.includes(curp);
  }
  if (esRol(sesion.rol, "alumno")) {
    return Boolean(
      sesion.curp &&
        sesion.curp.trim().toUpperCase() === curp.trim().toUpperCase(),
    );
  }
  return false;
}

/** Lee una justificación por id (con comprobación de alcance). */
async function leerJustificacionAutorizada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sesion: PortalSessionPayload,
  justificacionId: string,
): Promise<{ ok: true; fila: FilaJustificacion } | { ok: false; error: string }> {
  const r = await obtenerJustificacion(supabase, justificacionId);
  if (!r.ok) return r;
  const fila = r.fila;
  const autorizado = await sesionAutorizaCurp(supabase, sesion, fila.curp_alumno);
  if (!autorizado) {
    return { ok: false, error: "No tienes permiso sobre esta justificación." };
  }
  return { ok: true, fila };
}

/**
 * Solicita una justificación con ARCHIVO ADJUNTO (obligatorio).
 * Tutor (alumno vinculado) o el propio alumno. Validaciones server-side:
 * fecha no futura, falta real registrada, y no existe justificación
 * aprobada/rechazada previa.
 */
export async function actionSolicitarJustificacionConArchivo(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const g = await exigir("justificacion.solicitar");
  if (!g.ok) return { ok: false, error: "No tienes permiso." };
  const sesion = g.sesion!;
  const rolProfesorJustifica =
    esRol(sesion.rol, "maestro") || esRol(sesion.rol, "directivo");

  const entrada = leerFormData(esquemaSolicitarJustificacion(JUSTIFICACION_MAX_BYTES), formData);
  if (!entrada.ok) return { ok: false, error: entrada.error };
  // Prompt B: `materia_clave` es la materia del horario para justificar UNA CLASE (solo
  // profesor/dirección). Vacía = día completo (comportamiento actual) — por eso es
  // opcional en el esquema, y por eso el valor ausente llega como cadena vacía.
  const { curp, fecha, motivo, materia_clave: materiaClave, archivo } = entrada.datos;
  if (motivo.length > JUSTIFICACION_MOTIVO_MAX) {
    return {
      ok: false,
      error: `El motivo no puede superar ${JUSTIFICACION_MOTIVO_MAX} caracteres.`,
    };
  }
  if (!esNombreArchivoJustificacionSeguro(archivo.name)) {
    return {
      ok: false,
      error: "Nombre de archivo no permitido. Usa PDF, PNG o JPG sin rutas.",
    };
  }
  const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeOk =
    JUSTIFICACION_MIME_PERMITIDOS.has(archivo.type) ||
    ["pdf", "png", "jpg", "jpeg"].includes(ext);
  if (!mimeOk) {
    return { ok: false, error: "Tipo de archivo no permitido (PDF, PNG o JPG)." };
  }
  if (esFechaFutura(fecha)) {
    return { ok: false, error: "No se puede justificar una fecha futura." };
  }

  const supabase = await createClient();
  if (!(await sesionAutorizaCurp(supabase, sesion, curp))) {
    return { ok: false, error: "No tienes relación con ese alumno." };
  }

  // Contexto académico SOLO desde la inscripción (sin fallback legacy).
  const contexto = await resolverContextoAlumnoDesdeInscripcion(supabase, curp);
  if (!contexto) {
    return {
      ok: false,
      error: "El alumno no tiene inscripción activa; no se puede justificar.",
    };
  }
  // Debe existir una falta real ese día.
  const { esperadas, asistidas } = await resumenClasesYAsistencia(supabase, {
    curp,
    grado: contexto.grado,
    grupo: contexto.grupo,
    fecha,
  });
  if (esperadas <= 0) {
    return {
      ok: false,
      error: "Ese día no hay clase registrada para el grupo del alumno.",
    };
  }
  if (asistidas >= esperadas) {
    return {
      ok: false,
      error: "El alumno ya tiene asistencia completa ese día.",
    };
  }
  if (!materiaClave && asistidas > 0) {
    return {
      ok: false,
      error:
        "El alumno no tiene falta registrada ese día. La justificación de día completo requiere que no haya asistido a ninguna clase.",
    };
  }

  // Justificación POR CLASE: solo profesor/dirección y materia del horario ESE
  // día. Compatibilidad aditiva: sin la columna (SQL pendiente) el flujo de día
  // completo sigue funcionando intacto.
  const conColumnaMateria = await justificacionesTienenColumnaMateria(supabase);
  if (materiaClave) {
    if (!rolProfesorJustifica) {
      return {
        ok: false,
        error:
          "Solo el profesor o la dirección pueden justificar una clase concreta.",
      };
    }
    if (!conColumnaMateria) {
      return {
        ok: false,
        error:
          "La justificación por clase requiere aplicar supabase/agregar-materia-justificaciones.sql.",
      };
    }
    const dia = await bloquesPorMateriaDiaDe(supabase, curp, fecha);
    if (!dia) {
      return {
        ok: false,
        error: "No se pudo leer el horario del grupo del alumno para esa fecha.",
      };
    }
    if (!materiaTieneClaseEnDia(dia.bloquesPorMateria, materiaClave)) {
      return {
        ok: false,
        error:
          "La materia seleccionada no está programada para el grupo del alumno en esa fecha.",
      };
    }
  }

  // Estado de la justificación previa (misma clave: día completo o materia).
  const previa = await estadoJustificacionPrevia(supabase, {
    curp,
    fecha,
    materiaClave,
    conColumnaMateria,
  });
  if (previa && previa.estado === "aprobada") {
    return { ok: false, error: "Esa falta ya fue aprobada." };
  }
  if (previa && previa.estado === "rechazada") {
    return {
      ok: false,
      error:
        "Esa falta ya fue rechazada por la administración. Contacta con la dirección.",
    };
  }

  // Verificar esquema C4.25 (adjunto), asegurar el bucket y guardar.
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };

  const servicio = createServiceClient();
  if (servicio) await asegurarBucketJustificaciones(servicio);

  const solicitanteTipo =
    esRol(sesion.rol, "tutor")
      ? ("tutor" as const)
      : esRol(sesion.rol, "alumno")
        ? ("alumno" as const)
        : ("profesor" as const);

  // Subida del adjunto + escritura de la fila: I/O del dominio.
  return guardarJustificacionConArchivo(supabase, servicio ?? supabase, archivo, {
    curp,
    fecha,
    contexto,
    motivo,
    materiaClave,
    solicitanteTipo,
    solicitanteId: sesion.matricula,
    conColumnaMateria,
  });
}

export type MateriaJustificableUI = {
  materiaClave: string;
  nombre: string;
  bloques: number;
};

/**
 * Materias programadas del grupo del alumno PARA ESA FECHA (día de semana del
 * horario oficial). El profesor las usa para justificar UNA CLASE concreta
 * (`materia_clave`), no el día entero.
 */
export async function actionObtenerMateriasJustificables(input: {
  curp: string;
  fecha: string;
}): Promise<
  | { ok: true; materias: MateriaJustificableUI[]; usaHorario: boolean }
  | { ok: false; error: string }
> {
  const g = await exigir("justificacion.solicitar");
  if (!g.ok) return NO_AUTORIZADO;
  const sesion = g.sesion!;
  const supabase = await createClient();
  const curp = String(input.curp ?? "").trim().toUpperCase();
  if (!curp) return { ok: false, error: "Indica la CURP del alumno." };
  if (!(await sesionAutorizaCurp(supabase, sesion, curp))) {
    return { ok: false, error: "No tienes permiso para consultar ese alumno." };
  }
  const dia = await bloquesPorMateriaDiaDe(
    supabase,
    curp,
    String(input.fecha ?? "").trim(),
  );
  if (!dia) {
    return { ok: true, materias: [], usaHorario: false };
  }
  const materias: MateriaJustificableUI[] = Object.keys(dia.bloquesPorMateria)
    .sort()
    .map((k) => ({
      materiaClave: k,
      nombre: dia.nombres[k] ?? k,
      bloques: dia.bloquesPorMateria[k] ?? 0,
    }));
  return { ok: true, materias, usaHorario: true };
}

/** Tutor: justificaciones de sus alumnos (pendientes/aprobadas/rechazadas). */
export async function actionListarJustificacionesTutor(): Promise<
  | { ok: true; justificaciones: FilaJustificacion[] }
  | { ok: false; error: string }
> {
  const g = await exigir("justificacion.ver_propias");
  if (!g.ok) return NO_AUTORIZADO;
  const sesion = g.sesion!;
  if (!esRol(sesion.rol, "tutor")) return NO_AUTORIZADO;
  const supabase = await createClient();
  const curps = await listarCurpsDeTutor(supabase, sesion.matricula);
  if (curps.length === 0) return { ok: true, justificaciones: [] };
  return listarJustificacionesDeCurps(supabase, curps);
}

/** Directivo: justificaciones pendientes de revisión. */
export async function actionListarJustificacionesPendientes(): Promise<
  | { ok: true; justificaciones: FilaJustificacion[] }
  | { ok: false; error: string }
> {
  const g = await exigir("justificacion.ver_todas");
  if (!g.ok) return NO_AUTORIZADO;
  const supabase = await createClient();
  return listarJustificacionesPendientes(supabase);
}

/**
 * Directivo: APRUEBA una justificación. Integra la asistencia REAL en
 * `asistencia_alumnos` (marcador __JUSTIFICACION__) con el faltante real de
 * clases del día; el cálculo existente (SUM) lo reconoce como asistido.
 */
export async function actionAprobarJustificacion(
  justificacionId: string,
): Promise<
  | { ok: true; mensaje: string; clasesAplicadas: number }
  | { ok: false; error: string }
> {
  const g = await exigir("justificacion.resolver");
  if (!g.ok) return NO_AUTORIZADO;
  const sesion = g.sesion!;
  const supabase = await createClient();

  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };

  const r = await leerJustificacionAutorizada(supabase, sesion, justificacionId);
  if (!r.ok) return { ok: false, error: r.error };
  const fila = r.fila;
  if (fila.estado !== "pendiente") {
    return { ok: false, error: `La justificación ya fue ${fila.estado}.` };
  }

  const contexto = await resolverContextoAlumnoDesdeInscripcion(
    supabase,
    fila.curp_alumno,
  );
  if (!contexto) {
    return {
      ok: false,
      error: "El alumno no tiene inscripción activa; no se puede aprobar.",
    };
  }
  const horarioDia = await bloquesPorMateriaDiaDe(
    supabase,
    fila.curp_alumno,
    fila.fecha,
  );

  // Marcar aprobada PRIMERO para que el recálculo del total del día incluya
  // esta justificación. El marcador __JUSTIFICACION__ se FIJA al total
  // recalculado (nunca suma de a uno).
  const marcado = await marcarEstadoJustificacion(supabase, justificacionId, {
    estado: "aprobada",
    motivoRechazo: null,
  });
  if (!marcado.ok) return { ok: false, error: marcado.error };

  const aplicado = await aplicarAsistenciaJustificada(supabase, {
    curp: fila.curp_alumno,
    grado: contexto.grado,
    grupo: contexto.grupo,
    fecha: fila.fecha,
    bloquesPorMateriaDia: horarioDia?.bloquesPorMateria ?? {},
    incluirMateria: fila.materia_clave ?? null,
  });
  if (!aplicado.ok) {
    // Revertir el estado: no se deja una justificación aprobada sin integrar.
    await marcarEstadoJustificacion(supabase, justificacionId, {
      estado: "pendiente",
    });
    return { ok: false, error: aplicado.error };
  }

  const tutorId =
    fila.solicitante_tipo === "tutor"
      ? fila.solicitante_id
      : await resolverTutorDeAlumno(supabase, fila.curp_alumno);
  await crearMensajeJustificacion(supabase, {
    justificacionId,
    destinatarioId: tutorId,
    mensaje: `Tu justificación de falta del ${fila.fecha} fue APROBADA.`,
  });

  return {
    ok: true,
    mensaje: "Justificación aprobada y asistencia actualizada.",
    clasesAplicadas: aplicado.clasesAplicadas,
  };
}

/** Directivo: RECHAZA una justificación (motivo obligatorio). */
export async function actionRechazarJustificacion(
  justificacionId: string,
  motivoRechazo: string,
): Promise<{ ok: true; mensaje: string } | { ok: false; error: string }> {
  const g = await exigir("justificacion.resolver");
  if (!g.ok) return NO_AUTORIZADO;
  const sesion = g.sesion!;
  const motivo = motivoRechazo.trim();
  if (!motivo) {
    return { ok: false, error: "El motivo de rechazo es obligatorio." };
  }
  if (motivo.length > JUSTIFICACION_MOTIVO_MAX) {
    return {
      ok: false,
      error: `El motivo no puede superar ${JUSTIFICACION_MOTIVO_MAX} caracteres.`,
    };
  }
  const supabase = await createClient();

  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };

  const r = await leerJustificacionAutorizada(supabase, sesion, justificacionId);
  if (!r.ok) return { ok: false, error: r.error };
  const fila = r.fila;
  if (fila.estado !== "pendiente") {
    return { ok: false, error: `La justificación ya fue ${fila.estado}.` };
  }

  const rechazado = await marcarEstadoJustificacion(supabase, justificacionId, {
    estado: "rechazada",
    motivoRechazo: motivo,
  });
  if (!rechazado.ok) return { ok: false, error: rechazado.error };

  const tutorId =
    fila.solicitante_tipo === "tutor"
      ? fila.solicitante_id
      : await resolverTutorDeAlumno(supabase, fila.curp_alumno);
  await crearMensajeJustificacion(supabase, {
    justificacionId,
    destinatarioId: tutorId,
    mensaje: `Tu justificación de falta del ${fila.fecha} fue RECHAZADA: ${motivo}`,
  });

  return { ok: true, mensaje: "Justificación rechazada." };
}

/** URL firmada del adjunto (tutor vinculado, alumno propio o directivo). */
export async function actionObtenerUrlArchivoJustificacion(
  justificacionId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const g = await exigir("justificacion.ver_propias");
  if (!g.ok) return NO_AUTORIZADO;
  const sesion = g.sesion!;
  const supabase = await createClient();
  const r = await leerJustificacionAutorizada(supabase, sesion, justificacionId);
  if (!r.ok) return { ok: false, error: r.error };
  const fila = r.fila;
  if (!fila.archivo_path) {
    return { ok: false, error: "Esta justificación no tiene adjunto." };
  }
  const storageClient = createServiceClient() ?? supabase;
  return urlFirmadaJustificacion(storageClient, fila.archivo_path);
}

/** Mensajes de una justificación (tutor vinculado, alumno propio o directivo). */
export async function actionListarMensajesJustificacion(
  justificacionId: string,
): Promise<
  | {
      ok: true;
      mensajes: import("@/lib/escolar/asistencia/justificaciones").MensajeJustificacion[];
    }
  | { ok: false; error: string }
> {
  const g = await exigir("justificacion.ver_propias");
  if (!g.ok) return NO_AUTORIZADO;
  const sesion = g.sesion!;
  const supabase = await createClient();
  const r = await leerJustificacionAutorizada(supabase, sesion, justificacionId);
  if (!r.ok) return { ok: false, error: r.error };
  const fila = r.fila;

  const mensajes = await listarMensajesJustificacion(supabase, justificacionId);
  // El tutor marca sus mensajes como leídos al consultarlos.
  if (esRol(sesion.rol, "tutor")) {
    const curps = await listarCurpsDeTutor(supabase, sesion.matricula);
    if (curps.includes(fila.curp_alumno)) {
      await marcarMensajesJustificacionLeidos(supabase, justificacionId, sesion.matricula);
    }
  }
  return { ok: true, mensajes };
}

/**
 * C4.27 — Acciones de LECTURA para la UX.
 * Consumen el mismo backend probado (C4.26-B); no crean estructuras paralelas.
 */

/** Justificaciones de un alumno (tutor vinculado, alumno propio o directivo). */
export async function actionObtenerJustificacionesDeAlumno(
  curp: string,
): Promise<
  | { ok: true; justificaciones: FilaJustificacion[] }
  | { ok: false; error: string }
> {
  const g = await exigir("justificacion.ver_propias");
  if (!g.ok) return NO_AUTORIZADO;
  const sesion = g.sesion!;
  const supabase = await createClient();
  const c = curp.trim().toUpperCase();
  if (!c) return { ok: false, error: "CURP inválida." };
  if (!(await sesionAutorizaCurp(supabase, sesion, c))) return NO_AUTORIZADO;
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };
  return listarJustificacionesDeCurp(supabase, c);
}

/** Tutor: mensajes de justificaciones dirigidos a él, con detalle de la justificación. */
export async function actionListarMensajesDelTutor(): Promise<
  | { ok: true; mensajes: MensajeJustificacionConDetalle[] }
  | { ok: false; error: string }
> {
  const g = await exigir("justificacion.ver_propias");
  if (!g.ok || !g.sesion || !esRol(g.sesion.rol, "tutor")) return NO_AUTORIZADO;
  const sesion = g.sesion;
  const supabase = await createClient();
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };

  return listarMensajesDeTutorConDetalle(supabase, sesion.matricula);
}


/** Directivo: solicitudes pendientes con nombre del alumno (panel administrativo). */
export async function actionListarJustificacionesPendientesConDetalle(): Promise<
  | { ok: true; justificaciones: JustificacionConDetalle[] }
  | { ok: false; error: string }
> {
  const g = await exigir("justificacion.ver_todas");
  if (!g.ok) return NO_AUTORIZADO;
  const supabase = await createClient();
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };
  return listarJustificacionesConDetalle(supabase, { eq: "pendiente" });
}

/** Directivo: historial aprobadas/rechazadas (últimas 100) con nombre del alumno. */
export async function actionListarHistorialJustificaciones(): Promise<
  | { ok: true; justificaciones: JustificacionConDetalle[] }
  | { ok: false; error: string }
> {
  const g = await exigir("justificacion.ver_todas");
  if (!g.ok) return NO_AUTORIZADO;
  const supabase = await createClient();
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };
  return listarJustificacionesConDetalle(supabase, { neq: "pendiente" });
}

/* FIN */





