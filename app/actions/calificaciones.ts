"use server";

import type { PortalRole } from "@/lib/auth/types";
import {
  descargarCalificacionesMateria,
  eliminarCalificacionesMateria,
  obtenerMetadatosCalificaciones,
  obtenerUrlCalificacionesMateria,
  subirCalificacionesMateria,
} from "@/lib/calificaciones/storage";
import type {
  CalificacionesArchivoMeta,
  CalificacionesUploaderRole,
} from "@/lib/calificaciones/types";
import { createClient } from "@/lib/supabase/server";

function puedeSubirCalificaciones(rol: PortalRole): rol is CalificacionesUploaderRole {
  return rol === "maestro" || rol === "directivo";
}

export async function actionSubirCalificacionesMateria(formData: FormData): Promise<
  | { ok: true; meta: CalificacionesArchivoMeta }
  | { ok: false; error: string }
> {
  const matricula = String(formData.get("matricula") ?? "");
  const rol = String(formData.get("rol") ?? "") as PortalRole;
  const materiaId = String(formData.get("materiaId") ?? "");
  const archivo = formData.get("archivo");

  if (!matricula || !materiaId) {
    return { ok: false, error: "Faltan datos de sesión o materia." };
  }
  if (!puedeSubirCalificaciones(rol)) {
    return { ok: false, error: "No tienes permiso para subir calificaciones." };
  }
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo válido." };
  }

  const supabase = await createClient();
  return subirCalificacionesMateria(supabase, {
    materiaId,
    file: archivo,
    fileName: archivo.name,
    uploadedBy: matricula,
    uploaderRole: rol,
  });
}

export async function actionObtenerUrlCalificacionesMateria(
  materiaId: string,
): Promise<
  | { ok: true; signedUrl: string; meta: CalificacionesArchivoMeta | null }
  | { ok: false; error: string }
> {
  if (!materiaId) {
    return { ok: false, error: "Materia no válida." };
  }
  const supabase = await createClient();
  return obtenerUrlCalificacionesMateria(supabase, materiaId);
}

export async function actionObtenerMetadatosCalificaciones(
  materiaId: string,
): Promise<CalificacionesArchivoMeta | null> {
  if (!materiaId) return null;
  const supabase = await createClient();
  return obtenerMetadatosCalificaciones(supabase, materiaId);
}

/** Para parseo futuro: devuelve el blob sin interpretar CSV/Excel en la UI. */
export async function actionDescargarCalificacionesMateria(materiaId: string) {
  if (!materiaId) {
    return { ok: false as const, error: "Materia no válida." };
  }
  const supabase = await createClient();
  return descargarCalificacionesMateria(supabase, materiaId);
}

export async function actionEliminarCalificacionesMateria(
  materiaId: string,
  rol: PortalRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!puedeSubirCalificaciones(rol)) {
    return { ok: false, error: "No tienes permiso para eliminar calificaciones." };
  }
  if (!materiaId) {
    return { ok: false, error: "Materia no válida." };
  }
  const supabase = await createClient();
  return eliminarCalificacionesMateria(supabase, materiaId);
}
