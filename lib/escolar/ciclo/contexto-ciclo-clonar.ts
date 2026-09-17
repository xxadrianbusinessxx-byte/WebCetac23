import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
} from "../catalogo/catalogo-academico";
import { obtenerGruposConCarreraDePeriodo } from "../horario/horario-semanal";
import { TABLA_GRUPO_MATERIAS, TABLA_GRUPOS, TABLA_PERIODOS } from "../tables";

/**
 * CONTEXTO ACADÉMICO DEL CICLO · CLONACIÓN (FASE CONSOLIDACIÓN).
 *
 * Copia la estructura académica (grupos + `grupo_materias` + horario, según el
 * plan) de un periodo ORIGEN a un periodo DESTINO, reutilizando carreras y
 * materias por su ID: nunca se copian ni se borran. El plan puro decide qué se
 * agrega.
 *
 * Es una de las tres partes del antiguo `lib/escolar/ciclo/contexto-ciclo.ts`
 * (PROMPT E · R-3). Las otras: `./contexto-ciclo-catalogo.ts` (poblar desde el
 * catálogo legacy) y `./contexto-ciclo-reparar.ts` (reparar `tabla_legacy`).
 * `contexto-ciclo.ts` queda como fachada y re-exporta las tres.
 */


export type PlanClonContexto = {
  /** Grupos destino por crear: identidad + id del grupo origen para copiar materias. */
  gruposPorCrear: {
    grado: string;
    grupo: string;
    carreraClave: string;
    carreraId: string | null;
    origenGrupoId: string;
  }[];
  /** Parejas (grupo destino identidad, origenGrupoId) para los que SÍ existían. */
  gruposCoincidentes: number;
  origenGruposTotal: number;
  destinoGruposTotal: number;
};

export type GrupoOrigenParaPlan = {
  id: string;
  grado: string;
  nombre: string;
  carreraId: string | null;
  carreraClave: string;
};

export type GrupoDestinoParaPlan = {
  id: string;
  grado: string;
  nombre: string;
  carreraId: string | null;
  carreraClave: string;
};

/** Función PURA: calcula qué grupos deben crearse en el destino. */
export function planificarGruposAClonar(
  origen: GrupoOrigenParaPlan[],
  destino: GrupoDestinoParaPlan[],
): PlanClonContexto {
  const identidadDestino = new Set(
    destino.map((g) => `${normalizarGradoCatalogo(g.grado)}|${normalizarGrupoCatalogo(g.nombre)}|${normalizarCarreraCatalogo(g.carreraClave)}`),
  );
  const gruposPorCrear: PlanClonContexto["gruposPorCrear"] = [];
  let gruposCoincidentes = 0;
  for (const g of origen) {
    const clave = `${normalizarGradoCatalogo(g.grado)}|${normalizarGrupoCatalogo(g.nombre)}|${normalizarCarreraCatalogo(g.carreraClave)}`;
    if (identidadDestino.has(clave)) {
      gruposCoincidentes++;
      continue;
    }
    gruposPorCrear.push({
      grado: g.grado,
      grupo: g.nombre,
      carreraClave: g.carreraClave,
      carreraId: g.carreraId,
      origenGrupoId: g.id,
    });
  }
  return {
    gruposPorCrear,
    gruposCoincidentes,
    origenGruposTotal: origen.length,
    destinoGruposTotal: destino.length,
  };
}

/** Resultado de aplicar la clonación del contexto académico. */
export type ResultadoClonContexto = {
  ok: boolean;
  mensaje?: string;
  error?: string;
  gruposCreados: number;
  gruposYaExistentes: number;
  materiasVinculadas: number;
  materiasOmitidas: number;
  /** Filas insertadas SIN tabla_legacy (el origen no tenía puente físico). */
  materiasSinTablaLegacy: number;
};

/**
 * Copia el contexto académico (grupos + grupo_materias) de un periodo ORIGEN a
 * un periodo DESTINO. Reutiliza carreras y materias existentes por su ID.
 * No borra nada: solo agrega en el destino lo que falte.
 */
export async function clonarContextoAcademico(
  supabase: SupabaseClient,
  input: { periodoOrigenId: string; periodoDestinoId: string },
): Promise<ResultadoClonContexto> {
  const vacio = {
    gruposCreados: 0,
    gruposYaExistentes: 0,
    materiasVinculadas: 0,
    materiasOmitidas: 0,
    materiasSinTablaLegacy: 0,
  };

  if (!input.periodoOrigenId || !input.periodoDestinoId) {
    return { ...vacio, ok: false, error: "Indica ciclo origen y ciclo destino." };
  }
  if (input.periodoOrigenId === input.periodoDestinoId) {
    return {
      ...vacio,
      ok: false,
      error: "El ciclo origen y destino no pueden ser el mismo.",
    };
  }

  const { data: origenPeriodo, error: eO } = await supabase
    .from(TABLA_PERIODOS)
    .select("id, nombre")
    .eq("id", input.periodoOrigenId)
    .maybeSingle();
  const { data: destPeriodo, error: eD } = await supabase
    .from(TABLA_PERIODOS)
    .select("id, nombre")
    .eq("id", input.periodoDestinoId)
    .maybeSingle();
  if (eO || eD) {
    return {
      ...vacio,
      ok: false,
      error: eO?.message ?? eD?.message ?? "Error validando ciclos.",
    };
  }
  if (!origenPeriodo || !destPeriodo) {
    return { ...vacio, ok: false, error: "El ciclo origen o destino no existe." };
  }

  const origen = await obtenerGruposConCarreraDePeriodo(supabase, input.periodoOrigenId);
  if (origen.length === 0) {
    return {
      ...vacio,
      ok: false,
      error: `El ciclo «${origenPeriodo.nombre}» no tiene grupos en el catálogo. Usa primero la carga académica/roster del ciclo origen.`,
    };
  }
  const destino = await obtenerGruposConCarreraDePeriodo(supabase, input.periodoDestinoId);

  const plan = planificarGruposAClonar(origen, destino);

  // Mapa identidad (normalizada) → grupo destino (existentes + nuevos).
  const identidadAGrupo = new Map<string, string>();
  for (const g of destino) {
    identidadAGrupo.set(
      `${normalizarGradoCatalogo(g.grado)}|${normalizarGrupoCatalogo(g.nombre)}|${normalizarCarreraCatalogo(g.carreraClave)}`,
      g.id,
    );
  }

  let gruposCreados = 0;
  if (plan.gruposPorCrear.length > 0) {
    const filas = plan.gruposPorCrear.map((g) => ({
      periodo_id: input.periodoDestinoId,
      grado: g.grado,
      nombre: g.grupo,
      carrera_id: g.carreraId,
      activo: true,
    }));
    const { data: creados, error: eIns } = await supabase
      .from(TABLA_GRUPOS)
      .insert(filas)
      .select("id, grado, nombre, carrera_id");
    if (eIns) {
      return {
        ...vacio,
        ok: false,
        error: `No se pudieron crear grupos: ${eIns.message}`,
      };
    }
    for (const fila of (creados ?? []) as {
      id: string;
      grado: string;
      nombre: string;
      carrera_id: string | null;
    }[]) {
      const coincide = plan.gruposPorCrear.find(
        (p) =>
          p.grado === fila.grado &&
          p.grupo === fila.nombre &&
          p.carreraId === fila.carrera_id,
      );
      const carreraClave =
        origen.find((o) => o.id === coincide?.origenGrupoId)?.carreraClave ?? "";
      identidadAGrupo.set(
        `${normalizarGradoCatalogo(fila.grado)}|${normalizarGrupoCatalogo(fila.nombre)}|${normalizarCarreraCatalogo(carreraClave)}`,
        fila.id,
      );
    }
    gruposCreados = creados?.length ?? 0;
  }
    // Materias del ciclo origen por grupo (incluye el puente físico tabla_legacy).
  const origenIds = origen.map((g) => g.id);
  const { data: gmOrigen, error: eGM } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("grupo_id, materia_id, tabla_legacy")
    .in("grupo_id", origenIds)
    .eq("activo", true);
  if (eGM) {
    return { ...vacio, ok: false, error: `Error leyendo materias del ciclo origen: ${eGM.message}` };
  }
  const materiasPorOrigenGrupo = new Map<
    string,
    { materiaId: string; tablaLegacy: string | null }[]
  >();
  for (const gm of (gmOrigen ?? []) as {
    grupo_id: string;
    materia_id: string;
    tabla_legacy: string | null;
  }[]) {
    const lista = materiasPorOrigenGrupo.get(gm.grupo_id) ?? [];
    lista.push({ materiaId: gm.materia_id, tablaLegacy: gm.tabla_legacy });
    materiasPorOrigenGrupo.set(gm.grupo_id, lista);
  }

  const destinoIds = [...identidadAGrupo.values()];
  const existentesDestino = new Set<string>();
  if (destinoIds.length > 0) {
    const { data: gmDest, error: eGD } = await supabase
      .from(TABLA_GRUPO_MATERIAS)
      .select("grupo_id, materia_id")
      .in("grupo_id", destinoIds)
      .eq("activo", true);
    if (eGD) {
      return { ...vacio, ok: false, error: `Error leyendo materias del ciclo destino: ${eGD.message}` };
    }
    for (const x of (gmDest ?? []) as { grupo_id: string; materia_id: string }[]) {
      existentesDestino.add(`${x.grupo_id}|${x.materia_id}`);
    }
  }

  const filasMaterias: {
    grupo_id: string;
    materia_id: string;
    tabla_legacy: string | null;
    activo: boolean;
  }[] = [];
  let materiasSinTablaLegacy = 0;
  for (const g of origen) {
    const clave = `${normalizarGradoCatalogo(g.grado)}|${normalizarGrupoCatalogo(g.nombre)}|${normalizarCarreraCatalogo(g.carreraClave)}`;
    const destinoGrupoId = identidadAGrupo.get(clave);
    if (!destinoGrupoId) continue;
    const materias = materiasPorOrigenGrupo.get(g.id) ?? [];
    for (const item of materias) {
      const pareja = `${destinoGrupoId}|${item.materiaId}`;
      if (existentesDestino.has(pareja)) continue;
      if (!item.tablaLegacy) materiasSinTablaLegacy++;
      filasMaterias.push({
        grupo_id: destinoGrupoId,
        materia_id: item.materiaId,
        tabla_legacy: item.tablaLegacy,
        activo: true,
      });
    }
  }

  let materiasVinculadas = 0;
  if (filasMaterias.length > 0) {
    const { error: eInsM } = await supabase
      .from(TABLA_GRUPO_MATERIAS)
      .insert(filasMaterias);
    if (eInsM) {
      return {
        ...vacio,
        gruposCreados,
        gruposYaExistentes: plan.gruposCoincidentes,
        ok: false,
        error: `No se pudieron vincular materias: ${eInsM.message}`,
      };
    }
    materiasVinculadas = filasMaterias.length;
  }

  const totalOrigen =
    [...materiasPorOrigenGrupo.values()].reduce((acc, arr) => acc + arr.length, 0);
  const materiasOmitidas = Math.max(totalOrigen - materiasVinculadas, 0);

  return {
    ok: true,
    gruposCreados,
    gruposYaExistentes: plan.gruposCoincidentes,
    materiasVinculadas,
    materiasOmitidas,
    materiasSinTablaLegacy,
    mensaje: `Contexto copiado desde «${String(origenPeriodo.nombre)}» a «${String(destPeriodo.nombre)}».`,
  };
}

