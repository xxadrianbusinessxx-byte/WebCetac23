import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_CARRERAS,
  TABLA_CLASES_IMPARTIDAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_JUSTIFICACIONES_ASISTENCIA,
  TABLA_MENSAJES_JUSTIFICACION,
  TABLA_TUTOR_ALUMNOS,
} from "./tables";

/**
 * C4.25 — DOMINIO DE JUSTIFICACIONES DE ASISTENCIA (estructura backend).
 *
 * Reutiliza la tabla existente `justificaciones_asistencia` y el mecanismo
 * real de asistencia (`asistencia_alumnos` con SUM por profesor). La
 * aprobación NO pinta la interfaz: agrega el faltante de clases en
 * `asistencia_alumnos` bajo un marcador administrativo de profesor
 * (`__JUSTIFICACION__`), de modo que el cálculo existente
 * (`obtenerEstadosAsistenciaAlumno` → SUM) reconoce el día como asistido.
 *
 * La identidad académica del alumno se resuelve SOLO desde la inscripción
 * (CURP → inscripciones_alumno → grupos → carreras). Sin fallbacks legacy.
 */

/** Bucket de Storage para adjuntos de justificaciones. */
export const BUCKET_JUSTIFICACIONES = "justificaciones";

/** Marcador administrativo en `asistencia_alumnos.profesor_clave`. */
export const PROFESOR_JUSTIFICACION = "__JUSTIFICACION__";

export const JUSTIFICACION_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const JUSTIFICACION_MOTIVO_MAX = 500;

export const JUSTIFICACION_EXTENSIONES_PERMITIDAS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
] as const;

export const JUSTIFICACION_MIME_PERMITIDOS = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

export type EstadoJustificacion = "pendiente" | "aprobada" | "rechazada";

export type FilaJustificacion = {
  id: string;
  curp_alumno: string;
  fecha: string;
  grado: string;
  grupo: string;
  carrera: string;
  motivo: string;
  estado: EstadoJustificacion;
  solicitante_tipo: "tutor" | "alumno";
  solicitante_id: string;
  archivo_path?: string | null;
  archivo_nombre?: string | null;
  archivo_mime?: string | null;
  archivo_size?: number | null;
  motivo_rechazo?: string | null;
  created_at: string;
  updated_at: string;
};

export const ERROR_ESQUEMA_JUSTIFICACIONES_PENDIENTE =
  "Estructura C4.25 pendiente: ejecuta supabase/migrar-justificaciones-v2.sql en Supabase (SQL Editor) antes de usar adjuntos, aprobación/rechazo y mensajes.";

/** ¿Nombre de archivo seguro (sin rutas, sin separadores, extensión permitida)? */
export function esNombreArchivoJustificacionSeguro(
  nombre: string,
): boolean {
  const n = nombre.trim();
  if (!n || n.length > 120) return false;
  if (/[\\/]/.test(n) || n.includes("..") || n.startsWith(".")) return false;
  const ext = n.split(".").pop()?.toLowerCase() ?? "";
  return (JUSTIFICACION_EXTENSIONES_PERMITIDAS as readonly string[]).includes(ext);
}

/** Ruta segura dentro del bucket: justificaciones/{curp}/{fecha}-{ts}.{ext} */
export function rutaStorageJustificacion(
  curp: string,
  fecha: string,
  nombreOriginal: string,
): string {
  const ext =
    nombreOriginal.split(".").pop()?.toLowerCase() || "pdf";
  const ts = Date.now();
  return `justificaciones/${curp}/${fecha}-${ts}.${ext}`;
}

/** Verifica que el esquema C4.25 esté aplicado (columnas y tabla de mensajes). */
export async function verificarEsquemaJustificaciones(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [j, m] = await Promise.all([
    supabase.from(TABLA_JUSTIFICACIONES_ASISTENCIA).select("id, archivo_path").limit(1),
    supabase.from(TABLA_MENSAJES_JUSTIFICACION).select("id").limit(1),
  ]);
  if (j.error || m.error) {
    return { ok: false, error: ERROR_ESQUEMA_JUSTIFICACIONES_PENDIENTE };
  }
  return { ok: true };
}

/**
 * Contexto académico del alumno SOLO desde la inscripción activa.
 * Devuelve { grado, grupo, carrera } o null (sin inscripción → sin identidad).
 */
export async function resolverContextoAlumnoDesdeInscripcion(
  supabase: SupabaseClient,
  curp: string,
): Promise<{ grado: string; grupo: string; carrera: string } | null> {
  const c = curp.trim().toUpperCase();
  if (!c) return null;

  const { data: inscripciones } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("grupo_id")
    .eq("curp", c)
    .eq("activo", true)
    .limit(2);
  if (!inscripciones || inscripciones.length !== 1) return null;

  const { data: grupo } = await supabase
    .from(TABLA_GRUPOS)
    .select("grado, nombre, carrera_id, activo")
    .eq("id", inscripciones[0].grupo_id)
    .eq("activo", true)
    .maybeSingle();
  if (!grupo) return null;

  let carrera = "";
  if (grupo.carrera_id) {
    const { data: carreraRow } = await supabase
      .from(TABLA_CARRERAS)
      .select("clave")
      .eq("id", grupo.carrera_id)
      .maybeSingle();
    carrera = String(carreraRow?.clave ?? "");
  }
  return {
    grado: String(grupo.grado ?? ""),
    grupo: String(grupo.nombre ?? ""),
    carrera,
  };
}

/** Resumen de clases esperadas/asistidas de un alumno en una fecha (grupo). */
export async function resumenClasesYAsistencia(
  supabase: SupabaseClient,
  input: { curp: string; grado: string; grupo: string; fecha: string },
): Promise<{ esperadas: number; asistidas: number }> {
  const [clasesRes, asistRes] = await Promise.all([
    supabase
      .from(TABLA_CLASES_IMPARTIDAS)
      .select("clases")
      .eq("grado", input.grado.trim())
      .eq("grupo", input.grupo.trim())
      .eq("fecha", input.fecha.trim()),
    supabase
      .from(TABLA_ASISTENCIA_ALUMNOS)
      .select("clases_asistidas")
      .eq("curp", input.curp.trim().toUpperCase())
      .eq("grado", input.grado.trim())
      .eq("grupo", input.grupo.trim())
      .eq("fecha", input.fecha.trim()),
  ]);
  const esperadas = (clasesRes.data ?? []).reduce(
    (s, r) => s + (Number(r.clases) || 0),
    0,
  );
  const asistidas = (asistRes.data ?? []).reduce(
    (s, r) => s + (Number(r.clases_asistidas) || 0),
    0,
  );
  return { esperadas, asistidas };
}

/**
 * Aplica la justificación a la asistencia REAL: suma el faltante de clases en
 * `asistencia_alumnos` bajo el marcador `__JUSTIFICACION__`. El total del día
 * (SUM) pasa a ser igual a las clases esperadas → el estado existente lo
 * reconoce como "asistio". Idempotente: si ya está justificado (faltante ≤ 0)
 * no escribe.
 */
export async function aplicarAsistenciaJustificada(
  supabase: SupabaseClient,
  input: { curp: string; grado: string; grupo: string; fecha: string },
): Promise<{ ok: true; clasesAplicadas: number } | { ok: false; error: string }> {
  const { esperadas, asistidas } = await resumenClasesYAsistencia(supabase, input);
  if (esperadas <= 0) {
    return { ok: false, error: "No existe clase registrada para esa fecha; no se puede aprobar." };
  }
  if (asistidas >= esperadas) {
    return { ok: false, error: "El alumno ya tiene asistencia completa ese día." };
  }
  const faltante = esperadas - asistidas;
  const { error } = await supabase.from(TABLA_ASISTENCIA_ALUMNOS).upsert(
    {
      profesor_clave: PROFESOR_JUSTIFICACION,
      curp: input.curp.trim().toUpperCase(),
      grado: input.grado.trim(),
      grupo: input.grupo.trim(),
      fecha: input.fecha.trim(),
      clases_asistidas: faltante,
    },
    { onConflict: "profesor_clave,curp,grado,grupo,fecha" },
  );
  if (error) return { ok: false, error: `No se pudo actualizar la asistencia: ${error.message}` };
  return { ok: true, clasesAplicadas: faltante };
}

/** Destinatario tutor del alumno (tutor principal) o null. */
export async function resolverTutorDeAlumno(
  supabase: SupabaseClient,
  curp: string,
): Promise<string | null> {
  const { data } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select("tutor_id")
    .eq("curp_alumno", curp.trim().toUpperCase())
    .order("tipo_relacion", { ascending: true })
    .limit(1);
  return data?.[0]?.tutor_id ? String(data[0].tutor_id) : null;
}

/** Crea un mensaje administrativo asociado a una justificación. */
export async function crearMensajeJustificacion(
  supabase: SupabaseClient,
  input: {
    justificacionId: string;
    destinatarioId: string | null;
    mensaje: string;
  },
): Promise<{ ok: boolean }> {
  const mensaje = input.mensaje.trim();
  if (!mensaje) return { ok: false };
  const { error } = await supabase.from(TABLA_MENSAJES_JUSTIFICACION).insert({
    justificacion_id: input.justificacionId,
    destinatario_tipo: "tutor",
    destinatario_id: input.destinatarioId ?? null,
    mensaje,
    leido: false,
  });
  return { ok: !error };
}

export type MensajeJustificacion = {
  id: string;
  justificacion_id: string;
  destinatario_tipo: string;
  destinatario_id: string | null;
  mensaje: string;
  leido: boolean;
  created_at: string;
};

export async function listarMensajesJustificacion(
  supabase: SupabaseClient,
  justificacionId: string,
): Promise<MensajeJustificacion[]> {
  const { data, error } = await supabase
    .from(TABLA_MENSAJES_JUSTIFICACION)
    .select("id, justificacion_id, destinatario_tipo, destinatario_id, mensaje, leido, created_at")
    .eq("justificacion_id", justificacionId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as MensajeJustificacion[];
}

/** Marca como leídos los mensajes del tutor sobre una justificación. */
export async function marcarMensajesJustificacionLeidos(
  supabase: SupabaseClient,
  justificacionId: string,
  destinatarioId: string,
): Promise<void> {
  await supabase
    .from(TABLA_MENSAJES_JUSTIFICACION)
    .update({ leido: true })
    .eq("justificacion_id", justificacionId)
    .eq("destinatario_id", destinatarioId)
    .eq("leido", false);
}

export { TABLA_JUSTIFICACIONES_ASISTENCIA };

