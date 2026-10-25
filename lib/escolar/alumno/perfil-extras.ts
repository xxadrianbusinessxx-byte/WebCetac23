/**
 * perfil-extras.ts — PROMPT Z. Número de control, etiquetas dinámicas y contacto del
 * tutor principal del perfil: de la RPC v2 si ya los trae (0 consultas) o, si no,
 * con las tres lecturas de siempre (en paralelo, como antes).
 *
 * No autoriza: quien llama ya pasó `exigir()` y `resolverAccesoAlumno`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { obtenerTutorPrincipalDeAlumno } from "../tutores/tutores-relacion.ts";
import { obtenerEtiquetasDinamicas } from "./etiquetas-dinamicas-servicio.ts";
import { leerNumeroControl } from "./numero-control.ts";
import { contactoTutor, extrasDesdeRpcPerfil, type ExtrasPerfil } from "./perfil-extras-puro.ts";

export async function extrasDelPerfil(
  supabase: SupabaseClient,
  curp: string,
  rpcPerfil: unknown,
): Promise<ExtrasPerfil> {
  const v2 = extrasDesdeRpcPerfil(rpcPerfil);
  if (v2) return v2;
  const [etiquetasDinamicas, tutor, numeroControl] = await Promise.all([
    obtenerEtiquetasDinamicas(supabase, curp),
    obtenerTutorPrincipalDeAlumno(supabase, curp),
    leerNumeroControl(supabase, curp),
  ]);
  return { etiquetasDinamicas, tutorContacto: contactoTutor(tutor), numeroControl };
}
