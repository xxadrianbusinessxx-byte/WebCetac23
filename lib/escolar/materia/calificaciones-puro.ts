/**
 * calificaciones-puro.ts — MÓDULO PURO. Convierte el Excel del profesor en
 * filas normalizadas de `calificaciones`. Cero I/O.
 *
 * ── Qué resuelve ───────────────────────────────────────────────────────────
 * Hoy el Excel de un profesor acaba en una tabla física por materia —241 de
 * ellas, 240 vacías— donde la nota es TEXTO («90.0»), el nombre de la actividad
 * es el nombre de la columna, y el alumno se identifica por su nombre escrito.
 * Nada de eso se puede promediar, filtrar por alumno ni auditar.
 *
 * Este módulo es el puente: toma la tabla tal como llega y la convierte en
 * filas con `grupo_materia_id`, `curp`, `tipo` y `valor` numérico.
 *
 * ── Lo que NO inventa ──────────────────────────────────────────────────────
 * El SIGNIFICADO de cada columna no lo decide este módulo: lo trae
 * `MapeoColumnasMateria`, que ya existe y que el profesor configura en la
 * pantalla de «Configuración de columnas». Aquí solo se aplica. Duplicar esa
 * clasificación habría sido una segunda fuente para lo mismo (R6).
 *
 * Y la CURP no se adivina. Si el mapeo no declara una columna de CURP, este
 * módulo NO convierte nada y lo dice: una calificación que no se puede atribuir
 * a un alumno no sirve, y colarla con el nombre en su lugar es cómo se acaba
 * escribiendo la nota de alguien en el expediente de otro.
 */
import type { MapeoColumnasMateria } from "./mapeo-columnas-materia.ts";

/** El tipo de nota. Es el mismo `check` que la tabla impone. */
export const TIPOS_CALIFICACION = ["actividad", "parcial", "promedio", "final"] as const;
export type TipoCalificacion = (typeof TIPOS_CALIFICACION)[number];

/** Una fila lista para insertar. `actividadId` lo resuelve quien escribe. */
export type FilaCalificacion = {
  curp: string;
  tipo: TipoCalificacion;
  /** Encabezado REAL del Excel. Es la trazabilidad al archivo del profesor. */
  claveColumna: string;
  valor: number | null;
};

export type TablaDeEntrada = {
  encabezados: string[];
  filas: string[][];
};

export type ResultadoConversion =
  | { ok: true; filas: FilaCalificacion[]; avisos: string[] }
  | { ok: false; error: string };

/* ── Normalización de valores ───────────────────────────────────────────── */

/**
 * Una nota del Excel a número.
 *
 * Devuelve `null` —no 0— cuando la celda está vacía o no es un número. La
 * diferencia importa: `0` es «sacó cero» y `null` es «no hay nota», y
 * confundirlas convierte una actividad no entregada en un cero que baja el
 * promedio.
 *
 * Acepta coma decimal porque los Excel en español la producen.
 */
export function valorNota(celda: unknown): number | null {
  if (typeof celda === "number") return Number.isFinite(celda) ? celda : null;
  if (typeof celda !== "string") return null;
  const t = celda.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** ¿Está dentro de lo que una calificación puede valer? Avisa, no rechaza:
 *  una escala distinta es decisión del plantel, no un error de formato. */
export function notaEnRango(n: number | null): boolean {
  return n === null || (n >= 0 && n <= 100);
}

/** CURP a su forma canónica. Sin validar el formato: eso lo hace el alcance de
 *  la action contra `ALUMNOS`, que es quien sabe si existe. */
export function curpCanonica(celda: unknown): string | null {
  if (typeof celda !== "string") return null;
  const t = celda.trim().toUpperCase();
  return t.length > 0 ? t : null;
}

/* ── El reparto de columnas, según el mapeo ─────────────────────────────── */

/**
 * Qué tipo de nota es cada columna, según el mapeo que el profesor configuró.
 *
 * Las columnas ocultas se excluyen: el mapeo las declara como «no las ve el
 * alumno», y normalizar algo que nadie debe ver sería meterlo en una tabla que
 * el alumno sí consulta.
 */
export function tipoDeColumna(
  encabezado: string,
  mapeo: MapeoColumnasMateria,
): TipoCalificacion | null {
  if (mapeo.columnasOcultas.includes(encabezado)) return null;
  if (mapeo.columnasActividades.includes(encabezado)) return "actividad";
  if (mapeo.columnasParciales.includes(encabezado)) return "parcial";
  if (mapeo.columnaPromedio === encabezado) return "promedio";
  if (mapeo.columnaFinal === encabezado) return "final";
  return null;
}

/** Las columnas que van a producir filas, con su tipo. En orden de aparición,
 *  para que el resultado sea estable entre ejecuciones. */
export function columnasConvertibles(
  encabezados: readonly string[],
  mapeo: MapeoColumnasMateria,
): { indice: number; encabezado: string; tipo: TipoCalificacion }[] {
  const out: { indice: number; encabezado: string; tipo: TipoCalificacion }[] = [];
  encabezados.forEach((e, indice) => {
    const tipo = tipoDeColumna(e, mapeo);
    if (tipo) out.push({ indice, encabezado: e, tipo });
  });
  return out;
}

/* ── La conversión ──────────────────────────────────────────────────────── */

/**
 * Convierte la tabla del profesor en filas de `calificaciones`.
 *
 * Falla —y no convierte nada— en dos casos, los dos a propósito:
 *   · el mapeo no declara columna de CURP: sin identidad del alumno no hay
 *     nada que guardar;
 *   · esa columna no está entre los encabezados: el mapeo es de otro archivo.
 *
 * Fallar entero en vez de convertir «lo que se pueda» es deliberado: media
 * subida es peor que ninguna, porque deja al profesor creyendo que guardó.
 *
 * Las filas sin CURP legible se SALTAN con aviso, no tumban la subida: en un
 * Excel real hay filas de totales y renglones en blanco.
 */
export function convertirTabla(
  tabla: TablaDeEntrada,
  mapeo: MapeoColumnasMateria,
): ResultadoConversion {
  if (!mapeo.columnaCurp) {
    return {
      ok: false,
      error:
        "El mapeo de columnas no declara cuál es la CURP. Configúrala antes de subir: sin ella las notas no se pueden atribuir a ningún alumno.",
    };
  }
  const iCurp = tabla.encabezados.indexOf(mapeo.columnaCurp);
  if (iCurp < 0) {
    return {
      ok: false,
      error: `El archivo no tiene la columna de CURP que el mapeo declara («${mapeo.columnaCurp}»). Puede que el mapeo sea de otro archivo.`,
    };
  }

  const columnas = columnasConvertibles(tabla.encabezados, mapeo);
  if (columnas.length === 0) {
    return {
      ok: false,
      error:
        "Ninguna columna del archivo está clasificada como actividad, parcial, promedio o final. Revisa el mapeo.",
    };
  }

  const filas: FilaCalificacion[] = [];
  const avisos: string[] = [];
  const vistas = new Set<string>();

  tabla.filas.forEach((fila, n) => {
    const curp = curpCanonica(fila[iCurp]);
    if (!curp) {
      avisos.push(`Fila ${n + 1}: sin CURP legible, se omite.`);
      return;
    }
    if (vistas.has(curp)) {
      // Una CURP repetida en el mismo archivo es un error del archivo, no algo
      // que resolver callando: la segunda fila pisaría a la primera en el
      // upsert y nadie sabría cuál quedó.
      avisos.push(`Fila ${n + 1}: la CURP ${curp} ya apareció antes; se omite la repetida.`);
      return;
    }
    vistas.add(curp);

    for (const { indice, encabezado, tipo } of columnas) {
      const valor = valorNota(fila[indice]);
      // Las celdas vacías NO generan fila: guardar `null` para cada actividad
      // sin entregar llenaría la tabla de nada.
      if (valor === null) continue;
      if (!notaEnRango(valor)) {
        avisos.push(`Fila ${n + 1}, «${encabezado}»: ${valor} está fuera de 0-100.`);
      }
      filas.push({ curp, tipo, claveColumna: encabezado, valor });
    }
  });

  if (filas.length === 0) {
    return { ok: false, error: "No se pudo leer ninguna calificación del archivo." };
  }
  return { ok: true, filas, avisos };
}

/* ── Lectura: lo que ve el alumno ───────────────────────────────────────── */

export type CalificacionLeida = {
  curp: string;
  tipo: TipoCalificacion;
  clave_columna: string | null;
  valor: number | null;
};

/**
 * Las notas de UN alumno, agrupadas para presentar.
 *
 * Filtra por CURP aquí también, aunque la consulta ya lo haga: es la última
 * puerta antes de pintar, y la que impide que un fallo de alcance acabe
 * enseñando la nota de otro. Cuesta una comparación.
 */
export function notasDeAlumno(
  todas: readonly CalificacionLeida[],
  curp: string,
): { actividades: CalificacionLeida[]; parciales: CalificacionLeida[]; promedio: number | null; final: number | null } {
  const mias = todas.filter((c) => c.curp === curp);
  const de = (t: TipoCalificacion) => mias.filter((c) => c.tipo === t);
  const uno = (t: TipoCalificacion) => de(t)[0]?.valor ?? null;
  return {
    actividades: de("actividad"),
    parciales: de("parcial"),
    promedio: uno("promedio"),
    final: uno("final"),
  };
}

/**
 * Promedio de las actividades, con los pesos del mapeo si los hay.
 *
 * Sin pesos: media simple. Con pesos: solo cuentan las actividades que tienen
 * peso declarado, y se normaliza por la suma de esos pesos — así un reparto a
 * medio configurar (tres actividades de 20 % cada una) da un promedio sobre lo
 * declarado en vez de castigar al alumno por lo que el profesor no ha puesto.
 */
export function promedioActividades(
  actividades: readonly CalificacionLeida[],
  pesos: Record<string, number> | null,
): number | null {
  const conValor = actividades.filter((a) => a.valor !== null);
  if (conValor.length === 0) return null;

  if (!pesos) {
    const suma = conValor.reduce((s, a) => s + (a.valor ?? 0), 0);
    return Math.round((suma / conValor.length) * 100) / 100;
  }

  let acumulado = 0;
  let pesoTotal = 0;
  for (const a of conValor) {
    const p = a.clave_columna ? pesos[a.clave_columna] : undefined;
    if (typeof p !== "number" || p <= 0) continue;
    acumulado += (a.valor ?? 0) * p;
    pesoTotal += p;
  }
  if (pesoTotal === 0) return null;
  return Math.round((acumulado / pesoTotal) * 100) / 100;
}
