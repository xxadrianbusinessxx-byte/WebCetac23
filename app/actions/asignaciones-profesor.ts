"use server";

/**
 * C4.12 — SERVER ACTIONS DE ADMINISTRACIÓN DE ASIGNACIONES DE PROFESOR.
 *
 * SEGURIDAD:
 *   - El ACTOR autenticado sale SIEMPRE de exigir() (cookie firmada + capacidad).
 *     directivo. Nunca del cliente.
 *   - El OBJETIVO administrativo (profesorId / grupoMateriaId) se valida
 *     contra PROFESORES.ID y el catálogo (grupo_materias) en el servidor.
 *   - CLAVE nunca es identidad ni autoridad. Se expone solo como dato
 *     histórico informativo en el listado de profesores.
 *   - No se introducen credenciales privilegiadas en Client Components.
 */
import { exigir } from "@/lib/auth/exigir";
import { createClient } from "@/lib/supabase/server";
import { listarProfesores, nombreProfesor } from "@/lib/escolar/catalogo/profesores";
import {
  crearAsignacion,
  desactivarAsignacion,
  listarAsignacionesAdmin,
  listarGruposMateriasParaAsignacion,
  type GrupoMateriaParaAsignacion,
} from "@/lib/escolar/catalogo/asignaciones-profesor";

/**
 * Los tipos de presentación viven en la capa de dominio (`lib/escolar/catalogo/asignaciones-profesor.ts`) y la UI los
 * importa DE AHÍ, con `import type`.
 *
 * NO SE REEXPORTAN DESDE ESTE ARCHIVO, y no es estilo: un `"use server"` solo
 * puede exportar funciones async. Al compilar con Turbopack —lo que hace Vercel—
 * Next trata cada nombre de una lista `export type { … }` como si fuera una
 * Server Action y genera `registerServerReference(ElTipo, …)`: como el tipo no
 * existe en tiempo de ejecución, el módulo de acciones de `/oceano` revienta al
 * cargarse con `ReferenceError` y caen TODAS las acciones de la app con 500.
 * En `next dev --webpack` no pasa, por eso no se vio en local. Lo vigila C14.
 */

const NO_AUTORIZADO = {
  ok: false,
  error: "No autorizado: se requiere rol directivo.",
} as const;

export type ProfesorParaAsignacion = {
  id: number;
  nombre: string;
  permisos: string;
  /** Dato HISTÓRICO informativo (interfaz legacy). NUNCA identidad. */
  clave: string;
};

/** Lista PROFESORES (identidad = ID) para el selector administrativo. */
export async function actionListarProfesoresParaAsignacion(): Promise<
  ProfesorParaAsignacion[] | { ok: false; error: string }
> {
  const g = await exigir("asignacion.ver");
  if (!g.ok) return NO_AUTORIZADO;

  const supabase = await createClient();
  const profesores = await listarProfesores(supabase);
  return profesores.map((p) => ({
    id: p.ID,
    nombre: nombreProfesor(p),
    permisos: p.Permisos,
    clave: p.CLAVE,
  }));
}

/**
 * Lista la oferta de grupo_materias (grupo + carrera + materia + periodo).
 * La consulta y el derivado del catálogo viven en la capa de dominio
 * (`listarGruposMateriasParaAsignacion`); aquí solo se valida la capacidad.
 */
export async function actionListarGruposMateriasParaAsignacion(): Promise<
  GrupoMateriaParaAsignacion[] | { ok: false; error: string }
> {
  const g = await exigir("asignacion.ver");
  if (!g.ok) return NO_AUTORIZADO;

  const supabase = await createClient();
  return listarGruposMateriasParaAsignacion(supabase);
}

export type CrearAsignacionInput = {
  profesorId: unknown;
  grupoMateriaId: unknown;
  desde?: unknown;
  hasta?: unknown;
};

/** Crea una asignación explícita (solo directivo; validaciones server-side). */
export async function actionCrearAsignacionProfesor(
  input: CrearAsignacionInput,
) {
  const g = await exigir("asignacion.editar");
  if (!g.ok) return NO_AUTORIZADO;

  const supabase = await createClient();
  return crearAsignacion(supabase, input);
}

/** Desactiva una asignación (activo=false + hasta). Sin DELETE. */
export async function actionDesactivarAsignacionProfesor(asignacionId: unknown) {
  const g = await exigir("asignacion.editar");
  if (!g.ok) return NO_AUTORIZADO;

  const supabase = await createClient();
  return desactivarAsignacion(supabase, asignacionId);
}

/** Lista asignaciones existentes con catálogo derivado (solo directivo). */
export async function actionListarAsignacionesProfesorAdmin() {
  const g = await exigir("asignacion.ver");
  if (!g.ok) return NO_AUTORIZADO;

  const supabase = await createClient();
  return listarAsignacionesAdmin(supabase);
}
