import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CALIFICACIONES_BUCKET,
  CALIFICACIONES_MIME,
  CALIFICACIONES_TABLE,
} from "./constants";
import { extensionDesdeNombre, rutaCalificacionesMateria } from "./paths";
import type {
  CalificacionesArchivoMeta,
  ObtenerCalificacionesResult,
  SubirCalificacionesInput,
  SubirCalificacionesResult,
} from "./types";

function mimeParaExtension(ext: string): string {
  return (
    CALIFICACIONES_MIME[ext as keyof typeof CALIFICACIONES_MIME] ??
    "application/octet-stream"
  );
}

function metaDesdeFila(row: Record<string, unknown>): CalificacionesArchivoMeta {
  return {
    materiaId: String(row.materia_id),
    storagePath: String(row.storage_path),
    fileName: String(row.file_name),
    extension: extensionDesdeNombre(String(row.file_name)) ?? "csv",
    mimeType: String(row.mime_type ?? ""),
    uploadedBy: String(row.uploaded_by),
    uploaderRole: row.uploader_role as CalificacionesArchivoMeta["uploaderRole"],
    updatedAt: String(row.updated_at),
  };
}

/** Sube o reemplaza el archivo de calificaciones de una materia en Storage. */
export async function subirCalificacionesMateria(
  supabase: SupabaseClient,
  input: SubirCalificacionesInput,
): Promise<SubirCalificacionesResult> {
  const extension = extensionDesdeNombre(input.fileName);
  if (!extension) {
    return {
      ok: false,
      error: "Formato no permitido. Usa CSV, XLS o XLSX.",
    };
  }

  const storagePath = rutaCalificacionesMateria(input.materiaId, extension);
  const mimeType = mimeParaExtension(extension);

  const { error: uploadError } = await supabase.storage
    .from(CALIFICACIONES_BUCKET)
    .upload(storagePath, input.file, {
      upsert: true,
      contentType: mimeType,
      cacheControl: "3600",
    });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const updatedAt = new Date().toISOString();
  const meta: CalificacionesArchivoMeta = {
    materiaId: input.materiaId,
    storagePath,
    fileName: input.fileName,
    extension,
    mimeType,
    uploadedBy: input.uploadedBy,
    uploaderRole: input.uploaderRole,
    updatedAt,
  };

  const { error: dbError } = await supabase.from(CALIFICACIONES_TABLE).upsert(
    {
      materia_id: input.materiaId,
      storage_path: storagePath,
      file_name: input.fileName,
      mime_type: mimeType,
      uploaded_by: input.uploadedBy,
      uploader_role: input.uploaderRole,
      updated_at: updatedAt,
    },
    { onConflict: "materia_id" },
  );

  if (dbError) {
    return { ok: false, error: dbError.message };
  }

  return { ok: true, meta };
}

/** Metadatos del archivo activo de una materia (sin descargar el CSV/Excel). */
export async function obtenerMetadatosCalificaciones(
  supabase: SupabaseClient,
  materiaId: string,
): Promise<CalificacionesArchivoMeta | null> {
  const { data, error } = await supabase
    .from(CALIFICACIONES_TABLE)
    .select("*")
    .eq("materia_id", materiaId)
    .maybeSingle();

  if (error || !data) return null;
  return metaDesdeFila(data as Record<string, unknown>);
}

/** URL firmada para descargar o previsualizar el archivo (no parsea el contenido). */
export async function obtenerUrlCalificacionesMateria(
  supabase: SupabaseClient,
  materiaId: string,
  expiresInSeconds = 3600,
): Promise<ObtenerCalificacionesResult> {
  const meta = await obtenerMetadatosCalificaciones(supabase, materiaId);

  if (!meta) {
    return {
      ok: false,
      error: "No hay archivo de calificaciones para esta materia.",
    };
  }

  const { data, error } = await supabase.storage
    .from(CALIFICACIONES_BUCKET)
    .createSignedUrl(meta.storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo generar la URL del archivo.",
    };
  }

  return { ok: true, signedUrl: data.signedUrl, meta };
}

/** Descarga el blob del archivo activo (para parseo posterior en cliente o servidor). */
export async function descargarCalificacionesMateria(
  supabase: SupabaseClient,
  materiaId: string,
): Promise<{ ok: true; blob: Blob; meta: CalificacionesArchivoMeta } | { ok: false; error: string }> {
  const meta = await obtenerMetadatosCalificaciones(supabase, materiaId);
  if (!meta) {
    return {
      ok: false,
      error: "No hay archivo de calificaciones para esta materia.",
    };
  }

  const { data, error } = await supabase.storage
    .from(CALIFICACIONES_BUCKET)
    .download(meta.storagePath);

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo descargar el archivo.",
    };
  }

  return { ok: true, blob: data, meta };
}

/** Elimina el archivo activo de una materia (Storage + metadatos). */
export async function eliminarCalificacionesMateria(
  supabase: SupabaseClient,
  materiaId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const meta = await obtenerMetadatosCalificaciones(supabase, materiaId);
  if (!meta) {
    return { ok: true };
  }

  const { error: storageError } = await supabase.storage
    .from(CALIFICACIONES_BUCKET)
    .remove([meta.storagePath]);

  if (storageError) {
    return { ok: false, error: storageError.message };
  }

  const { error: dbError } = await supabase
    .from(CALIFICACIONES_TABLE)
    .delete()
    .eq("materia_id", materiaId);

  if (dbError) {
    return { ok: false, error: dbError.message };
  }

  return { ok: true };
}
