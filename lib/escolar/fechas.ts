import type { DiaCalendarioRow } from "./calendario";

/**
 * NORMALIZACIÓN CANÓNICA DE FECHAS ESCOLARES (Bloque 5E).
 *
 * `YYYY-MM-DD` es el FORMATO CANÓNICO INTERNO de todas las fechas del sistema.
 * Esta utilidad es la ÚNICA abstracción para convertir a ese formato cualquier
 * representación que pueda producir Excel/Sheets/CSV al editar una plantilla:
 *
 *   - texto ISO:            "2026-08-21"
 *   - separadores:          "2026/08/21", "2026.08.21"
 *   - regional día primero: "21/08/2026", "21-08-2026", "21.08.2026"
 *   - regional mes primero: "08/21/2026", "08-21-2026", "08.21.2026"
 *   - Date de JavaScript
 *   - serial de fecha Excel (número) si el parser XLSX lo entrega como número
 *
 * Reglas críticas:
 *   · NO se usa `new Date(valor)` como mecanismo universal (depende de timezone
 *     y locale). La normalización es explícita y determinista.
 *   · NO se interpreta una fecha ambigua de forma arbitraria. Si no puede
 *     determinarse con seguridad, se reporta como AMBIGUA con sus candidatos.
 *   · La salida válida SIEMPRE es `YYYY-MM-DD`.
 */

export type MotivoFechaInvalida = "vacio" | "formato" | "fecha_imposible";

export type ResultadoNormalizacionFecha =
  | { ok: true; fecha: string }
  | { ok: false; motivo: MotivoFechaInvalida }
  | { ok: false; motivo: "ambigua"; candidatos: string[] };

/** Guard de tipo: ¿el resultado es una fecha válida? */
export function esFechaOk(
  r: ResultadoNormalizacionFecha,
): r is { ok: true; fecha: string } {
  return r.ok === true;
}


/** Convierte una fecha a string ISO `YYYY-MM-DD` (sin hora). */
export function fechaISO(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ¿El texto es un entero no negativo? */
function esEnteroNoNegativo(texto: string): boolean {
  return /^\d+$/.test(texto);
}

/** Valida que una fecha Y-M-D sea real (mes 1-12, día válido para el mes/año). */
function esFechaReal(anio: number, mes: number, dia: number): boolean {
  if (anio < 1900 || anio > 2200) return false;
  if (mes < 1 || mes > 12) return false;
  if (dia < 1 || dia > 31) return false;
  const fecha = new Date(anio, mes - 1, dia);
  return (
    fecha.getFullYear() === anio &&
    fecha.getMonth() === mes - 1 &&
    fecha.getDate() === dia
  );
}

/** Formatea Y-M-D a `YYYY-MM-DD` con ceros a la izquierda. */
function formatearISO(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(
    dia,
  ).padStart(2, "0")}`;
}

/**
 * Convierte un serial de fecha de Excel a `YYYY-MM-DD`.
 *
 * Excel cuenta días desde 1900-01-01 (serial 1) e incluye el bug del año 1900
 * (trata 1900 como bisiesto). Para fechas modernas (serial >= 61) la conversión
 * estándar es: epoch = (serial - 25569) días desde 1970-01-01.
 * Los seriales < 61 corresponden a 1900 y no son relevantes para ciclos
 * escolares, por lo que se devuelven como inválidos.
 */
export function serialExcelAFechaISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 61) return null;
  const MS_POR_DIA = 86400000;
  const fecha = new Date(Math.round((serial - 25569) * MS_POR_DIA));
  if (Number.isNaN(fecha.getTime())) return null;
  return fechaISO(fecha);
}

/**
 * Normaliza un valor a `YYYY-MM-DD` de forma determinista.
 *
 * Acepta: Date, número (serial Excel), o texto en los formatos comunes.
 * Devuelve `{ ok: false, motivo: "ambigua", candidatos }` cuando el texto
 * puede leerse de dos formas (día/mes vs mes/día) y no hay forma segura de
 * decidir sin contexto del calendario.
 */
export function normalizarFechaEscolar(
  valor: unknown,
): ResultadoNormalizacionFecha {
  // 1) Date de JavaScript.
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) {
      return { ok: false, motivo: "fecha_imposible" };
    }
    return { ok: true, fecha: fechaISO(valor) };
  }

  // 2) Número → serial de fecha Excel.
  if (typeof valor === "number") {
    const iso = serialExcelAFechaISO(valor);
    if (!iso) return { ok: false, motivo: "fecha_imposible" };
    return { ok: true, fecha: iso };
  }

  // 3) Texto.
  if (typeof valor !== "string") return { ok: false, motivo: "formato" };
  const texto = valor.trim();
  if (!texto) return { ok: false, motivo: "vacio" };

  // 3a) ISO / separadores con año primero: YYYY-MM-DD | YYYY/MM/DD | YYYY.MM.DD
  const isoMatch = texto.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if (isoMatch) {
    const anio = Number(isoMatch[1]);
    const mes = Number(isoMatch[2]);
    const dia = Number(isoMatch[3]);
    if (!esFechaReal(anio, mes, dia)) {
      return { ok: false, motivo: "fecha_imposible" };
    }
    return { ok: true, fecha: formatearISO(anio, mes, dia) };
  }

  // 3b) Formato con año al final: DD/MM/YYYY | MM/DD/YYYY | DD-MM-YYYY | etc.
  const cortoMatch = texto.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (cortoMatch) {
    const a = Number(cortoMatch[1]);
    const b = Number(cortoMatch[2]);
    const anio = Number(cortoMatch[3]);
    if (anio < 1900 || anio > 2200) return { ok: false, motivo: "fecha_imposible" };

    // `esFechaReal(anio, mes, dia)`. Para "a=día, b=mes" → mes=b, dia=a.
    const diaPrimero = esFechaReal(anio, b, a);
    // Para "a=mes, b=día" → mes=a, dia=b.
    const mesPrimero = esFechaReal(anio, a, b);


    // Ambos componentes <= 12 → ambigüedad real (día/mes vs mes/día).
    if (a <= 12 && b <= 12 && a !== b) {
      const candidatos: string[] = [];
      if (diaPrimero) candidatos.push(formatearISO(anio, b, a));
      if (mesPrimero) candidatos.push(formatearISO(anio, a, b));
      if (candidatos.length > 1) {
        return { ok: false, motivo: "ambigua", candidatos };
      }
      if (candidatos.length === 1) return { ok: true, fecha: candidatos[0]! };
      return { ok: false, motivo: "fecha_imposible" };
    }

    // Solo una interpretación es posible.
    if (diaPrimero) return { ok: true, fecha: formatearISO(anio, b, a) };
    if (mesPrimero) return { ok: true, fecha: formatearISO(anio, a, b) };
    return { ok: false, motivo: "fecha_imposible" };
  }

  // 3c) Texto numérico puro → posible serial Excel escrito como texto.
  if (esEnteroNoNegativo(texto)) {
    const iso = serialExcelAFechaISO(Number(texto));
    if (iso) return { ok: true, fecha: iso };
  }

  return { ok: false, motivo: "formato" };
}

// ============================================================================
// DETECCIÓN DE COLUMNAS DE FECHA EN PLANTILLAS DE ASISTENCIA
// ----------------------------------------------------------------------------
// El calendario escolar es la FUENTE DE VERDAD. Una columna solo se considera
// fecha de asistencia si, tras normalizarse, coincide con un día `tipo='clase'`
// del ciclo seleccionado. Las fechas que no pertenecen al ciclo (festivas,
// descansos, sábados, fuera de rango) se reportan como "no es día de clase".
// ============================================================================

export type EstadoColumnaFecha =
  | "ok"
  | "no_es_dia_clase"
  | "no_reconocible"
  | "ambigua";

export type ColumnaFechaDetectada = {
  /** Índice de la columna en el archivo (0-based). */
  indice: number;
  /** Encabezado original tal como viene en el archivo. */
  encabezadoOriginal: string;
  /** Fecha normalizada `YYYY-MM-DD` (solo si `estado === "ok"`). */
  fecha: string | null;
  /** Estado de la columna. */
  estado: EstadoColumnaFecha;
  /** Candidatos en caso de ambigüedad. */
  candidatos: string[];
  /** Tipo de día del calendario si la fecha existe en el ciclo. */
  tipoDia: string | null;
};

export type ResultadoDeteccionColumnasFecha = {
  /** Columnas reconocidas como días de clase del ciclo (estado "ok"). */
  columnas: ColumnaFechaDetectada[];
  /** Todas las columnas que parecen fechas (incluidas las no válidas). */
  todas: ColumnaFechaDetectada[];
  /** Cantidad de columnas que parecen fecha pero no son día de clase. */
  noDiaClase: number;
  /** Cantidad de columnas que parecen fecha pero no se reconocieron. */
  noReconocibles: number;
  /** Cantidad de columnas ambiguas. */
  ambiguas: number;
};

/**
 * Detecta las columnas de fecha de una plantilla de asistencia.
 *
 * Recorre los encabezados, normaliza cada uno con `normalizarFechaEscolar` y lo
 * compara contra el calendario del ciclo. Construye una sola vez un mapa de
 * fechas válidas (O(n), sin consultas por columna).
 *
 * @param encabezados  Encabezados del archivo (strings).
 * @param calendario   Días del calendario escolar del ciclo (fuente de verdad).
 * @param indicesIgnorar Índices que NO deben tratarse como fecha (CURP, NOMBRE).
 */
export function detectarColumnasFechaAsistencia(
  encabezados: string[],
  calendario: DiaCalendarioRow[],
  indicesIgnorar: number[] = [],
): ResultadoDeteccionColumnasFecha {
  // Mapa fecha YYYY-MM-DD → tipo de día (una sola vez).
  const porFecha = new Map<string, string>();
  for (const d of calendario) {
    porFecha.set(d.fecha, d.tipo);
  }

  const ignorar = new Set(indicesIgnorar);
  const todas: ColumnaFechaDetectada[] = [];

  encabezados.forEach((encabezado, indice) => {
    if (ignorar.has(indice)) return;

    const resultado = normalizarFechaEscolar(encabezado);

    // Caso NO válido: ambigua o inválida.
    if (!esFechaOk(resultado)) {
      if (resultado.motivo === "ambigua") {
        todas.push({
          indice,
          encabezadoOriginal: encabezado,
          fecha: null,
          estado: "ambigua",
          candidatos: resultado.candidatos,
          tipoDia: null,
        });
      }
      // No parece fecha (formato/vacío/imposible) → no se incluye en "todas".
      return;
    }

    // Caso válido: `resultado` es { ok: true; fecha: string }.
    const tipo = porFecha.get(resultado.fecha) ?? null;
    const esDiaClase = tipo === "clase";
    todas.push({
      indice,
      encabezadoOriginal: encabezado,
      fecha: resultado.fecha,
      estado: esDiaClase ? "ok" : "no_es_dia_clase",
      candidatos: [],
      tipoDia: tipo,
    });
  });



  const columnas = todas.filter((c) => c.estado === "ok");
  return {
    columnas,
    todas,
    noDiaClase: todas.filter((c) => c.estado === "no_es_dia_clase").length,
    noReconocibles: todas.filter((c) => c.estado === "no_reconocible").length,
    ambiguas: todas.filter((c) => c.estado === "ambigua").length,
  };
}
