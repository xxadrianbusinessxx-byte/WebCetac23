import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerUrlFotoPerfilSiExiste } from "@/lib/cloudinary/urls-server";
import { actualizarEtiquetasPersonales, obtenerEtiquetasPersonales } from "./etiquetas";
import type { EtiquetasPersonalesRow } from "./types";

const FOTO_PREFIX = "__FOTO__";

/** URL guardada en CARRERA con prefijo (respaldo si Cloudinary API falla). */
export function fotoUrlDesdeFila(row: EtiquetasPersonalesRow | null): string | null {
  const carrera = row?.CARRERA?.trim() ?? "";
  if (carrera.startsWith(FOTO_PREFIX)) {
    return carrera.slice(FOTO_PREFIX.length) || null;
  }
  if (carrera.includes("res.cloudinary.com")) return carrera;
  return null;
}

export async function obtenerFotoPerfilAlumno(
  supabase: SupabaseClient,
  curp: string,
): Promise<string | null> {
  const desdeNube = await obtenerUrlFotoPerfilSiExiste(curp);
  if (desdeNube) return desdeNube;

  const row = await obtenerEtiquetasPersonales(supabase, curp);
  return fotoUrlDesdeFila(row);
}

export async function guardarUrlFotoPerfil(
  supabase: SupabaseClient,
  curp: string,
  url: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await obtenerEtiquetasPersonales(supabase, curp);
  const carreraActual = row?.CARRERA?.trim() ?? "";
  const patch: Partial<EtiquetasPersonalesRow> = {
    CARRERA:
      !carreraActual ||
      carreraActual.startsWith(FOTO_PREFIX) ||
      carreraActual.includes("res.cloudinary.com")
        ? `${FOTO_PREFIX}${url}`
        : carreraActual,
  };
  return actualizarEtiquetasPersonales(supabase, curp, patch);
}
