"use server";

import { exigir } from "@/lib/auth/exigir";
import { createClient } from "@/lib/supabase/server";
import {
  crearCicloConContexto,
  registrarTransicionCiclo,
  type PlanCrearCiclo,
} from "@/lib/escolar/ciclo/orquestador-ciclo";

/**
 * F4 — Server Actions del orquestador del ciclo. Capacidad `ciclo.crear`
 * (hoy solo directivo). Crear NUNCA activa (queda BORRADOR). La activación
 * sigue en `setActivoCiclo → activarCicloOperativo` (validación server-side).
 */

const NO_AUTORIZADO = { ok: false as const, error: "No autorizado: se requiere rol directivo." };

export async function actionCrearCicloConContexto(input: {
  nombre: string;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  origenId?: string | null;
  copiarGruposMaterias?: boolean;
}): Promise<PlanCrearCiclo> {
  const g = await exigir("ciclo.crear");
  if (!g.ok) return NO_AUTORIZADO;
  const sesion = g.sesion;
  const supabase = await createClient();
  const r = await crearCicloConContexto(supabase, input);
  if (r.ok && r.periodoId) {
    await registrarTransicionCiclo(supabase, {
      periodoId: r.periodoId,
      operacion: "crear_ciclo_con_contexto",
      estadoAnterior: null,
      estadoNuevo: "borrador",
      actor: sesion?.matricula ?? null,
      resultado: "ok",
      detalle: `Creación BORRADOR ${input.nombre}${input.origenId ? ` (origen ${input.origenId})` : ""}`,
    });
  }
  return r;
}
