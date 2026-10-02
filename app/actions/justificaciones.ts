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
 *
 * CIRCUITO (decisión del directivo, 2026-10-01):
 *  - ENVÍAN el padre (tutor) y el directivo: una solicitud por día.
 *  - El PROFESOR la recibe y justifica SOLO materias de ese día: las que él
 *    registró, o las que no tienen a quién atribuirse.
 *  - El DIRECTIVO la acepta (día completo y todas sus materias) o la rechaza.
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
  asegurarBucketJustificaciones,
  crearMensajeJustificacion,
  diaTieneFaltaJustificable,
  esNombreArchivoJustificacionSeguro,
  estadoJustificacionPrevia,
  guardarJustificacionConArchivo,
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
  materiasJustificablesPorProfesor,
  obtenerJustificacion,
  resolverContextoAlumnoDesdeInscripcion,
  resolverTutorDeAlumno,
  urlFirmadaJustificacion,
  validarSeleccionProfesor,
  verificarEsquemaJustificaciones,
  type FilaJustificacion,
  type JustificacionConDetalle,
  type MensajeJustificacionConDetalle,
} from "@/lib/escolar/asistencia/justificaciones";
import {
  cargarDiasAJustificar,
  claveDia,
  historialJustificacionesProfesor,
  registrarJustificacionesDeMateria,
  type JustificacionHistorialProfesor,
  type JustificacionParaProfesor,
} from "@/lib/escolar/asistencia/justificacion-dias";
import { esUuid } from "@/lib/escolar/asistencia/atribucion-profesor";

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
  // Administración escolar LEE las justificaciones del expediente de cualquier
  // alumno (no las resuelve: no tiene `justificacion.resolver`).
  if (esRol(sesion.rol, "administracion")) return true;
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
 * Solicita la justificación de UN DÍA con ARCHIVO ADJUNTO (obligatorio).
 * La envían el padre (alumno vinculado) o el directivo. Validaciones
 * server-side: fecha no futura, una falta registrada que nada cubra todavía, y
 * que no exista ya una solicitud aprobada o rechazada para ese día.
 */
export async function actionSolicitarJustificacionConArchivo(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const g = await exigir("justificacion.solicitar");
  if (!g.ok) return { ok: false, error: "No tienes permiso." };
  const sesion = g.sesion!;

  const entrada = leerFormData(esquemaSolicitarJustificacion(JUSTIFICACION_MAX_BYTES), formData);
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const { curp, fecha, motivo, materia_clave: materiaClave, archivo } = entrada.datos;
  // La solicitud es SIEMPRE del día: qué materias se justifican lo decide el
  // profesor (las suyas) o el directivo (todas). Un cliente viejo que mande
  // materia no se interpreta a medias: se rechaza.
  if (materiaClave) {
    return {
      ok: false,
      error: "La justificación se envía por día; el profesor elige qué materia justificar.",
    };
  }
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

  // Debe haber una falta REGISTRADA (0 o parcial, en cualquier materia) que
  // ninguna justificación aprobada cubra. Mismo desglose que pinta el
  // calendario: lo que el padre ve en rojo o naranja es lo que puede pedir.
  const dias = await cargarDiasAJustificar(supabase, [
    { curp, grado: contexto.grado, grupo: contexto.grupo, fecha },
  ]);
  if (!diaTieneFaltaJustificable(dias.get(claveDia(curp, fecha)) ?? [])) {
    return {
      ok: false,
      error: "Ese día no hay una falta registrada que falte por justificar.",
    };
  }

  const previa = await estadoJustificacionPrevia(supabase, { curp, fecha });
  if (previa && previa.estado === "aprobada") {
    return { ok: false, error: "Ese día ya fue justificado." };
  }
  if (previa && previa.estado === "rechazada") {
    return {
      ok: false,
      error:
        "Esa solicitud ya fue rechazada por la dirección. Contacta con la dirección.",
    };
  }

  // Verificar esquema C4.25 (adjunto), asegurar el bucket y guardar.
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };

  const servicio = createServiceClient();
  if (servicio) await asegurarBucketJustificaciones(servicio);

  // El CHECK de `solicitante_tipo` admite tutor | alumno | profesor: el
  // directivo queda como «profesor», igual que antes de este cambio.
  const solicitanteTipo = esRol(sesion.rol, "tutor")
    ? ("tutor" as const)
    : ("profesor" as const);

  return guardarJustificacionConArchivo(supabase, servicio ?? supabase, archivo, {
    curp,
    fecha,
    contexto,
    motivo,
    solicitanteTipo,
    solicitanteId: sesion.matricula,
  });
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
 * Directivo: APRUEBA la solicitud del día → justifica el DÍA COMPLETO y todas
 * sus materias. No escribe en `asistencia_alumnos`: el efecto es derivado y lo
 * cuenta la lectura del calendario a partir de esta fila `aprobada`.
 */
export async function actionAprobarJustificacion(
  justificacionId: string,
): Promise<
  | { ok: true; mensaje: string }
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
  if (fila.grupo_materia_id) {
    return { ok: false, error: "Esa es la justificación de una materia, no la solicitud del día." };
  }
  if (fila.estado !== "pendiente") {
    return { ok: false, error: `La justificación ya fue ${fila.estado}.` };
  }

  const marcado = await marcarEstadoJustificacion(supabase, justificacionId, {
    estado: "aprobada",
    motivoRechazo: null,
  });
  if (!marcado.ok) return { ok: false, error: marcado.error };

  const tutorId =
    fila.solicitante_tipo === "tutor"
      ? fila.solicitante_id
      : await resolverTutorDeAlumno(supabase, fila.curp_alumno);
  await crearMensajeJustificacion(supabase, {
    justificacionId,
    destinatarioId: tutorId,
    mensaje: `Tu justificación de falta del ${fila.fecha} fue APROBADA: se justificó el día completo.`,
  });

  return { ok: true, mensaje: "Justificación aprobada: se justificó el día completo." };
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

/**
 * Profesor: solicitudes de día PENDIENTES que le tocan, con las materias de ese
 * día que él puede justificar (las suyas, o las que no tienen dueño). Una
 * solicitud sin nada justificable para él no aparece.
 *
 * Rendimiento: las pendientes (1 consulta + nombres) y el desglose de TODOS
 * sus días en consultas fijas (`cargarDiasAJustificar`), sin N+1.
 */
export async function actionListarJustificacionesParaProfesor(): Promise<
  | { ok: true; justificaciones: JustificacionParaProfesor[] }
  | { ok: false; error: string }
> {
  const g = await exigir("justificacion.justificar_clase");
  if (!g.ok) return NO_AUTORIZADO;
  const profesorId = Number(g.sesion!.profesorId);
  if (!Number.isInteger(profesorId) || profesorId <= 0) {
    return {
      ok: false,
      error:
        "Tu sesión no incluye la identidad de profesor (PROFESORES.ID). Vuelve a iniciar sesión.",
    };
  }
  const supabase = await createClient();
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };

  const pendientes = await listarJustificacionesConDetalle(supabase, { eq: "pendiente" });
  if (!pendientes.ok) return pendientes;
  const delDia = pendientes.justificaciones.filter((j) => !j.grupo_materia_id);

  const dias = await cargarDiasAJustificar(
    supabase,
    delDia.map((j) => ({ curp: j.curp_alumno, grado: j.grado, grupo: j.grupo, fecha: j.fecha })),
  );

  const justificaciones: JustificacionParaProfesor[] = [];
  for (const j of delDia) {
    const lineas = dias.get(claveDia(j.curp_alumno, j.fecha)) ?? [];
    const materias = materiasJustificablesPorProfesor(lineas, profesorId);
    if (materias.length === 0) continue;
    justificaciones.push({
      id: j.id,
      curp: j.curp_alumno,
      alumnoNombre: j.alumnoNombre,
      fecha: j.fecha,
      grado: j.grado,
      grupo: j.grupo,
      motivo: j.motivo,
      tieneArchivo: Boolean(j.archivo_path),
      materias: materias.map((m) => ({
        grupoMateriaId: m.grupoMateriaId!,
        nombre: m.nombre,
        clases: m.clases,
        asistidas: m.asistidas ?? 0,
      })),
    });
  }
  return { ok: true, justificaciones };
}

/**
 * Profesor: justifica las MATERIAS elegidas de una solicitud de día. Solo esas
 * clases quedan justificadas (si Matemáticas tuvo 3 ese día, esas 3), no el
 * día entero. El servidor recalcula qué puede justificar: el cliente solo
 * propone ids.
 */
export async function actionJustificarMateriasProfesor(input: {
  justificacionId: string;
  grupoMateriaIds: string[];
}): Promise<{ ok: true; mensaje: string } | { ok: false; error: string }> {
  const g = await exigir("justificacion.justificar_clase");
  if (!g.ok) return NO_AUTORIZADO;
  const sesion = g.sesion!;
  const profesorId = Number(sesion.profesorId);
  if (!Number.isInteger(profesorId) || profesorId <= 0) {
    return {
      ok: false,
      error:
        "Tu sesión no incluye la identidad de profesor (PROFESORES.ID). Vuelve a iniciar sesión.",
    };
  }
  const justificacionId = String(input?.justificacionId ?? "").trim();
  const seleccion = Array.isArray(input?.grupoMateriaIds)
    ? input.grupoMateriaIds.map((x) => String(x ?? "").trim())
    : [];
  if (!esUuid(justificacionId) || seleccion.some((x) => !esUuid(x))) {
    return { ok: false, error: "Solicitud o materia no válida." };
  }

  const supabase = await createClient();
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };

  const r = await leerJustificacionAutorizada(supabase, sesion, justificacionId);
  if (!r.ok) return { ok: false, error: r.error };
  const solicitud = r.fila;
  if (solicitud.grupo_materia_id) {
    return { ok: false, error: "Esa no es una solicitud de día." };
  }
  if (solicitud.estado !== "pendiente") {
    return { ok: false, error: `La solicitud ya fue ${solicitud.estado} por la dirección.` };
  }

  // Recalcular en el servidor qué puede justificar ESTE profesor ese día.
  const dias = await cargarDiasAJustificar(supabase, [
    {
      curp: solicitud.curp_alumno,
      grado: solicitud.grado,
      grupo: solicitud.grupo,
      fecha: solicitud.fecha,
    },
  ]);
  const lineas = dias.get(claveDia(solicitud.curp_alumno, solicitud.fecha)) ?? [];
  const justificables = materiasJustificablesPorProfesor(lineas, profesorId);
  const validacion = validarSeleccionProfesor(justificables, seleccion);
  if (!validacion.ok) return validacion;

  const escrito = await registrarJustificacionesDeMateria(
    supabase,
    solicitud,
    validacion.materias,
    profesorId,
  );
  if (!escrito.ok) return escrito;

  const elegidas = justificables.filter((m) =>
    validacion.materias.includes(m.grupoMateriaId!),
  );
  const detalle = elegidas
    .map((m) => `${m.nombre} (${m.clases} ${m.clases === 1 ? "clase" : "clases"})`)
    .join(", ");
  const tutorId =
    solicitud.solicitante_tipo === "tutor"
      ? solicitud.solicitante_id
      : await resolverTutorDeAlumno(supabase, solicitud.curp_alumno);
  await crearMensajeJustificacion(supabase, {
    justificacionId,
    destinatarioId: tutorId,
    mensaje: `El profesor justificó del ${solicitud.fecha}: ${detalle}. El resto del día lo resuelve la dirección.`,
  });

  return { ok: true, mensaje: `Justificado: ${detalle}.` };
}

/**
 * Profesor: historial de justificaciones que le corresponden —las de sus
 * materias, y las que no tienen a quién atribuirse—, con la hora de envío, la
 * de resolución y la de cada materia justificada. Mismas 100 filas recientes
 * que el historial del directivo.
 */
export async function actionListarHistorialJustificacionesProfesor(): Promise<
  | { ok: true; historial: JustificacionHistorialProfesor[] }
  | { ok: false; error: string }
> {
  const g = await exigir("justificacion.justificar_clase");
  if (!g.ok) return NO_AUTORIZADO;
  const profesorId = Number(g.sesion!.profesorId);
  if (!Number.isInteger(profesorId) || profesorId <= 0) {
    return {
      ok: false,
      error:
        "Tu sesión no incluye la identidad de profesor (PROFESORES.ID). Vuelve a iniciar sesión.",
    };
  }
  const supabase = await createClient();
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };
  return historialJustificacionesProfesor(supabase, profesorId);
}

/* FIN */





