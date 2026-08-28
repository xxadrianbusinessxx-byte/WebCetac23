"use server";

/**
 * C4.12 — SERVER ACTIONS DE ADMINISTRACIÓN DE ASIGNACIONES DE PROFESOR.
 *
 * SEGURIDAD:
 *   - El ACTOR autenticado sale SIEMPRE de obtenerSesionPortal() + rol
 *     directivo. Nunca del cliente.
 *   - El OBJETIVO administrativo (profesorId / grupoMateriaId) se valida
 *     contra PROFESORES.ID y el catálogo (grupo_materias) en el servidor.
 *   - CLAVE nunca es identidad ni autoridad. Se expone solo como dato
 *     histórico informativo en el listado de profesores.
 *   - No se introducen credenciales privilegiadas en Client Components.
 */
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { listarProfesores, nombreProfesor } from "@/lib/escolar/profesores";
import {
  crearAsignacion,
  desactivarAsignacion,
  listarAsignacionesAdmin,
} from "@/lib/escolar/asignaciones-profesor";
import {
  listarNombresVisiblesMaterias,
  nombreVisibleDesdeMapa,
} from "@/lib/escolar/nombres-visibles";
import {
  TABLA_CARRERAS,
  TABLA_GRUPO_MATERIAS,
  TABLA_PERIODOS,
} from "@/lib/escolar/tables";

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
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;

  const supabase = await createClient();
  const profesores = await listarProfesores(supabase);
  return profesores.map((p) => ({
    id: p.ID,
    nombre: nombreProfesor(p),
    permisos: p.Permisos,
    clave: p.CLAVE,
  }));
}

type GrupoMateriaRef = {
  id: string;
  grado: string;
  nombre: string;
  carrera_id: string | null;
  periodo_id: string;
};

type MateriaRef = { id: string; clave: string; nombre: string };

/** PostgREST embeds pueden venir como objeto o como array según la FK. */
function aUno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return (v[0] ?? null) as T | null;
  return (v ?? null) as T | null;
}

type GrupoMateriaJoin = {
  id: string;
  tabla_legacy: string | null;
  activo: boolean;
  grupos: GrupoMateriaRef | GrupoMateriaRef[] | null;
  materias: MateriaRef | MateriaRef[] | null;
};

export type GrupoMateriaParaAsignacion = {
  grupoMateriaId: string;
  /** Presentación humana: grado + grupo + carrera (ej. "2DO A RH"). */
  descripcion: string;
  /** Nombre visible de la materia (alias → materias.nombre → materias.clave). */
  materiaNombre: string;
  /** Solo debugging administrativo. */
  materiaClave: string;
  carreraClave: string | null;
  periodoNombre: string;
  /** Nombre físico de la tabla; solo debugging (la UI NO lo expone). */
  tablaLegacy: string | null;
};

/** Lista la oferta de grupo_materias (grupo + carrera + materia + periodo). */
export async function actionListarGruposMateriasParaAsignacion(): Promise<
  GrupoMateriaParaAsignacion[] | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select(
      "id, tabla_legacy, activo, grupos(id, grado, nombre, carrera_id, periodo_id), materias(id, clave, nombre)",
    )
    .eq("activo", true)
    .order("tabla_legacy");
  if (error) return { ok: false, error: error.message };

  const gms = (data ?? []) as unknown as GrupoMateriaJoin[];
  const grupoIds = [
    ...new Set(gms.map((g) => aUno(g.grupos)?.id).filter((x): x is string => Boolean(x))),
  ];
  const periodoIds = [
    ...new Set(
      gms.map((g) => aUno(g.grupos)?.periodo_id).filter((x): x is string => Boolean(x)),
    ),
  ];
  const carreraIds = [
    ...new Set(
      gms.map((g) => aUno(g.grupos)?.carrera_id).filter((x): x is string => Boolean(x)),
    ),
  ];

  const [periodosRes, carrerasRes] = await Promise.all([
    periodoIds.length
      ? supabase.from(TABLA_PERIODOS).select("id, nombre").in("id", periodoIds)
      : Promise.resolve({ data: [], error: null }),
    carreraIds.length
      ? supabase.from(TABLA_CARRERAS).select("id, clave").in("id", carreraIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const periodoPorId = new Map(
    ((periodosRes.data ?? []) as Array<{ id: string; nombre: string }>).map(
      (p) => [p.id, p.nombre],
    ),
  );
  const carreraPorId = new Map(
    ((carrerasRes.data ?? []) as Array<{ id: string; clave: string }>).map(
      (c) => [c.id, c.clave],
    ),
  );

  // C4.28 — el nombre visible de la materia sale del alias existente
  // (materias_nombres_visibles) o del catálogo (materias.nombre/clave);
  // NUNCA del nombre físico de la tabla.
  const aliases = await listarNombresVisiblesMaterias(supabase);

  return gms.map((g) => {
    const grupo = aUno(g.grupos);
    const materia = aUno(g.materias);
    const carreraClave = grupo?.carrera_id
      ? (carreraPorId.get(grupo.carrera_id) ?? null)
      : null;
    const grupoDesc = `${grupo?.grado ?? ""} ${grupo?.nombre ?? ""}`.trim();
    const aliasResuelto = g.tabla_legacy
      ? nombreVisibleDesdeMapa(aliases, g.tabla_legacy)
      : "";
    const materiaNombre =
      (aliasResuelto && aliasResuelto !== g.tabla_legacy
        ? aliasResuelto
        : "") ||
      (materia?.nombre?.trim() ?? "") ||
      (materia?.clave?.trim() ?? "—");
    return {
      grupoMateriaId: g.id,
      descripcion: grupoDesc
        ? `${grupoDesc}${carreraClave ? " " + carreraClave : ""}`
        : g.id,
      materiaNombre,
      materiaClave: materia?.clave ?? "—",
      carreraClave,
      periodoNombre: grupo?.periodo_id
        ? (periodoPorId.get(grupo.periodo_id) ?? "—")
        : "—",
      tablaLegacy: g.tabla_legacy ?? null,
    };
  });
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
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;

  const supabase = await createClient();
  return crearAsignacion(supabase, input);
}

/** Desactiva una asignación (activo=false + hasta). Sin DELETE. */
export async function actionDesactivarAsignacionProfesor(asignacionId: unknown) {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;

  const supabase = await createClient();
  return desactivarAsignacion(supabase, asignacionId);
}

/** Lista asignaciones existentes con catálogo derivado (solo directivo). */
export async function actionListarAsignacionesProfesorAdmin() {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;

  const supabase = await createClient();
  return listarAsignacionesAdmin(supabase);
}
