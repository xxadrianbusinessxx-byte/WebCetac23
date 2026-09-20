"use server";

import { exigir } from "@/lib/auth/exigir";
import { esRol } from "@/lib/auth/permisos";
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
import { leerFormData } from "@/lib/validacion/leer-form-data";
import { esquemaSubirCalificaciones } from "@/lib/validacion/esquemas-puro";

/**
 * T4 (PROMPT-2) — CERRADO el agujero de autorización: estas 5 actions ya NO leen
 * `rol` del FormData. El rol sale SOLO de la cookie firmada vía exigir() y la
 * matriz de permisos (`calificacion.subir`/`ver`/`eliminar` son hoy de
 * directivo/maestro). `puedeSubirCalificaciones` se conserva como type guard
 * al tipo de storage (no decide el permiso: exigir ya lo hizo).
 */
function puedeSubirCalificaciones(rol: PortalRole): rol is CalificacionesUploaderRole {
  return esRol(rol, "maestro") || esRol(rol, "directivo");
}

export async function actionSubirCalificacionesMateria(formData: FormData): Promise<
  | { ok: true; meta: CalificacionesArchivoMeta }
  | { ok: false; error: string }
> {
  const g = await exigir("calificacion.subir");
  if (!g.ok) return { ok: false, error: "No tienes permiso para subir calificaciones." };
  const sesion = g.sesion;
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (!puedeSubirCalificaciones(sesion.rol)) {
    return { ok: false, error: "No tienes permiso para subir calificaciones." };
  }

  const matricula = String(sesion.matricula ?? "");
  // `materiaId` y `archivo` en un solo esquema, con el orden de comprobación de antes: si
  // falta la materia el mensaje es el de siempre, y si falta el archivo también.
  if (!matricula) return { ok: false, error: "Faltan datos de sesión o materia." };
  const entrada = leerFormData(esquemaSubirCalificaciones, formData);
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const { materiaId, archivo } = entrada.datos;

  const supabase = await createClient();
  return subirCalificacionesMateria(supabase, {
    materiaId,
    file: archivo,
    fileName: archivo.name,
    uploadedBy: matricula,
    uploaderRole: sesion.rol,
  });
}

export async function actionObtenerUrlCalificacionesMateria(
  materiaId: string,
): Promise<
  | { ok: true; signedUrl: string; meta: CalificacionesArchivoMeta | null }
  | { ok: false; error: string }
> {
  const g = await exigir("calificacion.ver");
  if (!g.ok) return { ok: false, error: "No tienes permiso." };
  if (!materiaId) {
    return { ok: false, error: "Materia no válida." };
  }
  const supabase = await createClient();
  return obtenerUrlCalificacionesMateria(supabase, materiaId);
}

export async function actionObtenerMetadatosCalificaciones(
  materiaId: string,
): Promise<CalificacionesArchivoMeta | null> {
  const g = await exigir("calificacion.ver");
  if (!g.ok) return null;
  if (!materiaId) return null;
  const supabase = await createClient();
  return obtenerMetadatosCalificaciones(supabase, materiaId);
}

/** Para parseo futuro: devuelve el blob sin interpretar CSV/Excel en la UI. */
export async function actionDescargarCalificacionesMateria(materiaId: string) {
  const g = await exigir("calificacion.ver");
  if (!g.ok) {
    return { ok: false as const, error: "No tienes permiso." };
  }
  if (!materiaId) {
    return { ok: false as const, error: "Materia no válida." };
  }
  const supabase = await createClient();
  return descargarCalificacionesMateria(supabase, materiaId);
}

export async function actionEliminarCalificacionesMateria(
  materiaId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await exigir("calificacion.eliminar");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para eliminar calificaciones." };
  }
  if (!materiaId) {
    return { ok: false, error: "Materia no válida." };
  }
  const supabase = await createClient();
  return eliminarCalificacionesMateria(supabase, materiaId);
}
