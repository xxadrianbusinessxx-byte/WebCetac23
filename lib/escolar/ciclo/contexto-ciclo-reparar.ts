import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
} from "../catalogo/catalogo-academico.ts";
import { obtenerGruposConCarreraDePeriodo } from "../horario/horario-semanal.ts";
import { TABLA_GRUPO_MATERIAS, TABLA_PERIODOS } from "../tables.ts";
import type {
  GrupoDestinoParaPlan,
  GrupoOrigenParaPlan,
} from "./contexto-ciclo-clonar.ts";

/**
 * CONTEXTO ACADÉMICO DEL CICLO · REPARACIÓN DE `tabla_legacy`.
 *
 * `tabla_legacy` es el puente entre el catálogo (uuid) y la tabla física
 * (texto): si está vacío o mal, el alumno no ve su materia. La reparación es
 * determinista, solo escribe la columna hoy NULL e es idempotente.
 *
 * Es una de las tres partes del antiguo `lib/escolar/ciclo/contexto-ciclo.ts`
 * (PROMPT E · R-3); `contexto-ciclo.ts` re-exporta las tres.
 */


/* ===========================================================================
 * REPARACIÓN DE tabla_legacy (puente físico grupo_materias → tabla legacy)
 *
 * `clonarContextoAcademico` no copiaba `tabla_legacy`: el periodo clonado
 * quedaba con 241 filas `(grupo_id, materia_id)` idénticas al origen pero con
 * `tabla_legacy = NULL`, y los alumnos dejaban de ver materias en /perfil.
 *
 * La reparación es determinista y SOLO escribe la columna hoy NULL:
 *   - Plan PURO: empareja cada fila destino (grupo + materia) con su
 *     equivalente de origen por identidad `grado|grupo|carrera` + `materia_id`.
 *   - Aplicación: UPDATE por `id` agrupando por valor de `tabla_legacy`
 *     (lotes `in`), sin tocar filas que ya tienen el puente.
 *   - Nunca se inventa un valor: `ambiguo` y `sin_origen` se reportan.
 * ========================================================================= */

/** Fila de `grupo_materias` ORIGEN (sin id propio necesario). */
export type FilaGmOrigenReparar = {
  grupo_id: string;
  materia_id: string;
  tabla_legacy: string | null;
};

/** Fila de `grupo_materias` DESTINO (id para el UPDATE puntual). */
export type FilaGmDestinoReparar = FilaGmOrigenReparar & { id: string };

/** Resultado del plan para UNA fila de destino. */
export type ItemPlanRepararTablaLegacy = {
  id: string;
  grupoId: string;
  materiaId: string;
  /** Valor propuesto (solo cuando `estado === "match"`). */
  tablaLegacy: string | null;
  estado: "match" | "ya_tiene" | "sin_origen" | "ambiguo";
  detalle?: string;
};

function identidadGrupoParaReparar(g: {
  grado: string;
  nombre: string;
  carreraClave?: string | null;
}): string {
  return `${normalizarGradoCatalogo(g.grado)}|${normalizarGrupoCatalogo(g.nombre)}|${normalizarCarreraCatalogo(g.carreraClave ?? "")}`;
}

/**
 * Plan PURO: por cada fila de `grupo_materias` destino decide si se puede
 * reparar y con qué `tabla_legacy`.
 *
 *  - `match`: hay UN ÚNICO valor de `tabla_legacy` en el origen para la misma
 *    identidad de grupo + materia_id → se propone ese valor.
 *  - `ya_tiene`: la fila destino ya tiene el puente → nunca se pisa.
 *  - `sin_origen`: no hay grupo equivalente en el origen, o el origen no tiene
 *    `tabla_legacy` para esa materia.
 *  - `ambiguo`: el origen tiene DOS valores distintos → NO se elige ninguno.
 */
export function planRepararTablaLegacy(
  gmDestino: FilaGmDestinoReparar[],
  gruposDestino: GrupoDestinoParaPlan[],
  gmOrigen: FilaGmOrigenReparar[],
  gruposOrigen: GrupoOrigenParaPlan[],
): ItemPlanRepararTablaLegacy[] {
  const identidadDestinoPorId = new Map(
    gruposDestino.map((g) => [g.id, identidadGrupoParaReparar(g)]),
  );
  const grupoOrigenPorIdentidad = new Map<string, GrupoOrigenParaPlan>();
  for (const g of gruposOrigen) {
    const clave = identidadGrupoParaReparar(g);
    if (!grupoOrigenPorIdentidad.has(clave)) grupoOrigenPorIdentidad.set(clave, g);
  }

  // Valores candidatos de origen por (grupo origen id, materia_id).
  const candidatosOrigen = new Map<
    string,
    Map<string, Set<string>>
  >();
  for (const gm of gmOrigen) {
    const valor = (gm.tabla_legacy ?? "").trim();
    if (!valor) continue;
    let porMateria = candidatosOrigen.get(gm.grupo_id);
    if (!porMateria) {
      porMateria = new Map();
      candidatosOrigen.set(gm.grupo_id, porMateria);
    }
    const valores = porMateria.get(gm.materia_id) ?? new Set<string>();
    valores.add(valor);
    porMateria.set(gm.materia_id, valores);
  }

  const items: ItemPlanRepararTablaLegacy[] = [];
  for (const gm of gmDestino) {
    const base = {
      id: gm.id,
      grupoId: gm.grupo_id,
      materiaId: gm.materia_id,
      tablaLegacy: null as string | null,
    };
    if ((gm.tabla_legacy ?? "").trim() !== "") {
      items.push({ ...base, estado: "ya_tiene" });
      continue;
    }
    const identidad = identidadDestinoPorId.get(gm.grupo_id);
    if (!identidad) {
      items.push({
        ...base,
        estado: "sin_origen",
        detalle: "grupo destino sin identidad conocida",
      });
      continue;
    }
    const grupoOrigen = grupoOrigenPorIdentidad.get(identidad);
    if (!grupoOrigen) {
      items.push({
        ...base,
        estado: "sin_origen",
        detalle: "sin grupo equivalente en el origen",
      });
      continue;
    }
    const valores = candidatosOrigen
      .get(grupoOrigen.id)
      ?.get(gm.materia_id);
    if (!valores || valores.size === 0) {
      items.push({
        ...base,
        estado: "sin_origen",
        detalle: "sin tabla_legacy equivalente en el origen",
      });
      continue;
    }
    if (valores.size > 1) {
      items.push({
        ...base,
        estado: "ambiguo",
        detalle: [...valores].join(" | "),
      });
      continue;
    }
    const [unico] = valores;
    items.push({ ...base, tablaLegacy: unico ?? null, estado: "match" });
  }
  return items;
}

/** Resultado de aplicar la reparación de `tabla_legacy`. */
export type ResultadoRepararTablaLegacy = {
  ok: boolean;
  mensaje?: string;
  error?: string;
  match: number;
  yaTiene: number;
  sinOrigen: number;
  ambiguos: number;
  aplicados: number;
};

const LOTE_REPARAR_TABLA_LEGACY = 100;

/**
 * Aplica la reparación de `tabla_legacy` para un periodo DESTINO tomando como
 * origen el periodo indicado. Solo escribe las filas `match` (la columna está
 * hoy NULL) y es IDEMPOTENTE: re-ejecutar produce 0 cambios.
 *
 * Lectura: 4 consultas (grupos origen, grupos destino, gm origen, gm destino) +
 * UPDATEs agrupados por valor (`in`), sin N+1 por fila.
 */
export async function repararTablaLegacyDePeriodo(
  supabase: SupabaseClient,
  input: {
    periodoDestinoId: string;
    periodoOrigenId: string;
    /** `true` = solo calcula el plan (preview). Nunca escribe. */
    soloPlan?: boolean;
  },
): Promise<ResultadoRepararTablaLegacy> {
  const vacio = {
    match: 0,
    yaTiene: 0,
    sinOrigen: 0,
    ambiguos: 0,
    aplicados: 0,
  };
  if (!input.periodoDestinoId || !input.periodoOrigenId) {
    return {
      ...vacio,
      ok: false,
      error: "Indica el periodo destino y el periodo origen.",
    };
  }
  if (input.periodoDestinoId === input.periodoOrigenId) {
    return {
      ...vacio,
      ok: false,
      error: "El periodo origen y destino no pueden ser el mismo.",
    };
  }

  const gruposDestino: GrupoDestinoParaPlan[] = (
    await obtenerGruposConCarreraDePeriodo(supabase, input.periodoDestinoId)
  ).map((g) => ({
    id: g.id,
    grado: g.grado,
    nombre: g.nombre,
    carreraId: g.carreraId,
    carreraClave: g.carreraClave,
  }));
  const gruposOrigen: GrupoOrigenParaPlan[] = (
    await obtenerGruposConCarreraDePeriodo(supabase, input.periodoOrigenId)
  ).map((g) => ({
    id: g.id,
    grado: g.grado,
    nombre: g.nombre,
    carreraId: g.carreraId,
    carreraClave: g.carreraClave,
  }));

  const leerGm = async (
    grupos: { id: string }[],
  ): Promise<FilaGmDestinoReparar[]> => {
    const ids = grupos.map((g) => g.id);
    if (ids.length === 0) return [];
    const filas: FilaGmDestinoReparar[] = [];
    for (let i = 0; i < ids.length; i += LOTE_REPARAR_TABLA_LEGACY) {
      const lote = ids.slice(i, i + LOTE_REPARAR_TABLA_LEGACY);
      const { data, error } = await supabase
        .from(TABLA_GRUPO_MATERIAS)
        .select("id, grupo_id, materia_id, tabla_legacy")
        .in("grupo_id", lote)
        .eq("activo", true);
      if (error) throw new Error(`Error leyendo grupo_materias: ${error.message}`);
      filas.push(...((data ?? []) as FilaGmDestinoReparar[]));
    }
    return filas;
  };

  let gmDestino: FilaGmDestinoReparar[] = [];
  let gmOrigen: FilaGmDestinoReparar[] = [];
  try {
    gmDestino = await leerGm(gruposDestino);
    gmOrigen = await leerGm(gruposOrigen);
  } catch (e) {
    return {
      ...vacio,
      ok: false,
      error: e instanceof Error ? e.message : "Error leyendo grupo_materias.",
    };
  }

  const plan = planRepararTablaLegacy(
    gmDestino,
    gruposDestino,
    gmOrigen,
    gruposOrigen,
  );

  let match = 0;
  let yaTiene = 0;
  let sinOrigen = 0;
  let ambiguos = 0;
  const idsPorValor = new Map<string, string[]>();
  for (const item of plan) {
    if (item.estado === "ya_tiene") yaTiene++;
    else if (item.estado === "sin_origen") sinOrigen++;
    else if (item.estado === "ambiguo") ambiguos++;
    else {
      match++;
      const lista = idsPorValor.get(item.tablaLegacy ?? "") ?? [];
      lista.push(item.id);
      idsPorValor.set(item.tablaLegacy ?? "", lista);
    }
  }

  let aplicados = 0;
  if (!input.soloPlan) {
    for (const [valor, ids] of idsPorValor) {
      for (let i = 0; i < ids.length; i += LOTE_REPARAR_TABLA_LEGACY) {
        const lote = ids.slice(i, i + LOTE_REPARAR_TABLA_LEGACY);
        const { error } = await supabase
          .from(TABLA_GRUPO_MATERIAS)
          .update({ tabla_legacy: valor })
          .in("id", lote);
        if (error) {
          return {
            ...vacio,
            match,
            yaTiene,
            sinOrigen,
            ambiguos,
            aplicados,
            ok: false,
            error: `No se pudo actualizar tabla_legacy: ${error.message}`,
          };
        }
      }
      aplicados += ids.length;
    }
  }

  const mensaje = input.soloPlan
    ? `Preview tabla_legacy: ${match} match · ${yaTiene} ya tenían puente · ${sinOrigen} sin origen · ${ambiguos} ambiguos.`
    : `tabla_legacy reparado: ${aplicados} aplicados · ${yaTiene} ya tenían puente · ${sinOrigen} sin origen · ${ambiguos} ambiguos.`;
  return {
    ok: true,
    match,
    yaTiene,
    sinOrigen,
    ambiguos,
    aplicados,
    mensaje,
  };
}

/**
 * Valida que ambos periodos existan de verdad en `periodos` antes de reparar
 * `tabla_legacy` (server-side, nunca confiar en el cliente). Antes vivía en la
 * Server Action; es una lectura de dominio y vive con el resto de la reparación.
 */
export async function validarPeriodosReparacion(
  supabase: SupabaseClient,
  ids: [string, string],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from(TABLA_PERIODOS)
    .select("id")
    .in("id", ids);
  if (error) return { ok: false, error: error.message };
  const encontrados = new Set((data ?? []).map((p) => String((p as { id: string }).id)));
  if (encontrados.size !== ids.length) {
    return { ok: false, error: "Uno de los periodos indicados no existe." };
  }
  return { ok: true };
}



