import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
} from "./catalogo-academico";
import { obtenerGruposConCarreraDePeriodo } from "./horario-semanal";
import { normalizarNombre } from "./nombres";
import { listarNombresVisiblesMaterias } from "./nombres-visibles";
import {
  TABLA_CARRERAS,
  TABLA_GRUPO_MATERIAS,
  TABLA_GRUPOS,
  TABLA_MATERIAS,
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

/* ===========================================================================
 * CARGA DE MATERIAS DESDE EL CATÁLOGO LEGACY (CICLOS)
 *
 * Segunda vía del Paso Académico (además de clonar un ciclo origen): poblar un
 * ciclo DESTINO a partir de la MISMA fuente que ya usa el panel de materias
 * (`listarNombresVisiblesMaterias`): las tablas legacy con su nombre visible.
 *
 * Reglas (idénticas a ampliar-materias-15-aliases.sql / clonarContextoAcademico):
 *   1. El nombre físico se interpreta SOLO con el patrón
 *      [GRADO][CARRERA][GRUPO]MAT### del SQL (MC = MECATRONICA).
 *   2. Se busca o crea el grupo (grado + nombre + carrera) en el destino.
 *   3. El `materia_id` se resuelve en el catálogo `materias` reutilizando el
 *      vínculo existente de esa tabla legacy (nunca se inventa una clave si ya
 *      existe la fila); si no hay vínculo, por nombre visible/clave normalizado.
 *   4. `grupo_materias` se inserta SOLO si la pareja (grupo_id, materia_id) no
 *      existía ya. `tabla_legacy` = nombre EXACTO de la tabla legacy.
 *
 * NO crea tablas físicas, NO borra nada y NO toca materias_nombres_visibles
 * (los alias siguen siendo globales y se editan en MateriasConfigPanel).
 * ========================================================================= */

/** Carreras del nombre comprimido legacy (mismo mapeo que el SQL). */
const CARRERA_DESDE_PREFIJO_LEGACY: Readonly<Record<string, string>> = {
  MC: "MECATRONICA",
  RH: "RH",
};

/** Única forma de leer el nombre legacy: [GRADO][CARRERA][GRUPO]MAT###. */
const RE_TABLA_LEGACY_CATALOGO =
  /^(1RO|2DO|3RO|4TO|5TO|6TO)(MC|RH)?([A-D])MAT[0-9]{3}$/;

/** Sufijo romano de grado (p. ej. «CIENCIAS NATURALES I» → «CIENCIAS NATURALES»). */
const RE_ROMANO_FINAL =
  /(?:\s)(?:I{1,3}|IV|V|VI|VII|VIII|IX|X)$/;

type EntradaCatalogoLegacy = {
  /** Nombre exacto de la tabla física legacy (tabla_legacy). */
  tablaLegacy: string;
  /** Nombre visible (alias global) de esa materia. */
  nombreVisible: string;
  grado: string;
  grupo: string;
  carreraClave: string | null;
};

function identidadGrupoKey(g: {
  grado: string;
  grupo: string;
  carreraClave: string | null;
}): string {
  return `${normalizarGradoCatalogo(g.grado)}|${normalizarGrupoCatalogo(g.grupo)}|${normalizarCarreraCatalogo(g.carreraClave ?? "")}`;
}

/**
 * Parsea grado/grupo/carrera de una tabla legacy con el MISMO patrón que usa
 * supabase/ampliar-materias-15-aliases.sql. Devuelve null si el nombre no
 * pertenece a ese patrón (no se inventan formas alternativas de leerlo).
 */
function parsearTablaLegacyCatalogo(
  nombre: string,
): Omit<EntradaCatalogoLegacy, "tablaLegacy" | "nombreVisible"> | null {
  const base = (nombre ?? "").trim().toUpperCase();
  const m = RE_TABLA_LEGACY_CATALOGO.exec(base);
  if (!m) return null;
  const prefijo = m[2] ?? null;
  return {
    grado: m[1]!,
    grupo: m[3]!,
    carreraClave: prefijo
      ? (CARRERA_DESDE_PREFIJO_LEGACY[prefijo] ?? prefijo)
      : null,
  };
}

/** Resultado de cargar materias desde el catálogo legacy hacia un ciclo. */
export type ResultadoCargaMateriasCatalogo = {
  ok: boolean;
  mensaje?: string;
  error?: string;
  /** Grupos creados en el ciclo destino. */
  gruposCreados: number;
  /** Grupos con esa identidad (grado+nombre+carrera) que ya existían. */
  gruposYaExistentes: number;
  /** Vínculos grupo_materias insertados (nuevos). */
  materiasVinculadas: number;
  /** Parejas (grupo_id, materia_id) que ya existían (omitidas). */
  materiasYaVinculadas: number;
  /** Filas creadas en el catálogo global `materias` (normalmente 0). */
  materiasCatalogoCreadas: number;
  /** Entradas de alias que no coinciden con el patrón legacy (se omiten). */
  sinInterpretar: number;
};

/**
 * Puebla el contexto académico de un ciclo DESTINO con las materias del
 * catálogo legacy (misma fuente que MateriasConfigPanel). Idempotente:
 * no duplica grupos ni parejas (grupo_id, materia_id).
 */
export async function cargarMateriasDesdeCatalogo(
  supabase: SupabaseClient,
  periodoDestinoId: string,
): Promise<ResultadoCargaMateriasCatalogo> {
  const vacio: ResultadoCargaMateriasCatalogo = {
    ok: false,
    gruposCreados: 0,
    gruposYaExistentes: 0,
    materiasVinculadas: 0,
    materiasYaVinculadas: 0,
    materiasCatalogoCreadas: 0,
    sinInterpretar: 0,
  };

  if (!periodoDestinoId) {
    return { ...vacio, error: "Indica el ciclo destino." };
  }

  // 1) Fuente idéntica a MateriasConfigPanel (nombres visibles globales).
  const aliases = await listarNombresVisiblesMaterias(supabase);
  if (aliases.size === 0) {
    return {
      ...vacio,
      error: "El catálogo legacy no tiene materias con nombre visible.",
    };
  }

  const { data: destPeriodo, error: eD } = await supabase
    .from(TABLA_PERIODOS)
    .select("id, nombre")
    .eq("id", periodoDestinoId)
    .maybeSingle();
  if (eD) return { ...vacio, error: eD.message };
  if (!destPeriodo) return { ...vacio, error: "El ciclo destino no existe." };

  // 2) Interpreta cada tabla legacy con el único patrón permitido.
  const entradas: EntradaCatalogoLegacy[] = [];
  for (const [tablaLegacy, nombreVisible] of aliases) {
    const identidad = parsearTablaLegacyCatalogo(tablaLegacy);
    if (!identidad) {
      vacio.sinInterpretar++;
      continue;
    }
    entradas.push({
      tablaLegacy,
      nombreVisible,
      grado: identidad.grado,
      grupo: identidad.grupo,
      carreraClave: identidad.carreraClave,
    });
  }
  entradas.sort((a, b) => a.tablaLegacy.localeCompare(b.tablaLegacy));
  if (entradas.length === 0) {
    return {
      ...vacio,
      error: "Ninguna tabla legacy coincide con el patrón [GRADO][CARRERA][GRUPO]MAT###.",
    };
  }

  // 3) Carreras necesarias (resuelve o crea SOLO si falta la fila).
  const carreraIdPorClave = new Map<string, string>();
  for (const clave of [
    ...new Set(
      entradas.map((e) => e.carreraClave).filter((c): c is string => Boolean(c)),
    ),
  ]) {
    const { data: c } = await supabase
      .from(TABLA_CARRERAS)
      .select("id")
      .eq("clave", clave)
      .maybeSingle();
    if (c) {
      carreraIdPorClave.set(clave, c.id);
      continue;
    }
    const { data: creada, error: eC } = await supabase
      .from(TABLA_CARRERAS)
      .insert({ clave, nombre: clave, activo: true })
      .select("id")
      .single();
    if (eC || !creada) {
      return {
        ...vacio,
        error: `No se pudo asegurar la carrera ${clave}: ${eC?.message ?? "sin id"}`,
      };
    }
    carreraIdPorClave.set(clave, creada.id);
  }

  // 4) materia_id por tabla_legacy: reutiliza el vínculo que YA existe en el
  //    catálogo (grupo_materias global) para NO inventar claves nuevas.
  const tablasLegacy = [...new Set(entradas.map((e) => e.tablaLegacy))];
  const { data: gms, error: eGM } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("tabla_legacy, materia_id")
    .in("tabla_legacy", tablasLegacy);
  if (eGM) {
    return { ...vacio, error: `Error leyendo vínculos del catálogo: ${eGM.message}` };
  }

  const materiaPorTabla = new Map<string, string>();
  for (const x of (gms ?? []) as { tabla_legacy: string; materia_id: string }[]) {
    const t = String(x.tabla_legacy ?? "").trim();
    if (!t || !x.materia_id) continue;
    const previo = materiaPorTabla.get(t);
    if (previo && previo !== x.materia_id) {
      // Inconsistencia entre periodos: no confiar en el vínculo; ir por nombre.
      materiaPorTabla.delete(t);
      continue;
    }
    materiaPorTabla.set(t, x.materia_id);
  }

  // Catálogo `materias` (índice por clave/nombre normalizado) para el fallback.
  const { data: materiasCatalogo, error: eMC } = await supabase
    .from(TABLA_MATERIAS)
    .select("id, clave, nombre");
  if (eMC) {
    return { ...vacio, error: `Error leyendo el catálogo de materias: ${eMC.message}` };
  }
  const materiaPorNombre = new Map<string, string>();
  for (const m of (materiasCatalogo ?? []) as {
    id: string;
    clave: string;
    nombre: string | null;
  }[]) {
    materiaPorNombre.set(normalizarNombre(m.clave), m.id);
    if (m.nombre) materiaPorNombre.set(normalizarNombre(m.nombre), m.id);
  }

  let materiasCatalogoCreadas = 0;
  const materiaIdPorEntrada = new Map<string, string>();
  for (const e of entradas) {
    const vinculado = materiaPorTabla.get(e.tablaLegacy);
    if (vinculado) {
      materiaIdPorEntrada.set(e.tablaLegacy, vinculado);
      continue;
    }
    // Fallback por el nombre real (alias): búsqueda por clave/nombre del
    // catálogo; se crea SOLO si no existía la fila.
    const completa = normalizarNombre(e.nombreVisible);
    const candidatos = [completa];
    if (!/MODULO|SUBMODULO/.test(completa)) {
      const reducida = completa.replace(RE_ROMANO_FINAL, "");
      if (reducida && reducida !== completa) candidatos.push(reducida);
    }
    let existente: string | undefined;
    for (const candidato of candidatos) {
      const id = materiaPorNombre.get(candidato);
      if (id) {
        existente = id;
        break;
      }
    }
    if (existente) {
      materiaPorTabla.set(e.tablaLegacy, existente);
      materiaIdPorEntrada.set(e.tablaLegacy, existente);
      continue;
    }
    if (!completa) continue;
    const { data: creada, error: eIns } = await supabase
      .from(TABLA_MATERIAS)
      .insert({ clave: completa, nombre: e.nombreVisible.trim(), activo: true })
      .select("id")
      .single();
    if (eIns || !creada) {
      return {
        ...vacio,
        error: `No se pudo crear la materia ${completa}: ${eIns?.message ?? "sin id"}`,
      };
    }
    materiaPorTabla.set(e.tablaLegacy, creada.id);
    materiaIdPorEntrada.set(e.tablaLegacy, creada.id);
    materiasCatalogoCreadas++;
  }

  // 5) Grupos del destino: resuelve o crea (patrón de clonarContextoAcademico).
  const gruposDestino = await obtenerGruposConCarreraDePeriodo(supabase, periodoDestinoId);
  const identidadAGrupo = new Map<string, string>();
  for (const g of gruposDestino) {
    identidadAGrupo.set(
      `${normalizarGradoCatalogo(g.grado)}|${normalizarGrupoCatalogo(g.nombre)}|${normalizarCarreraCatalogo(g.carreraClave)}`,
      g.id,
    );
  }

  const gruposNecesarios = new Map<
    string,
    { grado: string; grupo: string; carreraClave: string | null }
  >();
  for (const e of entradas) {
    const key = identidadGrupoKey(e);
    if (!gruposNecesarios.has(key)) {
      gruposNecesarios.set(key, {
        grado: e.grado,
        grupo: e.grupo,
        carreraClave: e.carreraClave,
      });
    }
  }
  const gruposPorCrear = [...gruposNecesarios.values()].filter(
    (g) => !identidadAGrupo.has(identidadGrupoKey(g)),
  );
  let gruposYaExistentes = 0;
  for (const g of gruposNecesarios.values()) {
    if (identidadAGrupo.has(identidadGrupoKey(g))) gruposYaExistentes++;
  }

  let gruposCreados = 0;
  if (gruposPorCrear.length > 0) {
    const filas = gruposPorCrear.map((g) => ({
      periodo_id: periodoDestinoId,
      grado: g.grado,
      nombre: g.grupo,
      carrera_id: g.carreraClave
        ? (carreraIdPorClave.get(g.carreraClave) ?? null)
        : null,
      activo: true,
    }));
    const { data: creados, error: eIns } = await supabase
      .from(TABLA_GRUPOS)
      .insert(filas)
      .select("id, grado, nombre, carrera_id");
    if (eIns) {
      return { ...vacio, error: `No se pudieron crear grupos: ${eIns.message}` };
    }
    for (const fila of (creados ?? []) as {
      id: string;
      grado: string;
      nombre: string;
      carrera_id: string | null;
    }[]) {
      const plan = gruposPorCrear.find(
        (g) =>
          g.grado === fila.grado &&
          g.grupo === fila.nombre &&
          (g.carreraClave
            ? (carreraIdPorClave.get(g.carreraClave) ?? null)
            : null) === fila.carrera_id,
      );
      if (!plan) continue;
      identidadAGrupo.set(identidadGrupoKey(plan), fila.id);
    }
    gruposCreados = creados?.length ?? 0;
  }

  // 6) Parejas ya existentes en el ciclo destino (evita duplicados).
  const destinoGrupoIds = [...new Set([...identidadAGrupo.values()])];
  const parejasDestino = new Set<string>();
  if (destinoGrupoIds.length > 0) {
    const { data: gmDest, error: eGD } = await supabase
      .from(TABLA_GRUPO_MATERIAS)
      .select("grupo_id, materia_id")
      .in("grupo_id", destinoGrupoIds);
    if (eGD) {
      return {
        ...vacio,
        gruposCreados,
        gruposYaExistentes,
        error: `Error leyendo materias del ciclo destino: ${eGD.message}`,
      };
    }
    for (const x of (gmDest ?? []) as { grupo_id: string; materia_id: string }[]) {
      parejasDestino.add(`${x.grupo_id}|${x.materia_id}`);
    }
  }

  const filasMaterias: {
    grupo_id: string;
    materia_id: string;
    tabla_legacy: string;
    activo: boolean;
  }[] = [];
  const insertadas = new Set<string>();
  for (const e of entradas) {
    const grupoId = identidadAGrupo.get(identidadGrupoKey(e));
    const materiaId = materiaIdPorEntrada.get(e.tablaLegacy);
    if (!grupoId || !materiaId) {
      return {
        ...vacio,
        gruposCreados,
        gruposYaExistentes,
        materiasCatalogoCreadas,
        error: `Sin referencias para ${e.tablaLegacy} (grupo o materia no resueltos).`,
      };
    }
    const pareja = `${grupoId}|${materiaId}`;
    if (parejasDestino.has(pareja) || insertadas.has(pareja)) continue;
    insertadas.add(pareja);
    filasMaterias.push({
      grupo_id: grupoId,
      materia_id: materiaId,
      tabla_legacy: e.tablaLegacy,
      activo: true,
    });
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
        gruposYaExistentes,
        materiasCatalogoCreadas,
        error: `No se pudieron vincular materias: ${eInsM.message}`,
      };
    }
    materiasVinculadas = filasMaterias.length;
  }
  const materiasYaVinculadas = Math.max(entradas.length - materiasVinculadas, 0);

  return {
    ok: true,
    gruposCreados,
    gruposYaExistentes,
    materiasVinculadas,
    materiasYaVinculadas,
    materiasCatalogoCreadas,
    sinInterpretar: vacio.sinInterpretar,
    mensaje: `Materias cargadas desde el catálogo hacia «${String(destPeriodo.nombre)}»: ${gruposCreados} grupos nuevos · ${materiasVinculadas} materias asignadas.`,
  };
}

