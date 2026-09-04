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
 *  - La identidad sale SIEMPRE de obtenerSesionPortal().
 *  - Tutor → sesion.matricula → listarCurpsDeTutor() → alumno autorizado.
 *  - Alumno → solo su propia CURP. Directivo → acceso administrativo.
 *  - Aprobación/rechazo validan de nuevo en servidor.
 */
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listarCurpsDeTutor } from "@/lib/escolar/tutores";
import {
  aplicarAsistenciaJustificada,
  BUCKET_JUSTIFICACIONES,
  crearMensajeJustificacion,
  esNombreArchivoJustificacionSeguro,
  JUSTIFICACION_MAX_BYTES,
  JUSTIFICACION_MIME_PERMITIDOS,
  JUSTIFICACION_MOTIVO_MAX,
  listarMensajesJustificacion,
  marcarMensajesJustificacionLeidos,
  materiaTieneClaseEnDia,
  resolverContextoAlumnoDesdeInscripcion,
  resolverTutorDeAlumno,
  resumenClasesYAsistencia,
  rutaStorageJustificacion,
  TABLA_JUSTIFICACIONES_ASISTENCIA,
  verificarEsquemaJustificaciones,
  type EstadoJustificacion,
  type FilaJustificacion,
} from "@/lib/escolar/justificaciones";
import {
  bloquesDeGrupoEnFecha,
  consultarHorarioAlumno,
} from "@/lib/escolar/horario-semanal";
import { TABLA_ALUMNOS, TABLA_MENSAJES_JUSTIFICACION } from "@/lib/escolar/tables";

const NO_AUTORIZADO = { ok: false, error: "No tienes permiso." } as const;

/**
 * Bloques del grupo del alumno ESE día, agrupados por materia_clave oficial.
 * Devuelve null cuando no hay horario/inscripción consultable.
 */
async function bloquesPorMateriaDiaDe(
  supabase: Awaited<ReturnType<typeof createClient>>,
  curp: string,
  fecha: string,
): Promise<{ bloquesPorMateria: Record<string, number>; nombres: Record<string, string> } | null> {
  const consulta = await consultarHorarioAlumno(supabase, curp);
  if (!consulta) return null;
  const delDia = bloquesDeGrupoEnFecha(consulta.bloques, fecha);
  const bloquesPorMateria: Record<string, number> = {};
  const nombres: Record<string, string> = {};
  for (const b of delDia) {
    const k = String(b.materia_clave ?? "").trim();
    if (!k) continue;
    bloquesPorMateria[k] = (bloquesPorMateria[k] ?? 0) + 1;
    if (!nombres[k]) nombres[k] = String(b.materia_nombre ?? k);
  }
  return { bloquesPorMateria, nombres };
}

/** ¿La tabla ya tiene la columna `materia_clave` (SQL del Prompt B aplicado)? */
async function justificacionesTienenColumnaMateria(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const { error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("materia_clave")
    .limit(1);
  return !error;
}

/** Crea el bucket si no existe (best-effort con el cliente de servicio). */
async function asegurarBucket() {
  const servicio = createServiceClient();
  if (!servicio) return;
  try {
    const { error } = await servicio.storage.createBucket(BUCKET_JUSTIFICACIONES, {
      public: false,
    });
    // El error "already exists" es normal; no se propaga.
    void error;
  } catch {
    /* no-op */
  }
}

function esFechaFutura(fecha: string): boolean {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(f.getTime())) return false;
  return f.getTime() > hoy.getTime();
}

/** ¿El tutor (o alumno) puede operar sobre esta CURP? */
async function sesionAutorizaCurp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sesion: NonNullable<Awaited<ReturnType<typeof obtenerSesionPortal>>>,
  curp: string,
): Promise<boolean> {
  if (sesion.rol === "directivo") return true;
  // PROFESOR (Prompt B): accede desde "Asistencia de mis alumnos" (grupos con
  // horario). El circuito reutiliza las mismas reglas que tutor/alumno.
  if (sesion.rol === "maestro") return true;
  if (sesion.rol === "tutor") {
    const curps = await listarCurpsDeTutor(supabase, sesion.matricula);
    return curps.includes(curp);
  }
  if (sesion.rol === "alumno") {
    return Boolean(
      sesion.curp &&
        sesion.curp.trim().toUpperCase() === curp.trim().toUpperCase(),
    );
  }
  return false;
}

/** Lee una justificación por id (con comprobación de permisos). */
async function leerJustificacionAutorizada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sesion: NonNullable<Awaited<ReturnType<typeof obtenerSesionPortal>>>,
  justificacionId: string,
): Promise<{ ok: true; fila: FilaJustificacion } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("*")
    .eq("id", justificacionId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Justificación no encontrada." };
  const fila = data as FilaJustificacion;
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
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  const rolProfesorJustifica =
    sesion.rol === "maestro" || sesion.rol === "directivo";
  if (
    sesion.rol !== "tutor" &&
    sesion.rol !== "alumno" &&
    !rolProfesorJustifica
  ) {
    return {
      ok: false,
      error:
        "Solo tutores, el propio alumno, el profesor o la dirección pueden justificar faltas.",
    };
  }

  const curp = String(formData.get("curp") ?? "").trim().toUpperCase();
  const fecha = String(formData.get("fecha") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  // Prompt B: materia del horario para justificar UNA CLASE (solo profesor/
  // dirección). Vacía = día completo (comportamiento actual).
  const materiaClave = String(formData.get("materia_clave") ?? "").trim();
  const archivo = formData.get("archivo");
  if (!curp || !fecha || !motivo) {
    return { ok: false, error: "Indica CURP, fecha y motivo." };
  }
  if (motivo.length > JUSTIFICACION_MOTIVO_MAX) {
    return {
      ok: false,
      error: `El motivo no puede superar ${JUSTIFICACION_MOTIVO_MAX} caracteres.`,
    };
  }
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Adjunta un archivo (PDF, PNG o JPG) obligatorio." };
  }
  if (archivo.size > JUSTIFICACION_MAX_BYTES) {
    return { ok: false, error: "El archivo supera el tamaño máximo (5 MB)." };
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
  let qPrevia = supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("id, estado")
    .eq("curp_alumno", curp)
    .eq("fecha", fecha);
  if (conColumnaMateria) {
    qPrevia = materiaClave
      ? qPrevia.eq("materia_clave", materiaClave)
      : qPrevia.is("materia_clave", null);
  }
  const { data: previa } = await qPrevia.maybeSingle();
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

  // Verificar esquema C4.25 (adjunto) y subir el archivo.
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };

  await asegurarBucket();
  const ruta = rutaStorageJustificacion(curp, fecha, archivo.name);
  const storageClient = createServiceClient() ?? supabase;
  const { error: upErr } = await storageClient.storage
    .from(BUCKET_JUSTIFICACIONES)
    .upload(ruta, archivo, {
      contentType: archivo.type || "application/octet-stream",
      upsert: true,
    });
  if (upErr) {
    return { ok: false, error: `No se pudo subir el archivo: ${upErr.message}` };
  }

  const solicitanteTipo =
    sesion.rol === "tutor"
      ? ("tutor" as const)
      : sesion.rol === "alumno"
        ? ("alumno" as const)
        : ("profesor" as const);

  const datosComunes = {
    curp_alumno: curp,
    fecha,
    grado: contexto.grado,
    grupo: contexto.grupo,
    carrera: contexto.carrera,
    motivo,
    estado: "pendiente" as const,
    solicitante_tipo: solicitanteTipo,
    solicitante_id: sesion.matricula,
    archivo_path: ruta,
    archivo_nombre: archivo.name,
    archivo_mime: archivo.type || null,
    archivo_size: archivo.size,
    motivo_rechazo: null,
  };

  const limpiarArchivo = () =>
    storageClient.storage.from(BUCKET_JUSTIFICACIONES).remove([ruta]);

  if (!conColumnaMateria) {
    // Esquema legacy: una justificación por (curp, fecha).
    const { data, error } = await supabase
      .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
      .upsert(datosComunes, { onConflict: "curp_alumno,fecha" })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      await limpiarArchivo();
      return { ok: false, error: "No se pudo guardar la justificación." };
    }
    return { ok: true, id: String(data.id) };
  }

  // Esquema nuevo: la UNIQUE se recrea sobre (curp_alumno, fecha,
  // COALESCE(materia_clave,'')). PostgREST no acepta on_conflict sobre índices
  // de expresión, así que el guardado es select → update/insert con la misma
  // clave (idempotente).
  const valorMateria = materiaClave ? materiaClave : null;
  let qExistente = supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("id")
    .eq("curp_alumno", curp)
    .eq("fecha", fecha);
  qExistente = valorMateria
    ? qExistente.eq("materia_clave", valorMateria)
    : qExistente.is("materia_clave", null);
  const { data: existente } = await qExistente.maybeSingle();
  if (existente) {
    const { error } = await supabase
      .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
      .update({ ...datosComunes, materia_clave: valorMateria })
      .eq("id", String(existente.id));
    if (error) {
      await limpiarArchivo();
      return { ok: false, error: "No se pudo guardar la justificación." };
    }
    return { ok: true, id: String(existente.id) };
  }
  const { data: nueva, error: errNueva } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .insert({ ...datosComunes, materia_clave: valorMateria })
    .select("id")
    .maybeSingle();
  if (errNueva || !nueva) {
    await limpiarArchivo();
    return { ok: false, error: "No se pudo guardar la justificación." };
  }
  return { ok: true, id: String(nueva.id) };
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
  const sesion = await obtenerSesionPortal();
  if (!sesion) return NO_AUTORIZADO;
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
  const sesion = await obtenerSesionPortal();
  if (!sesion || sesion.rol !== "tutor") return NO_AUTORIZADO;
  const supabase = await createClient();
  const curps = await listarCurpsDeTutor(supabase, sesion.matricula);
  if (curps.length === 0) return { ok: true, justificaciones: [] };
  const { data, error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("*")
    .in("curp_alumno", curps)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, justificaciones: (data ?? []) as FilaJustificacion[] };
}

/** Directivo: justificaciones pendientes de revisión. */
export async function actionListarJustificacionesPendientes(): Promise<
  | { ok: true; justificaciones: FilaJustificacion[] }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("*")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, justificaciones: (data ?? []) as FilaJustificacion[] };
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
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
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
  const { error: upErr } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .update({ estado: "aprobada", motivo_rechazo: null })
    .eq("id", justificacionId);
  if (upErr) return { ok: false, error: upErr.message };

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
    await supabase
      .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
      .update({ estado: "pendiente" })
      .eq("id", justificacionId);
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
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
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

  const { error: upErr } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .update({ estado: "rechazada", motivo_rechazo: motivo })
    .eq("id", justificacionId);
  if (upErr) return { ok: false, error: upErr.message };

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
  const sesion = await obtenerSesionPortal();
  if (!sesion) return NO_AUTORIZADO;
  const supabase = await createClient();
  const r = await leerJustificacionAutorizada(supabase, sesion, justificacionId);
  if (!r.ok) return { ok: false, error: r.error };
  const fila = r.fila;
  if (!fila.archivo_path) {
    return { ok: false, error: "Esta justificación no tiene adjunto." };
  }
  const storageClient = createServiceClient() ?? supabase;
  const { data, error: sErr } = await storageClient.storage
    .from(BUCKET_JUSTIFICACIONES)
    .createSignedUrl(fila.archivo_path, 60);
  if (sErr || !data?.signedUrl) {
    return { ok: false, error: "No se pudo generar la URL del archivo." };
  }
  return { ok: true, url: data.signedUrl };
}

/** Mensajes de una justificación (tutor vinculado, alumno propio o directivo). */
export async function actionListarMensajesJustificacion(
  justificacionId: string,
): Promise<
  | {
      ok: true;
      mensajes: import("@/lib/escolar/justificaciones").MensajeJustificacion[];
    }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return NO_AUTORIZADO;
  const supabase = await createClient();
  const r = await leerJustificacionAutorizada(supabase, sesion, justificacionId);
  if (!r.ok) return { ok: false, error: r.error };
  const fila = r.fila;

  const mensajes = await listarMensajesJustificacion(supabase, justificacionId);
  // El tutor marca sus mensajes como leídos al consultarlos.
  if (sesion.rol === "tutor") {
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
  const sesion = await obtenerSesionPortal();
  if (!sesion) return NO_AUTORIZADO;
  const supabase = await createClient();
  const c = curp.trim().toUpperCase();
  if (!c) return { ok: false, error: "CURP inválida." };
  if (!(await sesionAutorizaCurp(supabase, sesion, c))) return NO_AUTORIZADO;
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };
  const { data, error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("*")
    .eq("curp_alumno", c)
    .order("fecha", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, justificaciones: (data ?? []) as FilaJustificacion[] };
}

/** Tutor: mensajes de justificaciones dirigidos a él, con detalle de la justificación. */
export type MensajeJustificacionConDetalle = {
  id: string;
  justificacionId: string;
  mensaje: string;
  leido: boolean;
  created_at: string;
  justificacion: {
    fecha: string;
    curpAlumno: string;
    estado: EstadoJustificacion;
    motivoRechazo: string | null;
  } | null;
};

export async function actionListarMensajesDelTutor(): Promise<
  | { ok: true; mensajes: MensajeJustificacionConDetalle[] }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (!sesion || sesion.rol !== "tutor") return NO_AUTORIZADO;
  const supabase = await createClient();
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };

  const { data: mensajes, error } = await supabase
    .from(TABLA_MENSAJES_JUSTIFICACION)
    .select("id, justificacion_id, mensaje, leido, created_at")
    .eq("destinatario_tipo", "tutor")
    .eq("destinatario_id", sesion.matricula)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const justIds = [...new Set((mensajes ?? []).map((m) => m.justificacion_id))];
  const { data: justs } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("id, curp_alumno, fecha, estado, motivo_rechazo")
    .in("id", justIds.length ? justIds : ["00000000-0000-0000-0000-000000000000"]);
  const justPorId = new Map((justs ?? []).map((j) => [j.id, j]));

  // Marcar leídos con el mecanismo existente (directivo → tutor).
  for (const id of justIds) {
    await marcarMensajesJustificacionLeidos(supabase, id, sesion.matricula);
  }

  return {
    ok: true,
    mensajes: (mensajes ?? []).map((m) => {
      const j = justPorId.get(m.justificacion_id);
      return {
        id: m.id,
        justificacionId: m.justificacion_id,
        mensaje: m.mensaje,
        leido: true,
        created_at: m.created_at,
        justificacion: j
          ? {
              fecha: j.fecha,
              curpAlumno: j.curp_alumno,
              estado: j.estado as EstadoJustificacion,
              motivoRechazo: j.motivo_rechazo,
            }
          : null,
      };
    }),
  };
}


/** Nombres completos de alumnos por CURP (presentación del panel directivo). */
async function obtenerNombresAlumnos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  curps: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (curps.length === 0) return mapa;
  const { data } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO")
    .in("CURP", curps);
  for (const a of data ?? []) {
    const curp = String(a.CURP ?? "").trim().toUpperCase();
    if (!curp) continue;
    const nombre = [a.NOMBRE, a.P_APELLIDO, a.S_APELLIDO]
      .filter((v) => typeof v === "string" && v.trim())
      .join(" ")
      .trim();
    mapa.set(curp, nombre);
  }
  return mapa;
}

export type JustificacionConDetalle = FilaJustificacion & {
  alumnoNombre: string;
};

async function listarJustificacionesConDetalle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  estado: { eq?: "pendiente"; neq?: "pendiente" },
): Promise<
  | { ok: true; justificaciones: JustificacionConDetalle[] }
  | { ok: false; error: string }
> {
  let q = supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("*")
    .order("created_at", { ascending: false });
  if (estado.eq) q = q.eq("estado", estado.eq);
  if (estado.neq) q = q.neq("estado", estado.neq);
  const { data, error } = await q.limit(100);
  if (error) return { ok: false, error: error.message };
  const curps = [
    ...new Set(
      (data ?? []).map((j) => String(j.curp_alumno).trim().toUpperCase()),
    ),
  ];
  const nombres = await obtenerNombresAlumnos(supabase, curps);
  return {
    ok: true,
    justificaciones: (data ?? []).map((j) => ({
      ...j,
      alumnoNombre:
        nombres.get(String(j.curp_alumno).trim().toUpperCase()) ?? "",
    })) as JustificacionConDetalle[],
  };
}

/** Directivo: solicitudes pendientes con nombre del alumno (panel administrativo). */
export async function actionListarJustificacionesPendientesConDetalle(): Promise<
  | { ok: true; justificaciones: JustificacionConDetalle[] }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
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
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  const esquema = await verificarEsquemaJustificaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };
  return listarJustificacionesConDetalle(supabase, { neq: "pendiente" });
}

/* FIN */





