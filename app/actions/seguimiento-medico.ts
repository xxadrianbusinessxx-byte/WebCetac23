"use server";

/**
 * SERVER ACTIONS DEL HISTORIAL DEL SEGUIMIENTO MÉDICO (2026-10-01)
 *
 * El guardado sigue siendo `actionGuardarCamposPersonales`
 * (app/actions/etiquetas-dinamicas.ts): es el que ya usan los dos apartados, y
 * desde hoy deja el historial en la misma transacción. Aquí solo se LEE.
 *
 * Lo ve quien ve el apartado: la misma capacidad y el mismo alcance que el
 * perfil (`alumno.ver_perfil` + `resolverAccesoAlumno`): el alumno el suyo, el
 * padre el de sus vinculados, Administración escolar y Dirección cualquiera.
 */
import { exigir } from "@/lib/auth/exigir";
import { resolverAccesoAlumno } from "@/lib/escolar/alumno/acceso-alumno";
import { listarHistorialSeguimientoMedico } from "@/lib/escolar/alumno/seguimiento-medico";
import type { EntradaHistorialMedico } from "@/lib/escolar/alumno/seguimiento-medico-puro";
import { createClient } from "@/lib/supabase/server";

export async function actionListarHistorialSeguimientoMedico(
  curp: string,
): Promise<{ ok: true; entradas: EntradaHistorialMedico[] } | { ok: false; error: string }> {
  const g = await exigir("alumno.ver_perfil");
  if (!g.ok) return { ok: false, error: g.error };
  try {
    const supabase = await createClient();
    const res = await resolverAccesoAlumno(supabase, g.sesion, curp);
    if (!res.ok) return { ok: false, error: res.error };
    if (!res.acceso.puedeLeer) return { ok: false, error: "No tienes permiso." };
    return await listarHistorialSeguimientoMedico(supabase, res.curp);
  } catch (e) {
    console.error("[actionListarHistorialSeguimientoMedico]", e);
    return { ok: false, error: "No se pudo leer el historial." };
  }
}
