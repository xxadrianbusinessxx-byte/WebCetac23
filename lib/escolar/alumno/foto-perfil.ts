import type { SupabaseClient } from "@supabase/supabase-js";
import { subirImagenCloudinary } from "../../cloudinary/upload.ts";
import { publicIdPerfilUpload, urlFotoPerfilAvatar } from "../../cloudinary/urls.ts";
import {
  invalidarUrlFotoPerfil,
  obtenerUrlFotoPerfilSiExiste,
} from "../../cloudinary/urls-server.ts";

/** Foto de perfil solo desde Cloudinary (no usa CARRERA de ETIQUETAS PERSONALES). */
export async function obtenerFotoPerfilAlumno(
  supabase: SupabaseClient,
  curp: string,
): Promise<string | null> {
  void supabase;
  return obtenerUrlFotoPerfilSiExiste(curp);
}

export async function guardarUrlFotoPerfil(
  supabase: SupabaseClient,
  curp: string,
  url: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  void supabase;
  void curp;
  void url;
  return { ok: true };
}

/**
 * FASE 7 (6A-2) — Sube la foto de perfil de un alumno y devuelve la URL de
 * AVATAR lista para pintar.
 *
 * El I/O de Cloudinary (conversión del archivo a buffer, subida con el
 * public_id determinista del CURP) y la invalidación de caché viven aquí; la
 * Server Action solo autoriza el ALCANCE del alumno y valida el archivo.
 *
 * La URL devuelta es la de AVATAR (w_256,c_fill,f_auto,q_auto), consistente con
 * la que devuelve `obtenerUrlFotoPerfilSiExiste`: la subida ya ocurrió con el
 * mismo public_id determinista, así que apunta al recurso recién subido.
 */
export async function subirFotoPerfilAlumno(
  supabase: SupabaseClient,
  curp: string,
  archivo: File,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const subida = await subirImagenCloudinary(buffer, publicIdPerfilUpload(curp));
  if (!subida.ok) return { ok: false, error: subida.error };

  const guardado = await guardarUrlFotoPerfil(supabase, curp, subida.url);
  if (!guardado.ok) return guardado;

  // O5 — La foto cambió: invalida la caché para que sea visible de inmediato.
  invalidarUrlFotoPerfil(curp);

  return { ok: true, url: urlFotoPerfilAvatar(curp) };
}
