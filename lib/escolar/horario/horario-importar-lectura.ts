import { normalizarEncabezadoColumna } from "../materia/mapeo-columnas.ts";
import {
  horaAMinutos,
  materiaClaveHorario,
  normalizarDiaSemanaHorario,
  normalizarHoraVisible,
  normalizarTipoClaseHorario,
} from "./horario-semanal.ts";
import type {
  ColumnasHorarioDetectadas,
  FilaHorarioNormalizada,
} from "./horario-importar.ts";

/**
 * HORARIO SEMANAL · IMPORTACIÓN · LECTURA DEL EXCEL.
 *
 * Detección de columnas, descomposición de grado/grupo/carrera, parseo de filas
 * (solo errores de FORMA) y localización de la hoja de detalle en el libro.
 *
 * Primera de las tres partes del antiguo `lib/escolar/horario/horario-importar.ts`
 * (PROMPT E · R-3). Las otras: `./horario-importar-validacion.ts` (duplicados,
 * solapamientos y resolución contra el catálogo) y `./horario-importar-aplicar.ts`
 * (preview, aplicación y plantilla). `horario-importar.ts` re-exporta las tres.
 */


/* ---------------------------------------------------------------------------
 * DETECCIÓN DE COLUMNAS (reutiliza la normalización de encabezados existente)
 * ------------------------------------------------------------------------- */

function buscarColumna(headersNorm: string[], sinonimos: string[]): number {
  return headersNorm.findIndex((h) =>
    sinonimos.some(
      (s) => h === normalizarEncabezadoColumna(s) || h === s,
    ),
  );
}

export function detectarColumnasHorario(
  headers: string[],
): ColumnasHorarioDetectadas {
  const norm = headers.map((h) => normalizarEncabezadoColumna(h));
  const buscar = (sinonimos: string[]) => buscarColumna(norm, sinonimos);
  return {
    idxCarrera: buscar(["CARRERA"]),
    idxGrado: buscar(["GRADO"]),
    idxGrupo: buscar(["GRUPO"]),
    idxGradoGrupo: buscar(["GRADO-GRUPO", "GRUPO-GRADO", "GRUPO GRADO"]),
    idxDia: buscar(["DIA", "DIA DE LA SEMANA", "DAY"]),
    idxHoraInicio: buscar([
      "HORA INICIO",
      "HORA INICIAL",
      "INICIO",
      "HORA DE INICIO",
    ]),
    idxHoraFin: buscar(["HORA FIN", "HORA FINAL", "FIN", "HORA DE FIN"]),
    idxDuracion: buscar([
      "DURACION",
      "DURACION (MIN)",
      "DURACION MIN",
      "DURACION MINUTOS",
    ]),
    idxMateria: buscar([
      "MATERIA",
      "ASIGNATURA",
      "CLASE",
      "NOMBRE DE LA MATERIA",
    ]),
    idxProfesor: buscar(["PROFESOR", "DOCENTE", "MAESTRO"]),
    idxTipoClase: buscar(["TIPO DE CLASE", "TIPO CLASE", "TIPO"]),
  };
}

export function columnasObligatoriasHorario(
  columnas: ColumnasHorarioDetectadas,
): string[] {
  const faltantes: string[] = [];
  if (columnas.idxDia < 0) faltantes.push("Día");
  if (columnas.idxHoraInicio < 0) faltantes.push("Hora inicio");
  if (columnas.idxHoraFin < 0) faltantes.push("Hora fin");
  if (columnas.idxMateria < 0) faltantes.push("Materia");
  const tieneGradoGrupo =
    (columnas.idxGrado >= 0 && columnas.idxGrupo >= 0) ||
    columnas.idxGradoGrupo >= 0;
  if (!tieneGradoGrupo) faltantes.push("Grado y Grupo (o Grado-Grupo)");
  return faltantes;
}

/** Interpreta «Grado-Grupo» combinado (ej. "3°A") como (grado, grupo). */
export function descomponerGradoGrupo(valor: unknown): {
  grado: string;
  grupo: string;
} {
  const t = String(valor ?? "").trim();
  if (!t) return { grado: "", grupo: "" };
  const m = t.match(/^(\d{1,2})\s*(?:[º°o]\s*)?([A-Za-z]\d?)$/);
  if (m) return { grado: m[1]!, grupo: m[2]! };
  const m2 = t.match(/^(\d{1,2})\s*(?:[- ])?\s*([A-Za-z]\d?)$/);
  if (m2) return { grado: m2[1]!, grupo: m2[2]! };
  return { grado: "", grupo: t };
}

function celdaTexto(celda: string | number | null | undefined): string {
  if (celda == null) return "";
  return String(celda).trim();
}

export function filaTexto(fila: (string | number)[]): string[] {
  return fila.map((c) => celdaTexto(c));
}

/**
 * Normaliza una fila de detalle del archivo. Aquí solo se detectan errores de
 * FORMA (día/hora/materia/grupo). La validación contra catálogo llega después.
 */
export function parsearFilaHorario(
  fila: (string | number)[],
  numeroFila: number,
  columnas: ColumnasHorarioDetectadas,
): FilaHorarioNormalizada {
  const texto = filaTexto(fila);
  const celda = (idx: number) => (idx >= 0 ? (texto[idx] ?? "") : "");

  let grado = celda(columnas.idxGrado);
  let grupo = celda(columnas.idxGrupo);
  if (!grado && !grupo && columnas.idxGradoGrupo >= 0) {
    const compuesto = descomponerGradoGrupo(texto[columnas.idxGradoGrupo]);
    grado = compuesto.grado;
    grupo = compuesto.grupo;
  }

  const carrera = celda(columnas.idxCarrera);
  const dia = normalizarDiaSemanaHorario(celda(columnas.idxDia));
  const horaInicio = normalizarHoraVisible(texto[columnas.idxHoraInicio]);
  const horaFin = normalizarHoraVisible(texto[columnas.idxHoraFin]);
  const materia = celda(columnas.idxMateria);
  const profesor = celda(columnas.idxProfesor);
  const tipoClase = normalizarTipoClaseHorario(celda(columnas.idxTipoClase));

  const errores: string[] = [];
  if (!materia) errores.push("Materia vacía");
  if (!grado) errores.push("Grado vacío");
  if (!grupo) errores.push("Grupo vacío");
  if (!dia) {
    errores.push(`Día inválido: «${celda(columnas.idxDia)}»`);
  } else if (dia === "sabado" || dia === "domingo") {
    errores.push("El horario solo admite lunes a viernes");
  }
  if (!horaInicio) errores.push("Hora de inicio inválida");
  if (!horaFin) errores.push("Hora de fin inválida");
  if (horaInicio && horaFin) {
    const a = horaAMinutos(horaInicio);
    const b = horaAMinutos(horaFin);
    if (a !== null && b !== null && b <= a) {
      errores.push("La hora de fin debe ser posterior a la de inicio");
    }
  }

  const durCelda = texto[columnas.idxDuracion];
  const durDeclarada = /^\d+$/.test(durCelda) ? Number(durCelda) : null;

  return {
    filaOrigen: numeroFila,
    carreraOriginal: carrera,
    gradoOriginal: grado,
    grupoOriginal: grupo,
    gradoGrupoOriginal: celda(columnas.idxGradoGrupo),
    dia,
    horaInicio,
    horaFin,
    duracionDeclarada: durDeclarada,
    materia,
    materiaClave: materia ? materiaClaveHorario(materia) : "",
    profesor: /sin profesor asignado/i.test(profesor) ? "" : profesor,
    tipoClase,
    errores,
  };
}


/* ---------------------------------------------------------------------------
 * LECTURA DEL LIBRO EXCEL (xlsx bajo demanda, igual que el resto del proyecto)
 * ------------------------------------------------------------------------- */

export async function leerLibroExcel(
  file: File,
): Promise<{ hojas: Map<string, (string | number)[][]>; ordenHojas: string[] }> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const libro = XLSX.read(buffer, { type: "array" });
  const hojas = new Map<string, (string | number)[][]>();
  for (const nombre of libro.SheetNames) {
    const hoja = libro.Sheets[nombre];
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
      header: 1,
      defval: "",
      raw: true,
    }) as unknown[][];
    hojas.set(
      nombre,
      matriz.map((fila) =>
        fila.map((c) => {
          if (c == null) return "";
          if (typeof c === "number") return c;
          return String(c).trim();
        }),
      ),
    );
  }
  return { hojas, ordenHojas: libro.SheetNames };
}

function filaEsEncabezadoDetalle(fila: (string | number)[]): boolean {
  const headers = filaTexto(fila);
  const columnas = detectarColumnasHorario(headers);
  return columnasObligatoriasHorario(columnas).length === 0;
}

/**
 * Localiza la hoja y la fila de encabezado de detalle.
 * Devuelve null si ninguna hoja contiene las columnas obligatorias.
 */
export function localizarHojaDetalle(
  hojas: Map<string, (string | number)[][]>,
  ordenHojas: string[],
): { hoja: string; filaEncabezado: number; headers: string[] } | null {
  for (const nombre of ordenHojas) {
    const filas = hojas.get(nombre) ?? [];
    for (let i = 0; i < filas.length; i++) {
      if (filaEsEncabezadoDetalle(filas[i]!)) {
        return {
          hoja: nombre,
          filaEncabezado: i,
          headers: filaTexto(filas[i]!),
        };
      }
    }
  }
  return null;
}

export function filaVacia(fila: (string | number)[]): boolean {
  return fila.every((c) => (c == null ? "" : String(c)).trim() === "");
}

