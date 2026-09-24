import type { SupabaseClient } from "@supabase/supabase-js";
import { carreraEscolarDesdeEtiquetas } from "../alumno/informacion-personal.ts";
import {
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_CARRERAS,
  TABLA_ETIQUETAS_PERSONALES,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
} from "../tables.ts";
import type { EtiquetasPersonalesRow } from "../types.ts";
import {
  cargarContextoCatalogoAsistencia,
  type GrupoAsistencia,
} from "./asistencia-configuracion.ts";
import {
  FALLBACK_LEGACY_ETIQUETAS_ACTIVO,
  TAMANO_PAGINA,
  norm,
} from "./asistencia-comun.ts";

/**
 * ASISTENCIA — FACHADA Y CONTEXTO DEL ALUMNO.
 *
 * ── PROMPT E · R-3 (partición por responsabilidad) ─────────────────────────
 * Este archivo tenía 1 845 líneas. Se partió en cuatro módulos y aquí se
 * re-exportan para que ningún import existente se rompa (§10):
 *
 *   · `./asistencia-comun.ts`         — constantes, tipos y helpers puros
 *   · `./asistencia-configuracion.ts` — configuración de clases del profesor
 *   · `./asistencia-plantillas.ts`    — plantilla, análisis de la subida y aplicación
 *   · `./asistencia-estados.ts`       — estados derivados y calendario del alumno
 *
 * Aquí quedan los grupos del periodo y el contexto/anulación del alumno.
 */

/**
 * C4.3 â€” Lista los grupos (grado + grupo + carrera) para asistencia.
 * Fuente primaria: catÃ¡logo (periodos â†’ grupos â†’ carreras).
 * Fallback LEGACY temporal (ETIQUETAS PERSONALES) solo si no hay periodo
 * activo o el catÃ¡logo no tiene grupos.
 */
export async function listarGruposAsistencia(
  supabase: SupabaseClient,
): Promise<GrupoAsistencia[]> {
  const catalogo = await cargarContextoCatalogoAsistencia(supabase);
  if (catalogo && catalogo.indice.size > 0) {
    const grupos = new Map<string, GrupoAsistencia>();
    for (const item of catalogo.indice.values()) {
      grupos.set(`${item.grado}|${item.grupo}|${item.carreraClave}`, {
        grado: item.grado,
        grupo: item.grupo,
        carrera: item.carreraClave,
      });
    }
    return [...grupos.values()].sort((a, b) =>
      `${a.grado} ${a.grupo} ${a.carrera}`.localeCompare(
        `${b.grado} ${b.grupo} ${b.carrera}`,
        "es",
      ),
    );
  }
  // Fallback LEGACY temporal (sin periodo activo / catÃ¡logo sin grupos).
  if (FALLBACK_LEGACY_ETIQUETAS_ACTIVO) {
    return listarGruposAsistenciaLegacy(supabase);
  }
  return [];
}

/**
 * @deprecated Fallback LEGACY temporal: grupos derivados de ETIQUETAS
 * PERSONALES (GRADO/GRUPO/CARRERA). Se eliminarÃ¡ cuando la migraciÃ³n de
 * inscripciones estÃ© verificada (ver FALLBACK_LEGACY_ETIQUETAS_ACTIVO).
 */
async function listarGruposAsistenciaLegacy(
  supabase: SupabaseClient,
): Promise<GrupoAsistencia[]> {
  const grupos = new Map<string, GrupoAsistencia>();
  let desde = 0;
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_ETIQUETAS_PERSONALES)
      .select("GRADO, GRUPO, CARRERA")
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (error || !data || data.length === 0) break;

    for (const r of data as EtiquetasPersonalesRow[]) {
      const grado = norm(String(r.GRADO ?? ""));
      const grupo = norm(String(r.GRUPO ?? ""));
      if (!grado || !grupo) continue;
      const carrera = norm(carreraEscolarDesdeEtiquetas(r));
      const key = `${grado}|${grupo}|${carrera}`;
      if (!grupos.has(key)) grupos.set(key, { grado, grupo, carrera });
    }

    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }

  return [...grupos.values()].sort((a, b) =>
    `${a.grado} ${a.grupo} ${a.carrera}`.localeCompare(
      `${b.grado} ${b.grupo} ${b.carrera}`,
      "es",
    ),
  );
}


/* ---------------------------------------------------------------------------
 * CONTEXTO DEL ALUMNO Y ANULACIÓN DE APORTES
 * ---------------------------------------------------------------------------
 * Bajado de `app/actions/asistencias.ts` (PROMPT E · R-1). La Server Action
 * valida la sesión, el ALCANCE (rol + grupo) y delega; ninguna función de aquí
 * decide autorización.
 */

/** Identidad académica de un alumno resuelta desde su inscripción ACTIVA. */
export type IdentidadAlumnoInscripcion = {
  grado: string;
  grupo: string;
  /** Clave de la carrera (`carreras.clave`); "" si el grupo no tiene carrera. */
  carrera: string;
  /** `grupos.periodo_id`; null si el grupo no lo declara. */
  periodoId: string | null;
};

/**
 * Identidad académica del alumno SOLO desde la inscripción ACTIVA
 * (`inscripciones_alumno.activo` → `grupos` → `carreras`). Sin fallback legacy:
 * el cliente nunca manda grado/grupo.
 *
 * Con más de una inscripción activa NO se elige una (es la anomalía «CASO E»):
 * se devuelve error, igual que antes.
 */
export async function resolverIdentidadAlumnoInscripcion(
  supabase: SupabaseClient,
  curp: string,
): Promise<
  { ok: true; identidad: IdentidadAlumnoInscripcion } | { ok: false; error: string }
> {
  const { data: inscripciones, error: errIns } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("grupo_id, activo")
    .eq("curp", curp)
    .eq("activo", true)
    .limit(2);
  if (errIns || !inscripciones || inscripciones.length === 0) {
    return { ok: false, error: "El alumno no tiene inscripción activa." };
  }
  if (inscripciones.length > 1) {
    return {
      ok: false,
      error: "El alumno tiene más de una inscripción activa. Revisa el catálogo.",
    };
  }

  const { data: detalleGrupo, error: errGrupo } = await supabase
    .from(TABLA_GRUPOS)
    .select("grado, nombre, carrera_id, periodo_id, activo")
    .eq("id", inscripciones[0].grupo_id)
    .maybeSingle();
  if (errGrupo || !detalleGrupo || detalleGrupo.activo === false) {
    return {
      ok: false,
      error: "El grupo del alumno no es válido o está inactivo.",
    };
  }

  let carrera = "";
  if (detalleGrupo.carrera_id) {
    const { data: detalleCarrera } = await supabase
      .from(TABLA_CARRERAS)
      .select("clave")
      .eq("id", detalleGrupo.carrera_id)
      .maybeSingle();
    carrera = String(detalleCarrera?.clave ?? "");
  }

  return {
    ok: true,
    identidad: {
      grado: String(detalleGrupo.grado ?? ""),
      grupo: String(detalleGrupo.nombre ?? ""),
      carrera,
      periodoId: detalleGrupo.periodo_id ?? null,
    },
  };
}

/** ¿El esquema de atribución (`asistencia_alumnos.profesor_id`) está aplicado? */
export async function esquemaAtribucionDisponible(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { error } = await supabase
    .from(TABLA_ASISTENCIA_ALUMNOS)
    .select("profesor_id")
    .limit(1);
  return !error;
}

/**
 * Aportes de asistencia de ESTE profesor para un alumno/día/grupo. Con
 * atribución por materia puede haber VARIAS filas (una por materia); las
 * devuelve crudas para que la action elija la de mayor aporte.
 */
export async function listarAportesDeProfesorEnDia(
  supabase: SupabaseClient,
  filtro: {
    profesorId: number;
    curp: string;
    fecha: string;
    grado: string;
    grupo: string;
  },
): Promise<
  | { ok: true; filas: { id: string; clases_asistidas: number }[] }
  | { ok: false; error: string }
> {
  const { data: filas, error } = await supabase
    .from(TABLA_ASISTENCIA_ALUMNOS)
    .select("id, clases_asistidas")
    .eq("profesor_id", filtro.profesorId)
    .eq("curp", filtro.curp)
    .eq("fecha", filtro.fecha)
    .eq("grado", filtro.grado)
    .eq("grupo", filtro.grupo)
    .limit(50);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    filas: (filas ?? []) as { id: string; clases_asistidas: number }[],
  };
}

/** Fija `clases_asistidas` de UNA fila (UPDATE puntual por `id`). */
export async function fijarClasesAsistidas(
  supabase: SupabaseClient,
  asistenciaId: string,
  valor: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from(TABLA_ASISTENCIA_ALUMNOS)
    .update({ clases_asistidas: valor })
    .eq("id", asistenciaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}



// Re-export de la función PURA por parcial (se implementa en
// asistencia-parcial.ts para que las pruebas compilen sin Supabase).
export {
  resumenAsistenciaPorParcial,
} from "./asistencia-parcial.ts";
export type {
  ParcialAsistencia,
  ResumenPorParcial,
  ResultadoResumenPorParcial,
} from "./asistencia-parcial.ts";

/* ---------------------------------------------------------------------------
 * PROMPT E · R-3 — este archivo tenía 1 845 líneas. Se partió por
 * responsabilidad; las partes se re-exportan aquí para que ningún import
 * existente se rompa (§10):
 *
 *   · ./asistencia-comun.ts          — constantes, tipos y helpers puros compartidos
 *   · ./asistencia-configuracion.ts  — configuración de clases del profesor
 *   · ./asistencia-plantillas.ts     — plantilla, análisis de la subida y aplicación
 *   · ./asistencia-estados.ts        — estados derivados y calendario del alumno
 *
 * Aquí quedan los grupos por periodo y el contexto/anulación del alumno.
 * ------------------------------------------------------------------------- */

export * from "./asistencia-comun.ts";
export * from "./asistencia-configuracion.ts";
export * from "./asistencia-plantillas.ts";
export * from "./asistencia-estados.ts";
