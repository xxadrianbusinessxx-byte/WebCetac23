import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
} from "./catalogo-academico";
import { obtenerGruposConCarreraDePeriodo } from "./horario-semanal";
import {
  TABLA_GRUPOS,
  TABLA_GRUPO_MATERIAS,
  TABLA_PERIODOS,
} from "./tables";

/**
 * CONTEXTO ACADÉMICO DEL CICLO (FASE CONSOLIDACIÓN)
 *
 * Problema real detectado: un `periodos` puede crearse sin `grupos` que lo
 * referencien; cuando el directivo importa roster/horario, todo se rechaza
 * porque «el grupo no existe en el periodo». No es un caso puntual de un ciclo:
 * es estructural.
 *
 * Solución GENERAL (sin duplicar catálogo):
 *   - El catálogo existente ya modela la oferta por ciclo:
 *       grupos.periodo_id  →  grupo_materias.grupo_id  →  materias (globales)
 *       carreras (globales, referenciadas por grupos.carrera_id)
 *   - Este módulo permite «establecer el contexto académico de un ciclo»
 *     CLONANDO la estructura (grupos + grupo_materias) desde un ciclo origen,
 *     reutilizando las mismas carreras y materias por su ID (nunca se copian).
 *   - Nunca elimina histórico: opera sobre el periodo DESTINO (que normalmente
 *     está recién creado). La importación de horario valida después contra este
 *     contexto (código existente).
 */

export type ResultadoContextoCiclo =
  | { ok: true; mensaje?: string }
  | { ok: false; error: string };

/** Grupo del contexto académico (con su carrera legible). */
export type GrupoContextoRow = {
  id: string;
  grado: string;
  grupo: string;
  carreraId: string | null;
  carreraClave: string;
  carreraNombre: string;
};

/** Vista del contexto académico de un periodo (para la UI). */
export type ContextoAcademicoPeriodo = {
  periodoId: string;
  periodoNombre: string;
  grupos: (GrupoContextoRow & { materiasActivas: number })[];
};

/** Grupos con materias de un periodo (2-3 consultas; sin N+1). */
export async function verContextoAcademicoPeriodo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<
  | { ok: true; contexto: ContextoAcademicoPeriodo | null }
  | { ok: false; error: string }
> {
  const { data: periodo, error: eP } = await supabase
    .from(TABLA_PERIODOS)
    .select("id, nombre")
    .eq("id", periodoId)
    .maybeSingle();
  if (eP) return { ok: false, error: eP.message };
  if (!periodo) return { ok: true, contexto: null };

  const grupos = await obtenerGruposConCarreraDePeriodo(supabase, periodoId);
  const gruposIds = grupos.map((g) => g.id);
  const materiasPorGrupo = new Map<string, number>();
  if (gruposIds.length > 0) {
    const { data: gms, error: eG } = await supabase
      .from(TABLA_GRUPO_MATERIAS)
      .select("grupo_id")
      .in("grupo_id", gruposIds)
      .eq("activo", true);
    if (eG) return { ok: false, error: eG.message };
    for (const gm of (gms ?? []) as { grupo_id: string }[]) {
      materiasPorGrupo.set(
        gm.grupo_id,
        (materiasPorGrupo.get(gm.grupo_id) ?? 0) + 1,
      );
    }
  }

  return {
    ok: true,
    contexto: {
      periodoId: String(periodo.id),
      periodoNombre: String(periodo.nombre),
      grupos: grupos.map((g) => ({
        id: g.id,
        grado: g.grado,
        grupo: g.nombre,
        carreraId: g.carreraId,
        carreraClave: g.carreraClave,
        carreraNombre: g.carreraNombre,
        materiasActivas: materiasPorGrupo.get(g.id) ?? 0,
      })),
    },
  };
}

/** Plan puro de clonación (fácil de probar sin Supabase). */
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
    // Materias del ciclo origen por grupo.
  const origenIds = origen.map((g) => g.id);
  const { data: gmOrigen, error: eGM } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("grupo_id, materia_id")
    .in("grupo_id", origenIds)
    .eq("activo", true);
  if (eGM) {
    return { ...vacio, ok: false, error: `Error leyendo materias del ciclo origen: ${eGM.message}` };
  }
  const materiasPorOrigenGrupo = new Map<string, string[]>();
  for (const gm of (gmOrigen ?? []) as { grupo_id: string; materia_id: string }[]) {
    const lista = materiasPorOrigenGrupo.get(gm.grupo_id) ?? [];
    lista.push(gm.materia_id);
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

  const filasMaterias: { grupo_id: string; materia_id: string; activo: boolean }[] = [];
  for (const g of origen) {
    const clave = `${normalizarGradoCatalogo(g.grado)}|${normalizarGrupoCatalogo(g.nombre)}|${normalizarCarreraCatalogo(g.carreraClave)}`;
    const destinoGrupoId = identidadAGrupo.get(clave);
    if (!destinoGrupoId) continue;
    const materias = materiasPorOrigenGrupo.get(g.id) ?? [];
    for (const materiaId of materias) {
      const pareja = `${destinoGrupoId}|${materiaId}`;
      if (existentesDestino.has(pareja)) continue;
      filasMaterias.push({
        grupo_id: destinoGrupoId,
        materia_id: materiaId,
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
    mensaje: `Contexto copiado desde «${String(origenPeriodo.nombre)}» a «${String(destPeriodo.nombre)}».`,
  };
}

