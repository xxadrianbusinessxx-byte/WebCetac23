import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
} from "../catalogo/catalogo-academico";
import { obtenerGruposConCarreraDePeriodo } from "../horario/horario-semanal";
import { normalizarNombre } from "../nombres";
import { listarNombresVisiblesMaterias } from "../materia/nombres-visibles";
import {
  TABLA_CARRERAS,
  TABLA_GRUPO_MATERIAS,
  TABLA_GRUPOS,
  TABLA_MATERIAS,
  TABLA_PERIODOS,
} from "../tables";

/**
 * CONTEXTO ACADÉMICO DEL CICLO · CARGA DESDE EL CATÁLOGO LEGACY.
 *
 * Puebla un ciclo DESTINO con las materias del catálogo legacy (la misma fuente
 * que el panel de materias). Idempotente: no duplica grupos ni parejas
 * (grupo_id, materia_id).
 *
 * Es una de las tres partes del antiguo `lib/escolar/ciclo/contexto-ciclo.ts`
 * (PROMPT E · R-3); `contexto-ciclo.ts` re-exporta las tres.
 */


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

