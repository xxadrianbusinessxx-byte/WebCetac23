/**
 * MAPEO EXPLÍCITO DE COLUMNAS DE CALIFICACIONES POR MATERIA — BLOQUE 7C
 *
 * Capa PURA (con funciones de persistencia que reciben el cliente Supabase)
 * que permite al profesor declarar explícitamente qué columnas del archivo
 * representan:
 *   - identidad del alumno (una o más columnas que se concatenan),
 *   - CURP,
 *   - actividades,
 *   - parciales/evaluaciones,
 *   - promedio,
 *   - calificación final,
 *   - columnas a ocultar al alumno.
 *
 * PRINCIPIO:
 *   Es exclusivamente METADATOS + PRESENTACIÓN. La tabla real de la materia
 *   y sus columnas físicas permanecen EXACTAS. El mapeo se aplica solo en
 *   lectura, con prioridad sobre la detección automática del Bloque 7B.
 *
 * REUTILIZACIÓN:
 *   Usa `identificarColumnaCalificacion`/`identificarColumnasCalificaciones`
 *   (7B) para el prellenado y para las columnas no mapeadas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  identificarColumnasCalificaciones,
  vistaConColumnasIdentificadas,
  type RolVistaCalificaciones,
} from "./columnas-calificaciones";
import { normalizarNombre } from "./nombres";
import type { MateriaTablaVista } from "./types";

export type MapeoColumnasMateria = {
  /** Una o más columnas que forman el nombre del alumno (en orden). */
  columnasNombreAlumno: string[];
  columnaCurp: string | null;
  columnasActividades: string[];
  columnasParciales: string[];
  columnaPromedio: string | null;
  columnaFinal: string | null;
  /** Columnas que NO verá el alumno (se conservan físicamente). */
  columnasOcultas: string[];
  /**
   * BLOQUE 9 (PIEZA 1) — Pesos OPCIONALES por actividad para un promedio
   * ponderado calculado SOLO en presentación. Clave = nombre de columna física
   * de actividad (encabezado real del archivo), valor = porcentaje 0-100.
   *   · null (default) = FEATURE APAGADA: comportamiento actual sin cambios.
   *   · La suma puede ser menor a 100 (actividades sin peso aún); nunca mayor.
   *   · NO se escribe en la tabla de materia: solo afecta la vista del alumno.
   */
  pesosActividades: Record<string, number> | null;
};

export type ValidacionMapeoColumnas =
  | { ok: true }
  | { ok: false; errores: string[] };

/** Nombre de la tabla ligera de configuración (no es tabla de materia). */
export const TABLA_MAPEO_COLUMNAS = "materias_mapeo_columnas";

/**
 * A. Prellena un mapeo a partir de la detección automática del Bloque 7B.
 * El resultado es un punto de partida que el profesor puede corregir.
 */
export function mapeoDesdeDeteccionAutomatica(
  encabezados: readonly string[],
): MapeoColumnasMateria {
  const resultado = identificarColumnasCalificaciones(encabezados);
  const cols = resultado.columnas;

  return {
    columnasNombreAlumno: cols
      .filter((c) => c.categoria === "alumno")
      .map((c) => c.encabezadoOriginal),
    columnaCurp:
      cols.find((c) => c.categoria === "curp")?.encabezadoOriginal ?? null,
    columnasActividades: cols
      .filter((c) => c.categoria === "actividad")
      .sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))
      .map((c) => c.encabezadoOriginal),
    columnasParciales: cols
      .filter((c) => c.categoria === "parcial")
      .sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))
      .map((c) => c.encabezadoOriginal),
    columnaPromedio:
      cols.find((c) => c.categoria === "promedio")?.encabezadoOriginal ?? null,
    columnaFinal:
      cols.find((c) => c.categoria === "final")?.encabezadoOriginal ?? null,
    columnasOcultas: [],
    pesosActividades: null, // feature apagada por defecto (BLOQUE 9 / PIEZA 1)
  };
}

/** Nombres legibles de cada categoría para los mensajes de error. */
const NOMBRE_CATEGORIA: Record<string, string> = {
  nombre: "Nombre del alumno",
  curp: "CURP",
  actividad: "Actividad",
  parcial: "Parcial",
  promedio: "Promedio",
  final: "Calificación final",
  oculta: "Oculta",
};

/**
 * B. Valida un mapeo contra los encabezados reales del archivo:
 *   - todas las columnas deben existir;
 *   - sin columnas repetidas dentro de una categoría;
 *   - una columna no puede estar en dos categorías incompatibles;
 *   - debe existir al menos una forma de identificar al alumno
 *     (nombre(s) o CURP);
 *   - máximo un promedio y una calificación final.
 */
export function validarMapeoColumnasMateria(
  mapeo: MapeoColumnasMateria,
  encabezados: readonly string[],
): ValidacionMapeoColumnas {
  const errores: string[] = [];
  const setEncabezados = new Set(encabezados.map((h) => normalizarNombre(h)));
  const existe = (col: string): boolean =>
    setEncabezados.has(normalizarNombre(col));

  // 1) Columnas inexistentes.
  const revisarLista = (lista: readonly string[], categoria: string) => {
    for (const col of lista) {
      if (!existe(col)) {
        errores.push(
          `La columna "${col}" no existe en el archivo (${NOMBRE_CATEGORIA[categoria]}).`,
        );
      }
    }
  };
  revisarLista(mapeo.columnasNombreAlumno, "nombre");
  revisarLista(mapeo.columnasActividades, "actividad");
  revisarLista(mapeo.columnasParciales, "parcial");
  revisarLista(mapeo.columnasOcultas, "oculta");
  if (mapeo.columnaCurp && !existe(mapeo.columnaCurp)) {
    errores.push(`La columna "${mapeo.columnaCurp}" no existe en el archivo.`);
  }
  if (mapeo.columnaPromedio && !existe(mapeo.columnaPromedio)) {
    errores.push(
      `La columna "${mapeo.columnaPromedio}" no existe en el archivo.`,
    );
  }
  if (mapeo.columnaFinal && !existe(mapeo.columnaFinal)) {
    errores.push(`La columna "${mapeo.columnaFinal}" no existe en el archivo.`);
  }

  // 2) Repetidas dentro de la misma categoría.
  const revisarRepetidas = (lista: readonly string[], categoria: string) => {
    const visto = new Set<string>();
    for (const col of lista) {
      const k = normalizarNombre(col);
      if (visto.has(k)) {
        errores.push(
          `La columna "${col}" está repetida en ${NOMBRE_CATEGORIA[categoria]}.`,
        );
      }
      visto.add(k);
    }
  };
  revisarRepetidas(mapeo.columnasNombreAlumno, "nombre");
  revisarRepetidas(mapeo.columnasActividades, "actividad");
  revisarRepetidas(mapeo.columnasParciales, "parcial");
  revisarRepetidas(mapeo.columnasOcultas, "oculta");

  // 3) Una columna en dos categorías incompatibles.
  const asignaciones: { col: string; categoria: string }[] = [];
  mapeo.columnasNombreAlumno.forEach((c) =>
    asignaciones.push({ col: c, categoria: "Nombre del alumno" }),
  );
  if (mapeo.columnaCurp) {
    asignaciones.push({ col: mapeo.columnaCurp, categoria: "CURP" });
  }
  mapeo.columnasActividades.forEach((c) =>
    asignaciones.push({ col: c, categoria: "Actividad" }),
  );
  mapeo.columnasParciales.forEach((c) =>
    asignaciones.push({ col: c, categoria: "Parcial" }),
  );
  if (mapeo.columnaPromedio) {
    asignaciones.push({ col: mapeo.columnaPromedio, categoria: "Promedio" });
  }
  if (mapeo.columnaFinal) {
    asignaciones.push({
      col: mapeo.columnaFinal,
      categoria: "Calificación final",
    });
  }
  mapeo.columnasOcultas.forEach((c) =>
    asignaciones.push({ col: c, categoria: "Oculta" }),
  );

  const porColumna = new Map<string, string>();
  for (const a of asignaciones) {
    const k = normalizarNombre(a.col);
    const prev = porColumna.get(k);
    if (prev && prev !== a.categoria) {
      errores.push(
        `La columna "${a.col}" está asignada simultáneamente como ${prev} y ${a.categoria}.`,
      );
    } else if (!prev) {
      porColumna.set(k, a.categoria);
    }
  }

  // 4) Al menos una forma de identificar al alumno.
  if (mapeo.columnasNombreAlumno.length === 0 && !mapeo.columnaCurp) {
    errores.push(
      "Debe indicar al menos una columna de nombre del alumno o una columna CURP.",
    );
  }

  return errores.length > 0 ? { ok: false, errores } : { ok: true };
}

export type ValidacionPesosActividades =
  | { ok: true }
  | { ok: false; errores: string[] };

/**
 * BLOQUE 9 (PIEZA 1) — Valida los pesos opcionales de actividades:
 *   - las claves deben existir entre `columnasActividades` (por normalización);
 *   - cada valor debe ser un porcentaje entre 0 y 100;
 *   - la suma NO puede superar 100 (permite menos de 100: hay actividades sin
 *     peso todavía);
 *   - null = no configurado (feature apagada) → siempre válido.
 * Función PURA: no consulta ni escribe en Supabase.
 */
export function validarPesosActividades(
  pesos: Record<string, number> | null,
  columnasActividades: readonly string[],
): ValidacionPesosActividades {
  if (!pesos) return { ok: true };
  const errores: string[] = [];
  const disponibles = new Set(
    columnasActividades.map((c) => normalizarNombre(c)),
  );
  let suma = 0;
  for (const [columna, peso] of Object.entries(pesos)) {
    if (!disponibles.has(normalizarNombre(columna))) {
      errores.push(
        `La actividad «${columna}» no está entre las actividades detectadas.`,
      );
    }
    if (!Number.isFinite(peso) || peso < 0 || peso > 100) {
      errores.push(
        `El peso de «${columna}» debe ser un porcentaje entre 0 y 100.`,
      );
    }
    suma += peso;
  }
  if (suma > 100) {
    errores.push(`La suma de los pesos (${suma}%) no puede superar 100%.`);
  }
  return errores.length > 0 ? { ok: false, errores } : { ok: true };
}

/**
 * BLOQUE 9 (PIEZA 1) — Calcula el promedio ponderado de las actividades de una
 * vista YA TRAÍDA (el mismo objeto `MateriaTablaVista` que usa
 * `aplicarMapeoAVista`, con `columnasIdentificadas` y `filas[0]`). Es SOLO
 * PRESENTACIÓN: se calcula al vuelo en memoria y NUNCA escribe en Supabase ni
 * en las tablas físicas de materia.
 *
 * Devuelve null si:
 *   - `pesosActividades` es null (feature apagada); o
 *   - la fila no tiene un valor numérico para alguna actividad con peso.
 *
 * Las actividades SIN peso configurado no participan en el cálculo.
 */
export function calcularPromedioPonderado(
  vista: MateriaTablaVista,
  pesosActividades: Record<string, number> | null,
): number | null {
  if (!pesosActividades) return null;
  const fila = vista.filas[0] ?? [];
  const columnas = vista.columnasIdentificadas ?? [];
  const pesos = new Map<string, number>();
  for (const [k, v] of Object.entries(pesosActividades)) {
    pesos.set(normalizarNombre(k), v);
  }
  let sumaPesos = 0;
  let sumaValores = 0;
  for (let i = 0; i < columnas.length; i++) {
    const col = columnas[i]!;
    if (col.categoria !== "actividad") continue;
    const peso = pesos.get(normalizarNombre(col.encabezadoOriginal));
    if (peso === undefined) continue; // actividad sin peso configurado
    const celda = String(fila[i] ?? "")
      .trim()
      .replace(",", ".")
      .replace("%", "");
    const valor = Number(celda);
    if (!Number.isFinite(valor)) return null; // falta algún valor numérico
    sumaPesos += peso;
    sumaValores += valor * peso;
  }
  if (sumaPesos <= 0) return null;
  return Math.round((sumaValores / sumaPesos) * 100) / 100;
}

/**
 * C. Aplica el mapeo explícito a una vista (presentación). El mapeo tiene
 * prioridad sobre la detección automática 7B; las columnas no mapeadas se
 * resuelven automáticamente. NO toca Supabase.
 */
export function aplicarMapeoAVista(
  vista: MateriaTablaVista,
  mapeo: MapeoColumnasMateria,
  opciones: { rol?: RolVistaCalificaciones } = {},
): MateriaTablaVista {
  return vistaConColumnasIdentificadas(vista, {
    rol: opciones.rol,
    mapeo,
  });
}

/**
 * Valida la ESTRUCTURA de un valor como MapeoColumnasMateria (para no
 * confiar en el navegador). No valida contra encabezados; eso lo hace
 * `validarMapeoColumnasMateria`.
 */
export function esMapeoColumnasMateria(
  valor: unknown,
): valor is MapeoColumnasMateria {
  if (!valor || typeof valor !== "object") return false;
  const m = valor as Record<string, unknown>;
  const esLista = (v: unknown): boolean =>
    Array.isArray(v) && v.every((x) => typeof x === "string");
  return (
    esLista(m.columnasNombreAlumno) &&
    (m.columnaCurp === null || typeof m.columnaCurp === "string") &&
    esLista(m.columnasActividades) &&
    esLista(m.columnasParciales) &&
    (m.columnaPromedio === null || typeof m.columnaPromedio === "string") &&
    (m.columnaFinal === null || typeof m.columnaFinal === "string") &&
    esLista(m.columnasOcultas) &&
    // BLOQUE 9 (PIEZA 1): pesos opcionales. undefined se acepta por
    // compatibilidad con mapeos antiguos (se persiste como null).
    (m.pesosActividades === null ||
      m.pesosActividades === undefined ||
      (typeof m.pesosActividades === "object" &&
        !Array.isArray(m.pesosActividades) &&
        Object.values(m.pesosActividades as Record<string, unknown>).every(
          (v) => typeof v === "number" && Number.isFinite(v),
        )))
  );
}

export type ResolucionColumnaFisica =
  | { ok: true; fisico: string }
  | { ok: false; error: string };

/**
 * Toggle de una columna en una lista usando NORMALIZACIÓN (BLOQUE 7C.1/7C.2):
 *   - si NO está (por normalización) → se marca (añade);
 *   - si está con el MISMO texto físico → se desmarca (remueve);
 *   - si está con una VARIANTE (p. ej. «P. De partida\n10%» vs
 *     «P. De partida 10%») → se reemplaza por el texto ACTUAL (sin duplicar).
 */
export function toggleColumnaEnLista(
  lista: string[],
  col: string,
): string[] {
  const n = normalizarNombre(col);
  const idx = lista.findIndex((c) => normalizarNombre(c) === n);
  if (idx < 0) return [...lista, col];
  if (lista[idx] === col) {
    return lista.filter((c) => normalizarNombre(c) !== n);
  }
  return lista.map((c) => (normalizarNombre(c) === n ? col : c));
}

/**
 * Resuelve una referencia de columna al NOMBRE FÍSICO REAL:
 *  1) coincidencia exacta primero;
 *  2) si no, coincidencia normalizada (mayúsculas/tildes/espacios);
 *  3) exactamente una coincidencia → devuelve el encabezado físico real;
 *  4) más de una → RECHAZA por ambigüedad (nunca elige arbitrariamente);
 *  5) ninguna → RECHAZA.
 *
 * La normalización solo COMPARA; el resultado es siempre el encabezado
 * físico REAL del archivo. Referencia vacía → ok con físico "" (no aplica).
 */
export function resolverColumnaFisica(
  referencia: string | null | undefined,
  encabezados: readonly string[],
): ResolucionColumnaFisica {
  const ref = (referencia ?? "").trim();
  if (!ref) return { ok: true, fisico: "" };

  const exacta = encabezados.find((h) => h.trim() === ref);
  if (exacta) return { ok: true, fisico: exacta };

  const nRef = normalizarNombre(ref);
  const coincidencias = encabezados.filter((h) => normalizarNombre(h) === nRef);

  if (coincidencias.length === 1) return { ok: true, fisico: coincidencias[0]! };
  if (coincidencias.length > 1) {
    return {
      ok: false,
      error: `Existe más de una columna que coincide con «${ref}» por normalización. Selecciona la columna física exacta.`,
    };
  }
  return { ok: false, error: `La columna «${ref}» no existe en el archivo.` };
}

export type ResolucionMapeoFisico =
  | { ok: true; mapeo: MapeoColumnasMateria }
  | { ok: false; errores: string[] };

/**
 * Resuelve TODAS las referencias de un mapeo al nombre físico real del
 * archivo. Se usa ANTES de guardar para que `materias_mapeo_columnas`
 * almacene siempre el encabezado físico exacto (nunca variantes).
 */
export function resolverMapeoColumnasAFisico(
  mapeo: MapeoColumnasMateria,
  encabezados: readonly string[],
): ResolucionMapeoFisico {
  const errores: string[] = [];

  const resolverLista = (lista: readonly string[]): string[] => {
    const out: string[] = [];
    for (const ref of lista) {
      const r = resolverColumnaFisica(ref, encabezados);
      if (!r.ok) {
        errores.push(r.error);
      } else if (r.fisico) {
        out.push(r.fisico);
      }
    }
    return out;
  };

  const curpR = resolverColumnaFisica(mapeo.columnaCurp, encabezados);
  const promR = resolverColumnaFisica(mapeo.columnaPromedio, encabezados);
  const finR = resolverColumnaFisica(mapeo.columnaFinal, encabezados);
  if (!curpR.ok) errores.push(curpR.error);
  if (!promR.ok) errores.push(promR.error);
  if (!finR.ok) errores.push(finR.error);

  // BLOQUE 9 (PIEZA 1): resolver cada clave de peso al encabezado físico real.
  const pesosFisicos: Record<string, number> = {};
  if (mapeo.pesosActividades) {
    for (const [ref, peso] of Object.entries(mapeo.pesosActividades)) {
      const r = resolverColumnaFisica(ref, encabezados);
      if (!r.ok) {
        errores.push(r.error);
      } else if (r.fisico) {
        pesosFisicos[r.fisico] = peso;
      }
    }
  }

  if (errores.length > 0) return { ok: false, errores };
  if (!curpR.ok || !promR.ok || !finR.ok) {
    return { ok: false, errores: ["No se pudo resolver el mapeo a columnas físicas."] };
  }

  return {
    ok: true,
    mapeo: {
      columnasNombreAlumno: resolverLista(mapeo.columnasNombreAlumno),
      columnaCurp: curpR.fisico || null,
      columnasActividades: resolverLista(mapeo.columnasActividades),
      columnasParciales: resolverLista(mapeo.columnasParciales),
      columnaPromedio: promR.fisico || null,
      columnaFinal: finR.fisico || null,
      columnasOcultas: resolverLista(mapeo.columnasOcultas),
      pesosActividades:
        Object.keys(pesosFisicos).length > 0 ? pesosFisicos : null,
    },
  };
}

export type ColisionEncabezados = {
  normalizado: string;
  grupo: string[];
};

/**
 * Detecta encabezados que colisionan por normalización (mismo normalizado,
 * distinto texto físico), p. ej. "CALIFICACION FINAL" y "Calificación final".
 * NO los fusiona ni elimina: solo informa de la ambigüedad para advertir al
 * profesor. Físicamente son columnas distintas.
 */
export function detectarColisionesEncabezados(
  encabezados: readonly string[],
): ColisionEncabezados[] {
  const porNorm = new Map<string, string[]>();
  for (const h of encabezados) {
    const n = normalizarNombre(h);
    const arr = porNorm.get(n) ?? [];
    if (!arr.includes(h)) arr.push(h);
    porNorm.set(n, arr);
  }
  const colisiones: ColisionEncabezados[] = [];
  for (const [normalizado, grupo] of porNorm) {
    if (grupo.length > 1) colisiones.push({ normalizado, grupo });
  }
  return colisiones;
}

/* ---------------------------------------------------------------------------
 * PERSISTENCIA (solo servidor; reciben el cliente Supabase)
 * ------------------------------------------------------------------------- */

/** Normaliza una lista de columnas: trim, sin vacíos, sin duplicados. */
function limpiarLista(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const unicos = new Set<string>();
  const out: string[] = [];
  for (const v of valor) {
    const t = String(v ?? "").trim();
    if (!t) continue;
    const k = normalizarNombre(t);
    if (unicos.has(k)) continue;
    unicos.add(k);
    out.push(t);
  }
  return out;
}

function mapeoDesdeFila(fila: Record<string, unknown>): MapeoColumnasMateria {
  const texto = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  return {
    columnasNombreAlumno: limpiarLista(fila.columnas_nombre_alumno),
    columnaCurp: texto(fila.columna_curp),
    columnasActividades: limpiarLista(fila.columnas_actividades),
    columnasParciales: limpiarLista(fila.columnas_parciales),
    columnaPromedio: texto(fila.columna_promedio),
    columnaFinal: texto(fila.columna_final),
    columnasOcultas: limpiarLista(fila.columnas_ocultas),
    // BLOQUE 9 (PIEZA 1): jsonb { "<columna>": <porcentaje 0-100> } o null.
    pesosActividades: leerPesosActividades(fila.pesos_actividades),
  };
}

/**
 * BLOQUE 9 (PIEZA 1) — Lee el jsonb `pesos_actividades` de una fila de
 * `materias_mapeo_columnas`. Devuelve null si no hay configuración (feature
 * apagada) o si el valor no es un objeto válido con valores numéricos.
 */
function leerPesosActividades(
  valor: unknown,
): Record<string, number> | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    const clave = k.trim();
    const num = Number(v);
    if (!clave || !Number.isFinite(num)) return null;
    out[clave] = num;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Lee la configuración de mapeo de una materia (o null si no existe). */
export async function obtenerMapeoColumnasMateria(
  supabase: SupabaseClient,
  idInterno: string,
): Promise<MapeoColumnasMateria | null> {
  const { data, error } = await supabase
    .from(TABLA_MAPEO_COLUMNAS)
    .select("*")
    .eq("materia_id", idInterno.trim())
    .maybeSingle();

  if (error || !data || data.activo === false) return null;
  return mapeoDesdeFila(data as Record<string, unknown>);
}

/**
 * Guarda (UPSERT) la configuración de mapeo de una materia por `materia_id`.
 * Re-guardar actualiza, nunca duplica. NO modifica la tabla de la materia.
 */
export async function guardarMapeoColumnasMateria(
  supabase: SupabaseClient,
  idInterno: string,
  mapeo: MapeoColumnasMateria,
  actualizadoPor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = idInterno.trim();
  if (!id) return { ok: false, error: "Materia no válida." };

  const { error } = await supabase.from(TABLA_MAPEO_COLUMNAS).upsert(
    {
      materia_id: id,
      columnas_nombre_alumno: limpiarLista(mapeo.columnasNombreAlumno),
      columna_curp: mapeo.columnaCurp?.trim() || null,
      columnas_actividades: limpiarLista(mapeo.columnasActividades),
      columnas_parciales: limpiarLista(mapeo.columnasParciales),
      columna_promedio: mapeo.columnaPromedio?.trim() || null,
      columna_final: mapeo.columnaFinal?.trim() || null,
      columnas_ocultas: limpiarLista(mapeo.columnasOcultas),
      // BLOQUE 9 (PIEZA 1): null = feature apagada (sin promedio ponderado).
      pesos_actividades: mapeo.pesosActividades ?? null,
      activo: true,
      actualizado_por: actualizadoPor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "materia_id" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}


