import type { SupabaseClient } from "@supabase/supabase-js";
import { actualizarEtiquetasPersonales, obtenerEtiquetasPersonales } from "./etiquetas";
import { identificarGrupoAlumno } from "./buscar-grupo";
import type { EtiquetasPersonalesRow } from "./types";

function grupoCompleto(row: EtiquetasPersonalesRow | null): boolean {
  return Boolean(
    row?.GRADO?.trim() && row?.GRUPO?.trim() && row?.CARRERA?.trim(),
  );
}

/** Rellena GRADO, GRUPO y CARRERA buscando el nombre en tablas de registro. */
export async function sincronizarGrupoAlumno(
  supabase: SupabaseClient,
  curp: string,
  nombreCompleto: string,
): Promise<EtiquetasPersonalesRow | null> {
  let row = await obtenerEtiquetasPersonales(supabase, curp);
  if (grupoCompleto(row)) return row;

  const hallado = await identificarGrupoAlumno(supabase, {
    curp,
    nombreCompleto,
  });
  if (!hallado) return row;

  const patch = {
    GRADO: hallado.grado,
    GRUPO: hallado.grupo,
    CARRERA: hallado.carrera || row?.CARRERA?.trim() || "GENERAL",
  };

  const upd = await actualizarEtiquetasPersonales(supabase, curp, patch);
  if (!upd.ok) return row;

  row = await obtenerEtiquetasPersonales(supabase, curp);
  return row;
}
