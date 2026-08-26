/**
 * IDENTIFICACIÓN SEMÁNTICA DE COLUMNAS DE CALIFICACIONES — BLOQUE 7B
 *
 * Capa PURA (sin acceso a Supabase) que interpreta los encabezados de una
 * tabla de calificaciones y los clasifica en categorías semánticas:
 *
 *   alumno · curp · actividad · parcial · promedio · final
 *   asistencia · auxiliar · desconocida
 *
 * PRINCIPIO:
 *   El almacenamiento (tabla real + columnas reales) permanece EXACTO.
 *   Esta capa solo decide cómo se PRESENTA cada columna (etiqueta amigable,
 *   orden, qué columnas son visibles para cada rol).
 *
 * REUTILIZACIÓN:
 *   Usa `normalizarNombre` (lib/escolar/nombres.ts) para comparar ignorando
 *   mayúsculas, tildes y espacios múltiples. No duplica lógica de búsqueda de
 *   alumnos (eso vive en lib/escolar/buscar-en-filas.ts).
 */
import { normalizarNombre } from "./nombres";
import type { MapeoColumnasMateria } from "./mapeo-columnas-materia";
import type { MateriaTablaVista } from "./types";

export type CategoriaColumnaCalificaciones =
  | "alumno"
  | "curp"
  | "actividad"
  | "parcial"
  | "promedio"
  | "final"
  | "asistencia"
  | "auxiliar"
  | "desconocida";

export type InformacionColumnaCalificacion = {
  categoria: CategoriaColumnaCalificaciones;
  /** Número de actividad/parcial (null si no aplica). */
  numero: number | null;
  /** Etiqueta amigable para la UI (ej. "Actividad 1", "Promedio"). */
  etiqueta: string;
  /** Texto real de la columna en la tabla (encabezado original). */
  encabezadoOriginal: string;
  /** true si otro encabezado igual aparece más de una vez (conflicto). */
  duplicado: boolean;
};

export type ResultadoIdentificacionColumnas = {
  /** Clasificación por índice original de encabezados. */
  columnas: InformacionColumnaCalificacion[];
  /** Orden de presentación para profesor/directivo (todas las columnas). */
  ordenPresentacion: InformacionColumnaCalificacion[];
  /** Orden de presentación para el alumno (solo columnas relevantes). */
  visiblesAlumno: InformacionColumnaCalificacion[];
  /** Encabezados repetidos detectados (para aviso). */
  duplicados: string[];
};

export type RolVistaCalificaciones =
  | "alumno"
  | "maestro"
  | "directivo"
  | "tutor"
  | null
  | undefined;

export type OpcionesVistaIdentificada = {
  rol?: RolVistaCalificaciones;
  /**
   * BLOQUE 7C — mapeo explícito de columnas de la materia. Si existe, tiene
   * prioridad sobre la detección automática; las columnas no mapeadas se
   * resuelven con la detección automática (7B).
   */
  mapeo?: MapeoColumnasMateria | null;
};

const ROMANOS: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
};

/** Normaliza un encabezado para comparación (mayúsculas, sin tildes/espacios). */
function normalizarEncabezadoCalificacion(encabezado: string): string {
  const limpio = encabezado
    .replace(/[()[\]{}.,;:¡!¿?'"#*]/g, " ")
    .replace(/[_\-/\\]+/g, " ");
  return normalizarNombre(limpio);
}

/** Convierte "1".."200" o numeral romano (I..X) a número. */
function numeroDesdeTexto(texto: string): number | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  if (/^\d{1,3}$/.test(t)) {
    const n = Number.parseInt(t, 10);
    return n >= 1 && n <= 200 ? n : null;
  }
  return ROMANOS[t.toUpperCase()] ?? null;
}

const PARCIAL_KEYWORDS =
  "PARCIAL|EVALUACION|EVAL|EXAMEN|TRIMESTRE|BIMESTRE|UNIDAD|BLOQUE|PERIODO|CORTE|CALIFICACION|CALIF";

const ORDINALES: Record<string, number> = {
  PRIMER: 1,
  PRIMERA: 1,
  SEGUNDO: 2,
  SEGUNDA: 2,
  TERCER: 3,
  TERCERO: 3,
  TERCERA: 3,
  CUARTO: 4,
  CUARTA: 4,
  QUINTO: 5,
  QUINTA: 5,
  SEXTO: 6,
  SEXTA: 6,
  SEPTIMO: 7,
  SEPTIMA: 7,
  OCTAVO: 8,
  OCTAVA: 8,
  NOVENO: 9,
  NOVENA: 9,
  DECIMO: 10,
  DECIMA: 10,
};

/**
 * Clasifica un único encabezado en una categoría semántica.
 * Nunca modifica el texto original: solo produce una interpretación.
 */
export function identificarColumnaCalificacion(
  encabezado: string,
): Omit<InformacionColumnaCalificacion, "encabezadoOriginal" | "duplicado"> {
  const norm = normalizarEncabezadoCalificacion(encabezado ?? "");
  if (!norm) {
    return {
      categoria: "auxiliar",
      numero: null,
      etiqueta: encabezado ?? "",
    };
  }

  // CURP (antes que "alumno": "CURP ALUMNO" es CURP)
  if (norm.includes("CURP")) {
    return { categoria: "curp", numero: null, etiqueta: "CURP" };
  }

  // Auxiliares claros (antes que "alumno": "NOMBRE DEL DOCENTE", "CLAVE DEL
  // ALUMNO", "NOMBRE DE LA MATERIA" no son la identidad del alumno).
  if (
    norm.includes("CONTROL") ||
    norm.includes("FIRMA") ||
    norm.includes("OBSERVACION") ||
    norm === "OBS" ||
    norm.includes("GRUPO") ||
    norm.includes("GRADO") ||
    norm.includes("SEMESTRE") ||
    norm.includes("CICLO") ||
    norm.includes("TURNO") ||
    norm.includes("MATERIA") ||
    norm.includes("CARRERA") ||
    norm.includes("FECHA") ||
    norm.includes("DOCENTE") ||
    norm.includes("PROFESOR") ||
    norm.includes("NIVEL") ||
    norm.includes("CLAVE")
  ) {
    return { categoria: "auxiliar", numero: null, etiqueta: encabezado };
  }

  // Identidad del alumno
  if (
    norm.includes("NOMBRE") ||
    norm.includes("ALUMNO") ||
    norm.includes("ESTUDIANTE") ||
    norm.includes("APELLIDO") ||
    norm === "PATERNO" ||
    norm === "MATERNO"
  ) {
    return { categoria: "alumno", numero: null, etiqueta: "Alumno" };
  }

  // Actividades: ACT 1 / ACT1 / ACTIVIDAD 1 / ACTIVIDAD NO 1 / ACTIVIDAD I …
  const mAct = norm.match(
    /^ACT(IVIDAD)?\s*(NO|N|NUM|#)?\s*([0-9]{1,3}|[IVX]{1,4})$/,
  );
  if (mAct) {
    const numero = numeroDesdeTexto(mAct[3]!);
    if (numero != null) {
      return {
        categoria: "actividad",
        numero,
        etiqueta: `Actividad ${numero}`,
      };
    }
  }

  // Parciales: P1 / P2 …
  const mP = norm.match(/^P([0-9]{1,2})$/);
  if (mP) {
    const numero = Number.parseInt(mP[1]!, 10);
    if (numero >= 1 && numero <= 99) {
      return { categoria: "parcial", numero, etiqueta: `Parcial ${numero}` };
    }
  }

  // Parciales: PARCIAL 1 / PARCIAL I / EVALUACION 1 / CALIFICACION 1 …
  const mKwNum = norm.match(
    new RegExp(`^(${PARCIAL_KEYWORDS})(ES)?\\s*([0-9]{1,3}|[IVX]{1,4})$`),
  );
  if (mKwNum) {
    const numero = numeroDesdeTexto(mKwNum[3]!);
    if (numero != null) {
      return { categoria: "parcial", numero, etiqueta: `Parcial ${numero}` };
    }
  }

  // Parciales: 1ER PARCIAL / 2DO PARCIAL / 3ER EXAMEN …
  const mNumKw = norm.match(
    new RegExp(`^([0-9]{1,2})\\s*(ER|DO|RO|TO|RA)?\\s*(${PARCIAL_KEYWORDS})$`),
  );
  if (mNumKw) {
    const numero = Number.parseInt(mNumKw[1]!, 10);
    if (numero >= 1 && numero <= 99) {
      return { categoria: "parcial", numero, etiqueta: `Parcial ${numero}` };
    }
  }

  // Parciales: PRIMER PARCIAL / SEGUNDO TRIMESTRE / TERCER EXAMEN …
  const mOrd = norm.match(
    new RegExp(
      `^(PRIMER|PRIMERA|SEGUNDO|SEGUNDA|TERCER|TERCERO|TERCERA|CUARTO|CUARTA|QUINTO|QUINTA|SEXTO|SEXTA|SEPTIMO|SEPTIMA|OCTAVO|OCTAVA|NOVENO|NOVENA|DECIMO|DECIMA)\\s*(${PARCIAL_KEYWORDS})$`,
    ),
  );
  if (mOrd) {
    const numero = ORDINALES[mOrd[1]!];
    if (numero != null) {
      return { categoria: "parcial", numero, etiqueta: `Parcial ${numero}` };
    }
  }

  // Promedio: PROMEDIO / PROM / PROM FINAL / PROMEDIO SEMESTRAL …
  if (norm === "PROM" || norm.includes("PROMEDIO") || norm.startsWith("PROM ")) {
    return { categoria: "promedio", numero: null, etiqueta: "Promedio" };
  }

  // Calificación final / Final / Calificación única
  if (
    norm === "FINAL" ||
    (norm.includes("FINAL") &&
      (norm.includes("CALIF") ||
        norm.includes("NOTA") ||
        norm.includes("CALIFICACION"))) ||
    (!norm.includes("FINAL") &&
      (norm.includes("CALIFICACION") ||
        norm.includes("CALIF") ||
        norm === "NOTA" ||
        norm === "NOTAS"))
  ) {
    return {
      categoria: "final",
      numero: null,
      etiqueta: "Calificación final",
    };
  }

  // Asistencia: FALTAS / ASISTENCIAS / INASISTENCIAS …
  if (norm.includes("FALTA") || norm.includes("ASISTENC")) {
    return { categoria: "asistencia", numero: null, etiqueta: "Asistencia" };
  }

  return { categoria: "desconocida", numero: null, etiqueta: encabezado };
}

const ORDEN_COMPLETO: readonly CategoriaColumnaCalificaciones[] = [
  "alumno",
  "curp",
  "actividad",
  "parcial",
  "promedio",
  "final",
  "asistencia",
  "auxiliar",
  "desconocida",
];

const VISIBLES_ALUMNO: ReadonlySet<CategoriaColumnaCalificaciones> = new Set([
  "alumno",
  "actividad",
  "parcial",
  "promedio",
  "final",
]);

function compararPresentacion(
  a: InformacionColumnaCalificacion,
  b: InformacionColumnaCalificacion,
): number {
  const ca = ORDEN_COMPLETO.indexOf(a.categoria);
  const cb = ORDEN_COMPLETO.indexOf(b.categoria);
  if (ca !== cb) return ca - cb;
  const na = a.numero ?? Number.MAX_SAFE_INTEGER;
  const nb = b.numero ?? Number.MAX_SAFE_INTEGER;
  if (na !== nb) return na - nb;
  return a.encabezadoOriginal.localeCompare(b.encabezadoOriginal, "es");
}

/**
 * Marca como duplicadas las columnas cuyo encabezado original se repite
 * (mismo texto normalizado).
 */
function marcarDuplicados(
  columnas: InformacionColumnaCalificacion[],
): InformacionColumnaCalificacion[] {
  const porNormalizado = new Map<string, number[]>();
  columnas.forEach((c, i) => {
    const k = normalizarNombre(c.encabezadoOriginal);
    const arr = porNormalizado.get(k) ?? [];
    arr.push(i);
    porNormalizado.set(k, arr);
  });
  for (const indices of porNormalizado.values()) {
    if (indices.length > 1) {
      indices.forEach((i) => {
        columnas[i]!.duplicado = true;
      });
    }
  }
  return columnas;
}

/**
 * Clasifica todas las columnas usando un mapeo explícito (BLOQUE 7C) con
 * prioridad. La comparación usa NORMALIZACIÓN (mayúsculas/tildes/espacios)
 * para que el mapeo reconozca la misma columna semántica, PERO siempre se
 * conserva `encabezadoOriginal` = encabezado REAL de la vista (físico).
 * Las columnas no mapeadas caen a la detección automática (7B).
 */
function clasificarConMapeo(
  encabezados: readonly string[],
  mapeo: MapeoColumnasMateria,
): InformacionColumnaCalificacion[] {
  // Normalizados para comparar (nunca se usan como nombre de columna).
  const norm = (s: string) => normalizarNombre(s);
  const nombreAlumno = mapeo.columnasNombreAlumno.map(norm);
  const curp = mapeo.columnaCurp ? norm(mapeo.columnaCurp) : null;
  const actividades = mapeo.columnasActividades.map(norm);
  const parciales = mapeo.columnasParciales.map(norm);
  const promedio = mapeo.columnaPromedio ? norm(mapeo.columnaPromedio) : null;
  const final = mapeo.columnaFinal ? norm(mapeo.columnaFinal) : null;
  const ocultas = mapeo.columnasOcultas.map(norm);

  const columnas = encabezados.map((h) => {
    const nh = norm(h);
    let info: Omit<
      InformacionColumnaCalificacion,
      "encabezadoOriginal" | "duplicado"
    >;

    const idxNombre = nombreAlumno.indexOf(nh);
    if (idxNombre >= 0) {
      info = { categoria: "alumno", numero: null, etiqueta: "Alumno" };
    } else if (curp === nh) {
      info = { categoria: "curp", numero: null, etiqueta: "CURP" };
    } else {
      const nAct = actividades.indexOf(nh);
      if (nAct >= 0) {
        info = {
          categoria: "actividad",
          numero: nAct + 1,
          etiqueta: `Actividad ${nAct + 1}`,
        };
      } else {
        const nPar = parciales.indexOf(nh);
        if (nPar >= 0) {
          info = {
            categoria: "parcial",
            numero: nPar + 1,
            etiqueta: `Parcial ${nPar + 1}`,
          };
        } else if (promedio === nh) {
          info = { categoria: "promedio", numero: null, etiqueta: "Promedio" };
        } else if (final === nh) {
          info = {
            categoria: "final",
            numero: null,
            etiqueta: "Calificación final",
          };
        } else if (ocultas.includes(nh)) {
          info = { categoria: "auxiliar", numero: null, etiqueta: h };
        } else {
          info = identificarColumnaCalificacion(h);
        }
      }
    }

    return { ...info, encabezadoOriginal: h, duplicado: false };
  });

  return marcarDuplicados(columnas);
}

/**
 * Construye la vista de presentación a partir de columnas YA clasificadas:
 * ordena por categoría/número, aplica etiquetas amigables, fusiona las
 * columnas de identidad en una sola columna "Alumno" y (para el alumno)
 * elimina las columnas no relevantes.
 */
export function construirVistaDesdeColumnasClasificadas(
  vista: MateriaTablaVista,
  columnas: InformacionColumnaCalificacion[],
  mostrarTodo: boolean,
): MateriaTablaVista {
  // Fusión de columnas de identidad en una sola columna "Alumno"
  // (el valor es la concatenación de las celdas en el orden de la columna).
  const alumnos = columnas.filter((c) => c.categoria === "alumno");
  let cols = columnas;
  const indicesAlumno = alumnos
    .map((a) => vista.encabezados.indexOf(a.encabezadoOriginal))
    .filter((i) => i >= 0);

  if (alumnos.length > 1) {
    const resto = columnas.filter((c) => c.categoria !== "alumno");
    cols = [
      {
        categoria: "alumno",
        numero: null,
        etiqueta: "Alumno",
        encabezadoOriginal: alumnos[0]!.encabezadoOriginal,
        duplicado: false,
      },
      ...resto,
    ];
  }

  const orden = cols
    .filter((c) => mostrarTodo || VISIBLES_ALUMNO.has(c.categoria))
    .sort(compararPresentacion);

  const indices = orden.map((c) =>
    vista.encabezados.indexOf(c.encabezadoOriginal),
  );

  return {
    encabezados: orden.map((c) => c.etiqueta),
    filas: vista.filas.map((fila) =>
      orden.map((c, j) => {
        if (c.categoria === "alumno" && indicesAlumno.length > 1) {
          return indicesAlumno
            .map((i) => (i >= 0 && i < fila.length ? fila[i] : ""))
            .filter(Boolean)
            .join(" ");
        }
        const i = indices[j]!;
        return i >= 0 && i < fila.length ? fila[i] : "";
      }),
    ),
    columnasIdentificadas: orden,
  };
}

/**
 * Clasifica todos los encabezados de una tabla y produce el orden de
 * presentación para cada rol. Detecta encabezados duplicados.
 */
export function identificarColumnasCalificaciones(
  encabezados: readonly string[],
): ResultadoIdentificacionColumnas {
  const columnas = marcarDuplicados(
    encabezados.map((h) => {
      const { categoria, numero, etiqueta } = identificarColumnaCalificacion(h);
      return {
        categoria,
        numero,
        etiqueta,
        encabezadoOriginal: h,
        duplicado: false,
      };
    }),
  );

  const duplicados = columnas
    .filter((c) => c.duplicado)
    .map((c) => c.encabezadoOriginal)
    .filter((h, i, arr) => arr.indexOf(h) === i);

  const ordenPresentacion = [...columnas].sort(compararPresentacion);
  const visiblesAlumno = [...columnas]
    .filter((c) => VISIBLES_ALUMNO.has(c.categoria))
    .sort(compararPresentacion);

  return { columnas, ordenPresentacion, visiblesAlumno, duplicados };
}

/**
 * Prepara una vista (encabezados + filas) para presentación según el rol:
 *   - alumno: solo columnas relevantes, ordenadas y con etiquetas amigables.
 *   - profesor/directivo: todas las columnas (incluye auxiliares y
 *     desconocidas), ordenadas y con etiquetas amigables.
 *
 * Si se provee `opciones.mapeo` (BLOQUE 7C), el mapeo explícito tiene
 * prioridad; las columnas no mapeadas se resuelven con la detección 7B.
 *
 * NO toca Supabase: trabaja únicamente sobre la vista en memoria y conserva
 * la información original en `columnasIdentificadas.encabezadoOriginal`.
 */
export function vistaConColumnasIdentificadas(
  vista: MateriaTablaVista,
  opciones: OpcionesVistaIdentificada = {},
): MateriaTablaVista {
  const mostrarTodo = opciones.rol !== "alumno";
  const columnas = opciones.mapeo
    ? clasificarConMapeo(vista.encabezados, opciones.mapeo)
    : identificarColumnasCalificaciones(vista.encabezados).columnas;

  return construirVistaDesdeColumnasClasificadas(vista, columnas, mostrarTodo);
}


