"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import {
  buscarAlumnosCandidatos,
  inscribirAlumnoEnCiclo,
  listarGruposPeriodoAdmin,
  type AlumnoCandidato,
  type GrupoAdminCiclo,
} from "@/lib/escolar/inscripciones-borrador";

/**
 * F3 — Server Actions de configuración académica de un ciclo (BORRADOR o
 * OPERATIVO). Todas validan rol `directivo` en servidor. Nunca activan ciclos.
 */

const NO_AUTORIZADO = { ok: false as const, error: "No autorizado: se requiere rol directivo." };

/** Grupos de un periodo concreto (para preparar BORRADOR o ajustar OPERATIVO). */
export async function actionListarGruposPeriodo(periodoId: string): Promise<
  { ok: true; grupos: GrupoAdminCiclo[] } | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  const r = await listarGruposPeriodoAdmin(supabase, periodoId);
  if (!r.ok) return { ok: false, error: r.error ?? "Error al listar grupos." };
  return { ok: true, grupos: r.grupos ?? [] };
}

/** Búsqueda acotada de alumnos candidatos a inscripción. */
export async function actionBuscarAlumnosInscripcion(texto: string): Promise<
  { ok: true; alumnos: AlumnoCandidato[] } | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  const r = await buscarAlumnosCandidatos(supabase, texto);
  if (!r.ok) return { ok: false, error: r.error ?? "Error al buscar alumnos." };
  return { ok: true, alumnos: r.alumnos ?? [] };
}

/** Inscribe/registra un alumno en un grupo de un periodo explícito. */
export async function actionInscribirAlumnoEnCiclo(input: {
  curp: string;
  grupoId: string;
  periodoId?: string;
}): Promise<
  | { ok: true; mensaje: string; activo: boolean; periodoNombre: string }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  return inscribirAlumnoEnCiclo(supabase, input);
}
