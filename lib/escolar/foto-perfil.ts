import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerUrlFotoPerfilSiExiste } from "@/lib/cloudinary/urls-server";

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
