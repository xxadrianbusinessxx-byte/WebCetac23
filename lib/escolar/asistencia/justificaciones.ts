import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TABLA_CARRERAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_JUSTIFICACIONES_ASISTENCIA,
  TABLA_MENSAJES_JUSTIFICACION,
  TABLA_TUTOR_ALUMNOS,
} from "../tables.ts";
import { listarNombresCompletosPorCurp } from "../alumno/alumnos.ts";

// Re-export del módulo puro (PROMPT Q · R-1). Se importan aparte los que este
// archivo sigue usando.
import { rutaStorageJustificacion } from "./justificaciones-puro.ts";
export {
  JUSTIFICACION_EXTENSIONES_PERMITIDAS,
  calcularClasesJustificadasPorDia,
  esNombreArchivoJustificacionSeguro,
  materiaTieneClaseEnDia,
  rutaStorageJustificacion,
  diaTieneFaltaJustificable,
  materiasJustificablesPorProfesor,
  validarSeleccionProfesor,
} from "./justificaciones-puro.ts";
export type {
  ClasesJustificadasPorDiaInput,
  LineaJustificable,
} from "./justificaciones-puro.ts";

/**
 * C4.25 — DOMINIO DE JUSTIFICACIONES DE ASISTENCIA (estructura backend).
 *
 * Circuito (decisión del directivo, 2026-10-01):
 *   · el PADRE —o el directivo— envía UNA solicitud por día (fila con
 *     `grupo_materia_id` NULL), con motivo y adjunto;
 *   · el PROFESOR la recibe y justifica solo materias de ese día: cada una es
 *     una fila propia, ya `aprobada`, con su `grupo_materia_id`;
 *   · el DIRECTIVO la acepta (día completo) o la rechaza.
 *
 * El efecto sobre la asistencia es DERIVADO, nunca almacenado: la lectura
 * (`obtenerEstadosAsistenciaAlumno` → `resolverDiaMateria`) cruza las
 * justificaciones APROBADAS y cuenta como asistido el faltante de lo
 * justificado. Ya no se escribe el marcador `__JUSTIFICACION__` en
 * `asistencia_alumnos` (había 0 filas al retirarlo; la lectura lo sigue
 * entendiendo por compatibilidad).
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
  solicitante_tipo: "tutor" | "alumno" | "profesor";
  solicitante_id: string;
  archivo_path?: string | null;
  archivo_nombre?: string | null;
  archivo_mime?: string | null;
  archivo_size?: number | null;
  motivo_rechazo?: string | null;
  created_at: string;
  updated_at: string;
  /** Justificación POR CLASE (PROMPT-1/T1): `grupo_materia_id` (uuid) de la
   *  materia en el ciclo; null = día completo. */
  grupo_materia_id?: string | null;
  /** LEGACY (Prompt B, SUPERSEDIDO por PROMPT-1): columna de texto que nunca se
   *  aplicó en producción. Se conserva por compatibilidad de lecturas viejas;
   *  las escrituras nuevas NO usan este campo. */
  materia_clave?: string | null;
};


export const ERROR_ESQUEMA_JUSTIFICACIONES_PENDIENTE =
  "Estructura C4.25 pendiente: ejecuta supabase/migrar-justificaciones-v2.sql en Supabase (SQL Editor) antes de usar adjuntos, aprobación/rechazo y mensajes.";


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

/* ---------------------------------------------------------------------------
 * REPOSITORIO / I-O DEL CIRCUITO
 * ---------------------------------------------------------------------------
 * Bajado de `app/actions/justificaciones.ts` (PROMPT E · R-1). La Server Action
 * sigue validando la SESIÓN y el ALCANCE (rol + relación con el CURP) y
 * delegando; ninguna función de aquí decide autorización. El cliente se crea en
 * la action (incluido el de service role para Storage) y se recibe como
 * parámetro, que es la convención de `lib/escolar/`.
 */

/**
 * Crea el bucket de adjuntos si no existe (best-effort). Recibe el cliente de
 * servicio ya construido: crear clientes es responsabilidad de la action.
 */
export async function asegurarBucketJustificaciones(
  servicio: SupabaseClient,
): Promise<void> {
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

/** Sube el adjunto al bucket privado en la ruta ya calculada. */
export async function subirArchivoJustificacion(
  cliente: SupabaseClient,
  ruta: string,
  archivo: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await cliente.storage
    .from(BUCKET_JUSTIFICACIONES)
    .upload(ruta, archivo, {
      contentType: archivo.type || "application/octet-stream",
      upsert: true,
    });
  if (error) {
    return { ok: false, error: `No se pudo subir el archivo: ${error.message}` };
  }
  return { ok: true };
}

/** Borra un adjunto del bucket (limpieza cuando el guardado falla). */
export async function eliminarArchivoJustificacion(
  cliente: SupabaseClient,
  ruta: string,
): Promise<void> {
  await cliente.storage.from(BUCKET_JUSTIFICACIONES).remove([ruta]);
}

/** URL firmada y temporal (60 s) del adjunto. */
export async function urlFirmadaJustificacion(
  cliente: SupabaseClient,
  ruta: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { data, error } = await cliente.storage
    .from(BUCKET_JUSTIFICACIONES)
    .createSignedUrl(ruta, 60);
  if (error || !data?.signedUrl) {
    return { ok: false, error: "No se pudo generar la URL del archivo." };
  }
  return { ok: true, url: data.signedUrl };
}

/**
 * Justificación por id (lectura cruda). El ALCANCE sobre su CURP lo valida la
 * action con `sesionAutorizaCurp` antes de usar el resultado.
 */
export async function obtenerJustificacion(
  supabase: SupabaseClient,
  justificacionId: string,
): Promise<{ ok: true; fila: FilaJustificacion } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("*")
    .eq("id", justificacionId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Justificación no encontrada." };
  return { ok: true, fila: data as FilaJustificacion };
}

/**
 * Estado de la SOLICITUD del día (`grupo_materia_id` NULL) para esa CURP y
 * fecha; `null` si no existe. Las filas por materia que crea el profesor no
 * cuentan: son resoluciones, no solicitudes.
 */
export async function estadoJustificacionPrevia(
  supabase: SupabaseClient,
  input: { curp: string; fecha: string },
): Promise<{ id: string; estado: EstadoJustificacion } | null> {
  const { data } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("id, estado")
    .eq("curp_alumno", input.curp)
    .eq("fecha", input.fecha)
    .is("grupo_materia_id", null)
    .maybeSingle();
  if (!data) return null;
  return { id: String(data.id), estado: data.estado as EstadoJustificacion };
}

/** Datos de una solicitud de justificación con adjunto (ya validados). */
export type EntradaJustificacionConArchivo = {
  curp: string;
  fecha: string;
  contexto: { grado: string; grupo: string; carrera: string };
  motivo: string;
  solicitanteTipo: "tutor" | "alumno" | "profesor";
  solicitanteId: string;
};

/**
 * Guarda la SOLICITUD del día con su adjunto: sube el archivo, escribe la fila
 * y, si el guardado falla, borra el archivo recién subido (sin huérfanos).
 *
 * La unicidad la imponen dos índices únicos PARCIALES
 * (`agregar-grupo-materia-justificaciones.sql`, aplicado): uno por
 * (curp_alumno, fecha) WHERE grupo_materia_id IS NULL y otro por materia.
 * PostgreSQL no infiere un índice parcial desde el `on_conflict` de PostgREST
 * (es el fallo que C16 vigila: devolvía 42P10 y la solicitud no se guardaba),
 * así que se resuelve con select → update / insert sobre la misma clave.
 */
export async function guardarJustificacionConArchivo(
  supabase: SupabaseClient,
  almacen: SupabaseClient,
  archivo: File,
  input: EntradaJustificacionConArchivo,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ruta = rutaStorageJustificacion(input.curp, input.fecha, archivo.name);
  const subida = await subirArchivoJustificacion(almacen, ruta, archivo);
  if (!subida.ok) return subida;

  const datos = {
    curp_alumno: input.curp,
    fecha: input.fecha,
    grado: input.contexto.grado,
    grupo: input.contexto.grupo,
    carrera: input.contexto.carrera,
    motivo: input.motivo,
    estado: "pendiente" as const,
    solicitante_tipo: input.solicitanteTipo,
    solicitante_id: input.solicitanteId,
    archivo_path: ruta,
    archivo_nombre: archivo.name,
    archivo_mime: archivo.type || null,
    archivo_size: archivo.size,
    motivo_rechazo: null,
    grupo_materia_id: null,
  };

  const previa = await estadoJustificacionPrevia(supabase, input);
  const escritura = previa
    ? await supabase
        .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
        .update(datos)
        .eq("id", previa.id)
        .select("id")
        .maybeSingle()
    : await supabase
        .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
        .insert(datos)
        .select("id")
        .maybeSingle();
  if (escritura.error || !escritura.data) {
    await eliminarArchivoJustificacion(almacen, ruta);
    return { ok: false, error: "No se pudo guardar la justificación." };
  }
  return { ok: true, id: String(escritura.data.id) };
}

/**
 * Marca el estado de una justificación. `motivoRechazo` solo se escribe si se
 * pasa explícitamente: la reversión a `pendiente` no debe tocarlo.
 */
export async function marcarEstadoJustificacion(
  supabase: SupabaseClient,
  justificacionId: string,
  cambios: { estado: EstadoJustificacion; motivoRechazo?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload: Record<string, unknown> = { estado: cambios.estado };
  if (cambios.motivoRechazo !== undefined) {
    payload.motivo_rechazo = cambios.motivoRechazo;
  }
  const { error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .update(payload)
    .eq("id", justificacionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Justificaciones de VARIOS CURP (tutor), de la más reciente a la más antigua. */
export async function listarJustificacionesDeCurps(
  supabase: SupabaseClient,
  curps: readonly string[],
): Promise<
  { ok: true; justificaciones: FilaJustificacion[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("*")
    .in("curp_alumno", [...curps])
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, justificaciones: (data ?? []) as FilaJustificacion[] };
}

/** Justificaciones de UN alumno, por fecha ascendente. */
export async function listarJustificacionesDeCurp(
  supabase: SupabaseClient,
  curp: string,
): Promise<
  { ok: true; justificaciones: FilaJustificacion[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("*")
    .eq("curp_alumno", curp)
    .order("fecha", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, justificaciones: (data ?? []) as FilaJustificacion[] };
}

/** Justificaciones PENDIENTES de revisión (panel directivo). */
export async function listarJustificacionesPendientes(
  supabase: SupabaseClient,
): Promise<
  { ok: true; justificaciones: FilaJustificacion[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("*")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, justificaciones: (data ?? []) as FilaJustificacion[] };
}

/** Justificación con el nombre del alumno (presentación del panel). */
export type JustificacionConDetalle = FilaJustificacion & {
  alumnoNombre: string;
};

/**
 * Justificaciones (máx. 100) filtradas por estado, con el nombre del alumno.
 * Los nombres salen de UNA consulta a ALUMNOS por CURP (sin N+1).
 */
export async function listarJustificacionesConDetalle(
  supabase: SupabaseClient,
  estado: { eq?: EstadoJustificacion; neq?: EstadoJustificacion },
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
    ...new Set((data ?? []).map((j) => String(j.curp_alumno).trim().toUpperCase())),
  ];
  const nombres = await listarNombresCompletosPorCurp(supabase, curps);
  return {
    ok: true,
    justificaciones: (data ?? []).map((j) => ({
      ...j,
      alumnoNombre: nombres.get(String(j.curp_alumno).trim().toUpperCase()) ?? "",
    })) as JustificacionConDetalle[],
  };
}

/** Mensaje de justificación con el detalle de su justificación (panel del tutor). */
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

/**
 * Mensajes dirigidos a un destinatario (hoy: tutor) con el detalle de la
 * justificación, de la más reciente a la más antigua. Al consultarlos se marcan
 * como leídos con el mecanismo existente (`marcarMensajesJustificacionLeidos`),
 * igual que antes hacía la action.
 */
export async function listarMensajesDeTutorConDetalle(
  supabase: SupabaseClient,
  destinatarioId: string,
): Promise<
  | { ok: true; mensajes: MensajeJustificacionConDetalle[] }
  | { ok: false; error: string }
> {
  const { data: mensajes, error } = await supabase
    .from(TABLA_MENSAJES_JUSTIFICACION)
    .select("id, justificacion_id, mensaje, leido, created_at")
    .eq("destinatario_tipo", "tutor")
    .eq("destinatario_id", destinatarioId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const justIds = [...new Set((mensajes ?? []).map((m) => m.justificacion_id))];
  const { data: justs } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("id, curp_alumno, fecha, estado, motivo_rechazo")
    .in("id", justIds.length ? justIds : ["00000000-0000-0000-0000-000000000000"]);
  const justPorId = new Map((justs ?? []).map((j) => [j.id, j]));

  for (const id of justIds) {
    await marcarMensajesJustificacionLeidos(supabase, id, destinatarioId);
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

/** Nombres completos de ALUMNOS por CURP (re-exportado para el panel directivo). */
export { listarNombresCompletosPorCurp };

