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
} from "../tables";
import { listarNombresCompletosPorCurp } from "../alumno/alumnos";
import {
  bloquesDeGrupoEnFecha,
  consultarHorarioAlumno,
} from "../horario/horario-semanal";

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

/**
 * JUSTIFICACIÓN POR CLASE — núcleo puro.
 *
 * - `bloquesPorMateria`: bloques del grupo ESE día agrupados por materia_clave
 *   (origen: horario_semanal oficial, no la configuración del profesor).
 * - `materias`: materias justificadas y APROBADAS del día (`null`/"" significa
 *   justificación de día completo, que conserva el comportamiento actual).
 * - El total NUNCA supera el faltante (esperadas − asistidas).
 */
export type ClasesJustificadasPorDiaInput = {
  bloquesPorMateria: Record<string, number>;
  materias: Array<string | null>;
  faltante: number;
};

/** ¿La materia tiene al menos un bloque programado ESE día? (validación server). */
export function materiaTieneClaseEnDia(
  bloquesPorMateria: Record<string, number>,
  materiaClave: string | null | undefined,
): boolean {
  const k = String(materiaClave ?? "").trim();
  if (!k) return false;
  return (Number(bloquesPorMateria[k]) || 0) > 0;
}

/**
 * Total de clases justificadas para un día (derivado, nunca almacenado).
 *  - día completo (alguna entrada null/"") → el faltante entero;
 *  - por clase → suma de bloques de cada materia aprobada, con tope en faltante;
 *  - una materia sin bloques ese día aporta 0 (se rechaza antes en el servidor).
 */
export function calcularClasesJustificadasPorDia(
  input: ClasesJustificadasPorDiaInput,
): number {
  const faltante = Math.max(Number(input.faltante) || 0, 0);
  const materias = Array.isArray(input.materias) ? input.materias : [];
  // Día completo (null/""): cualquier entrada de día completo domina y aplica
  // el faltante entero (comportamiento actual preservado).
  if (materias.some((m) => m == null || String(m).trim() === "")) {
    return faltante;
  }
  // Dedupe por materia: reaplicar la misma justificación NO acumula (idempotente).
  const claves = new Set<string>();
  for (const m of materias) {
    const k = String(m ?? "").trim();
    if (!k) continue;
    claves.add(k);
  }
  let total = 0;
  for (const k of claves) {
    total += Number(input.bloquesPorMateria[k]) || 0;
  }
  return Math.min(total, faltante);
}

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
/**
 * Aplica la justificación a la asistencia REAL: FIJA (UPSERT bajo el marcador
 * `__JUSTIFICACION__`) el total de clases justificadas del día = suma de bloques
 * de cada materia APROBADA (día completo = faltante entero), con tope en el
 * faltante. El onConflict reemplaza la fila, así que el valor es SIEMPRE el
 * total recalculado: reaprobar/re-ejecutar es idempotente (no acumula).
 */
export async function aplicarAsistenciaJustificada(
  supabase: SupabaseClient,
  input: {
    curp: string;
    grado: string;
    grupo: string;
    fecha: string;
    /** Bloques del grupo ESE día por materia (origen: horario_semanal). */
    bloquesPorMateriaDia?: Record<string, number>;
    /** Materia de la justificación que se está aprobando (si aún no figura aprobada). */
    incluirMateria?: string | null;
  },
): Promise<{ ok: true; clasesAplicadas: number } | { ok: false; error: string }> {
  const { esperadas, asistidas } = await resumenClasesYAsistencia(supabase, input);
  if (esperadas <= 0) {
    return { ok: false, error: "No existe clase registrada para esa fecha; no se puede aprobar." };
  }
  if (asistidas >= esperadas) {
    return { ok: false, error: "El alumno ya tiene asistencia completa ese día." };
  }
  const faltante = esperadas - asistidas;

  // Justificaciones APROBADAS del día (el UPSERT del marcador siempre es el
  // total recalculado; nunca un incremento).
  // Compatibilidad aditiva (PROMPT-1/T1): la identidad de la clase es
  // `grupo_materia_id` (uuid). Mientras el SQL
  // `supabase/agregar-grupo-materia-justificaciones.sql` no esté aplicado, la
  // columna no existe y toda justificación se trata como de día completo.
  let materias: Array<string | null> = [];
  try {
    const { data: aprobadas, error: eA } = await supabase
      .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
      .select("grupo_materia_id")
      .eq("curp_alumno", input.curp.trim().toUpperCase())
      .eq("fecha", input.fecha.trim())
      .eq("estado", "aprobada");
    if (eA) {
      if (/grupo_materia_id/i.test(String(eA.message ?? ""))) {
        materias = [null];
      } else {
        return { ok: false, error: `No se pudieron leer las justificaciones: ${eA.message}` };
      }
    } else {
      materias = (aprobadas ?? []).map((j) =>
        j.grupo_materia_id ? String(j.grupo_materia_id) : null,
      );
    }
  } catch {
    materias = [null];
  }
  if (input.incluirMateria !== undefined) {
    const k = input.incluirMateria == null ? null : String(input.incluirMateria);
    const ya = materias.some((m) =>
      k === null ? m === null : m !== null && m === k,
    );
    if (!ya) materias.push(k);
  }

  const total = calcularClasesJustificadasPorDia({
    bloquesPorMateria: input.bloquesPorMateriaDia ?? {},
    materias,
    faltante,
  });
  if (total <= 0) {
    return {
      ok: false,
      error:
        "La justificación no aporta clases a ese día. Revisa el horario del grupo (materia no programada) o la falta registrada.",
    };
  }

  const { error } = await supabase.from(TABLA_ASISTENCIA_ALUMNOS).upsert(
    {
      profesor_clave: PROFESOR_JUSTIFICACION,
      curp: input.curp.trim().toUpperCase(),
      grado: input.grado.trim(),
      grupo: input.grupo.trim(),
      fecha: input.fecha.trim(),
      clases_asistidas: total,
    },
    { onConflict: "profesor_clave,curp,grado,grupo,fecha" },
  );
  if (error) {
    return { ok: false, error: `No se pudo actualizar la asistencia: ${error.message}` };
  }
  return { ok: true, clasesAplicadas: total };
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

/** ¿La tabla ya tiene la columna `materia_clave` (SQL del Prompt B aplicado)? */
export async function justificacionesTienenColumnaMateria(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("materia_clave")
    .limit(1);
  return !error;
}

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
 * Estado de la justificación PREVIA con la misma clave: día completo o la
 * materia concreta. `null` si no existe. Con el esquema legacy (sin la columna
 * `materia_clave`) la clave es solo (curp, fecha).
 */
export async function estadoJustificacionPrevia(
  supabase: SupabaseClient,
  input: {
    curp: string;
    fecha: string;
    materiaClave: string;
    conColumnaMateria: boolean;
  },
): Promise<{ estado: EstadoJustificacion } | null> {
  let q = supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("id, estado")
    .eq("curp_alumno", input.curp)
    .eq("fecha", input.fecha);
  if (input.conColumnaMateria) {
    q = input.materiaClave
      ? q.eq("materia_clave", input.materiaClave)
      : q.is("materia_clave", null);
  }
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return { estado: data.estado as EstadoJustificacion };
}

/**
 * Bloques del grupo del alumno ESE día, agrupados por `materia_clave` oficial
 * (origen: horario_semanal, no la configuración del profesor).
 * Devuelve null cuando no hay horario/inscripción consultable.
 */
export async function bloquesPorMateriaDiaDe(
  supabase: SupabaseClient,
  curp: string,
  fecha: string,
): Promise<
  | { bloquesPorMateria: Record<string, number>; nombres: Record<string, string> }
  | null
> {
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

/** Datos de una solicitud de justificación con adjunto (ya validados). */
export type EntradaJustificacionConArchivo = {
  curp: string;
  fecha: string;
  contexto: { grado: string; grupo: string; carrera: string };
  motivo: string;
  /** "" = día completo (comportamiento actual); con valor = justificación por clase. */
  materiaClave: string;
  solicitanteTipo: "tutor" | "alumno" | "profesor";
  solicitanteId: string;
  /** ¿Existe la columna `materia_clave`? (SQL del Prompt B aplicado). */
  conColumnaMateria: boolean;
};

/**
 * Guarda la justificación con su adjunto: sube el archivo, escribe la fila y,
 * si el guardado falla, borra el archivo recién subido (sin huérfanos).
 *
 * Con el esquema legacy (sin `materia_clave`) la clave es (curp_alumno, fecha) y
 * se resuelve con `upsert` + `onConflict`. Con el esquema nuevo la UNIQUE se
 * recrea sobre (curp_alumno, fecha, COALESCE(materia_clave,'')), que PostgREST
 * no acepta como `on_conflict` por ser un índice de expresión: se resuelve con
 * select → update/insert, idempotente por la misma clave.
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

  const limpiarArchivo = () => eliminarArchivoJustificacion(almacen, ruta);

  const datosComunes = {
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
  };

  if (!input.conColumnaMateria) {
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

  const valorMateria = input.materiaClave ? input.materiaClave : null;
  let qExistente = supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("id")
    .eq("curp_alumno", input.curp)
    .eq("fecha", input.fecha);
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

/**
 * UPSERT de la justificación de DÍA COMPLETO (sin adjunto) por la clave natural
 * (curp_alumno, fecha): re-solicitar la misma fecha actualiza el motivo.
 *
 * Es el camino que usa el panel de asistencias (`actionSolicitarJustificacionAsistencia`),
 * bajado de `app/actions/asistencias.ts` (PROMPT E · R-1).
 */
export async function guardarJustificacionDiaCompleto(
  supabase: SupabaseClient,
  datos: {
    curp: string;
    fecha: string;
    contexto: { grado: string; grupo: string; carrera: string };
    motivo: string;
    solicitanteTipo: "tutor" | "alumno" | "profesor";
    solicitanteId: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .upsert(
      {
        curp_alumno: datos.curp,
        fecha: datos.fecha,
        grado: datos.contexto.grado,
        grupo: datos.contexto.grupo,
        carrera: datos.contexto.carrera,
        motivo: datos.motivo,
        estado: "pendiente",
        solicitante_tipo: datos.solicitanteTipo,
        solicitante_id: datos.solicitanteId,
      },
      { onConflict: "curp_alumno,fecha" },
    );
  if (error) {
    return { ok: false, error: "No se pudo guardar la justificación." };
  }
  return { ok: true };
}

/** Nombres completos de ALUMNOS por CURP (re-exportado para el panel directivo). */
export { listarNombresCompletosPorCurp };
