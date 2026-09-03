import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarEncabezadoColumna } from "./mapeo-columnas";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
  normalizarTextoCatalogo,
  type MateriaRow,
} from "./catalogo-academico";
import { TABLA_HORARIO_SEMANAL, TABLA_MATERIAS, TABLA_PERIODOS } from "./tables";
import {
  buscarGrupoEnLista,
  clavesEquivalenciaMateria,
  horaAMinutos,
  materiaClaveHorario,
  normalizarDiaSemanaHorario,
  normalizarHoraVisible,
  normalizarTipoClaseHorario,
  obtenerGruposConCarreraDePeriodo,
  type GrupoConCarrera,
  type HorarioBloqueRow,
} from "./horario-semanal";

/**
 * HORARIO SEMANAL — IMPORTACIÓN DE EXCEL (FASE HORARIO).
 *
 * Pipeline (respeta la arquitectura de importaciones del proyecto):
 *
 *   lectura → normalización → identificación de columnas → validación
 *     → preview → aplicación
 *
 * Idempotente por clave natural (periodo_id, grupo_id, dia_semana,
 * hora_inicio, materia_clave) con reemplazo-diferenciado por periodo:
 * re-subir el MISMO archivo → 0 cambios (sin duplicados); subir un archivo
 * corregido → solo cambian/eliminan las filas que difieren.
 *
 * Reglas:
 *   - La fuente oficial es la hoja de DETALLE. La hoja «Resumen Clases por
 *     Día» (si existe) se usa SOLO como validación cruzada derivada; nunca se
 *     persiste ni se convierte en fuente de verdad.
 *   - «Sin profesor asignado» NO se convierte en un profesor: queda NULL.
 *   - El vínculo `materia_id` con el catálogo es best-effort: si el nombre no
 *     resuelve de forma única, la fila se importa con su texto oficial.
 *   - Errores estructurales (grupo inexistente en el periodo, día/hora
 *     inválidos, duplicados, solapamientos) BLOQUEAN la escritura y se
 *     muestran antes de aplicar, con reporte por fila.
 */

/* ---------------------------------------------------------------------------
 * TIPOS
 * ------------------------------------------------------------------------- */

/** Fila de detalle ya normalizada del archivo (antes de resolver catálogo). */
export type FilaHorarioNormalizada = {
  filaOrigen: number; // número de fila real dentro de la hoja
  carreraOriginal: string;
  gradoOriginal: string;
  grupoOriginal: string;
  gradoGrupoOriginal: string;
  dia: string | null; // clave interna: lunes..viernes
  horaInicio: string; // "HH:MM" o ""
  horaFin: string;
  duracionDeclarada: number | null; // columna opcional (min)
  materia: string;
  materiaClave: string;
  profesor: string; // "" = sin profesor asignado
  tipoClase: string; // normalizado (academica | taller | ...)
  errores: string[];
};

/** Columnas detectadas en la hoja de detalle (índices de columna). */
export type ColumnasHorarioDetectadas = {
  idxCarrera: number;
  idxGrado: number;
  idxGrupo: number;
  idxGradoGrupo: number;
  idxDia: number;
  idxHoraInicio: number;
  idxHoraFin: number;
  idxDuracion: number;
  idxMateria: number;
  idxProfesor: number;
  idxTipoClase: number;
};

/** Estado de una fila frente a lo ya importado (diff). */
export type EstadoFilaHorario =
  | "valida_nueva"
  | "valida_actualizable"
  | "valida_sin_cambio"
  | "rechazada";

export type FilaReporteHorario = {
  filaOrigen: number;
  estado: EstadoFilaHorario;
  grupoLegible: string; // ej. "3RO · A · MC"
  dia: string;
  horaInicio: string;
  horaFin: string;
  materia: string;
  profesor: string;
  errores: string[];
};

export type PreviewImportacionHorario = {
  ok: boolean;
  error?: string;
  periodoNombre: string;
  periodoId: string | null;
  hojaDetalle: string;
  columnasDetectadas: string[];
  columnasFaltantes: string[];
  totalFilasArchivo: number;
  filasValidas: number;
  filasRechazadas: number;
  gruposEncontrados: string[];
  materiasVinculadasCatalogo: number;
  materiasSinVinculo: number;
  profesoresEncontrados: string[];
  nuevas: number;
  actualizables: number;
  sinCambios: number;
  aEliminar: number;
  erroresPorFila: FilaReporteHorario[];
  advertencias: string[];
  /** true = no debe aplicarse (errores estructurales o columnas faltantes). */
  bloqueaEscritura: boolean;
};

export type ResultadoAplicarHorario = {
  ok: boolean;
  error?: string;
  periodoNombre: string;
  aplicadas: number;
  actualizadas: number;
  eliminadas: number;
  sinCambios: number;
  rechazadas: number;
  erroresDetalle: string[];
};

/** Fila lista para escribir en `horario_semanal`. */
export type FilaHorarioParaEscribir = {
  periodo_id: string;
  grupo_id: string;
  dia_semana: string;
  hora_inicio: string;
  hora_fin: string;
  materia_clave: string;
  materia_nombre: string;
  materia_id: string | null;
  tipo_clase: string;
  profesor_clave: null;
  profesor_nombre: string | null;
  fila_origen: number;
  creado_por: string | null;
};


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

function filaTexto(fila: (string | number)[]): string[] {
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

function filaVacia(fila: (string | number)[]): boolean {
  return fila.every((c) => (c == null ? "" : String(c)).trim() === "");
}


/* ---------------------------------------------------------------------------
 * ANÁLISIS DE FILAS (duplicados y solapamientos DENTRO del archivo)
 * ------------------------------------------------------------------------- */

export type ResultadoAnalisisFilas = {
  filas: FilaHorarioNormalizada[];
  erroresPorFila: FilaReporteHorario[];
  totalValidas: number;
  totalRechazadas: number;
};

function grupoLegibleTexto(f: FilaHorarioNormalizada): string {
  return `${normalizarGradoCatalogo(f.gradoOriginal) || f.gradoOriginal} ${f.grupoOriginal} ${normalizarCarreraCatalogo(f.carreraOriginal) || ""}`.trim();
}

function reporteRechazada(
  f: FilaHorarioNormalizada,
  errores: string[],
): FilaReporteHorario {
  return {
    filaOrigen: f.filaOrigen,
    estado: "rechazada",
    grupoLegible: grupoLegibleTexto(f),
    dia: f.dia ?? "",
    horaInicio: f.horaInicio,
    horaFin: f.horaFin,
    materia: f.materia,
    profesor: f.profesor || "Sin profesor asignado",
    errores,
  };
}

/**
 * Valida forma, duplicados y solapamientos del archivo (sin catálogo).
 * Las filas rechazadas se reportan; el resto queda «candidata válida» para la
 * resolución contra el catálogo.
 */
export function analizarFilasHorario(
  filas: FilaHorarioNormalizada[],
): ResultadoAnalisisFilas {
  const erroresPorFila: FilaReporteHorario[] = [];

  // 1) Errores de forma.
  const conFormaValida: FilaHorarioNormalizada[] = [];
  for (const f of filas) {
    if (f.errores.length > 0) {
      erroresPorFila.push(reporteRechazada(f, [...f.errores]));
    } else {
      conFormaValida.push(f);
    }
  }

  // 2) Duplicados dentro del archivo (clave natural con valores originales).
  const vistos = new Set<string>();
  const filasSinDuplicado: FilaHorarioNormalizada[] = [];
  for (const f of conFormaValida) {
    const clave =
      `${normalizarCarreraCatalogo(f.carreraOriginal)}|${normalizarGradoCatalogo(f.gradoOriginal)}|` +
      `${normalizarGrupoCatalogo(f.grupoOriginal)}|${f.dia}|${f.horaInicio}|${f.materiaClave}`;
    if (vistos.has(clave)) {
      erroresPorFila.push(
        reporteRechazada(f, ["Fila duplicada dentro del archivo"]),
      );
    } else {
      vistos.add(clave);
      filasSinDuplicado.push(f);
    }
  }

  // 3) Solapamientos por grupo + día (intervalos [inicio, fin)).
  const porGrupoDia = new Map<string, FilaHorarioNormalizada[]>();
  for (const f of filasSinDuplicado) {
    const clave =
      `${normalizarCarreraCatalogo(f.carreraOriginal)}|${normalizarGradoCatalogo(f.gradoOriginal)}|` +
      `${normalizarGrupoCatalogo(f.grupoOriginal)}|${f.dia}`;
    const lista = porGrupoDia.get(clave) ?? [];
    lista.push(f);
    porGrupoDia.set(clave, lista);
  }
  const rechazadasPorSolape = new Set<number>();
  for (const lista of porGrupoDia.values()) {
    const ordenada = [...lista].sort(
      (a, b) =>
        (horaAMinutos(a.horaInicio) ?? 0) - (horaAMinutos(b.horaInicio) ?? 0),
    );
    for (let i = 1; i < ordenada.length; i++) {
      const prev = ordenada[i - 1]!;
      const actual = ordenada[i]!;
      const finPrev = horaAMinutos(prev.horaFin) ?? 0;
      const iniAct = horaAMinutos(actual.horaInicio) ?? 0;
      if (iniAct < finPrev) {
        rechazadasPorSolape.add(actual.filaOrigen);
        rechazadasPorSolape.add(prev.filaOrigen);
      }
    }
  }

  const filasValidas: FilaHorarioNormalizada[] = [];
  for (const f of filasSinDuplicado) {
    if (rechazadasPorSolape.has(f.filaOrigen)) {
      erroresPorFila.push(
        reporteRechazada(f, [
          "Se solapa con otro bloque del mismo grupo y día (conflicto de horario)",
        ]),
      );
    } else {
      filasValidas.push(f);
    }
  }

  erroresPorFila.sort((a, b) => a.filaOrigen - b.filaOrigen);
  return {
    filas: filasValidas,
    erroresPorFila,
    totalValidas: filasValidas.length,
    totalRechazadas: erroresPorFila.length,
  };
}

/** Conteo derivado por grupo (grado|grupo) y día → para validación cruzada. */
export function conteoDetallePorDia(
  filas: FilaHorarioNormalizada[],
): Map<string, Record<string, number>> {
  const mapa = new Map<string, Record<string, number>>();
  for (const f of filas) {
    if (!f.dia) continue;
    const clave = `${normalizarGradoCatalogo(f.gradoOriginal)}|${normalizarGrupoCatalogo(f.grupoOriginal)}`;
    const porDia = mapa.get(clave) ?? {};
    porDia[f.dia] = (porDia[f.dia] ?? 0) + 1;
    mapa.set(clave, porDia);
  }
  return mapa;
}

function diaDeResumen(headersNorm: string[], idx: number): string | null {
  const mapa: Record<string, string> = {
    LUNES: "lunes",
    MARTES: "martes",
    MIERCOLES: "miercoles",
    JUEVES: "jueves",
    VIERNES: "viernes",
    "TOTAL SEMANA": "total",
    "TOTAL DE LA SEMANA": "total",
  };
  return mapa[headersNorm[idx]!] ?? null;
}


/**
 * Validación cruzada: detalle (fuente oficial) contra la hoja «Resumen Clases
 * por Día» si existe. Solo genera advertencias; el resumen NUNCA se persiste ni
 * se convierte en fuente de verdad.
 */
export function advertenciasResumenVsDetalle(
  hojas: Map<string, (string | number)[][]>,
  ordenHojas: string[],
  filasValidas: FilaHorarioNormalizada[],
): string[] {
  const advertencias: string[] = [];
  const conteoDetalle = conteoDetallePorDia(filasValidas);

  let hojaResumen: string | null = null;
  for (const nombre of ordenHojas) {
    if (/resumen|clases por dia/i.test(nombre)) {
      hojaResumen = nombre;
      break;
    }
  }
  if (!hojaResumen) return advertencias;
  const filasResumen = hojas.get(hojaResumen) ?? [];
  if (filasResumen.length === 0) return advertencias;

  let idxHeader = -1;
  let headersNorm: string[] = [];
  for (let i = 0; i < filasResumen.length && i < 8; i++) {
    const h = filaTexto(filasResumen[i]!).map((x) =>
      normalizarTextoCatalogo(x),
    );
    if (h.some((x) => x === "LUNES" || x === "MARTES")) {
      idxHeader = i;
      headersNorm = h;
      break;
    }
  }
  if (idxHeader < 0) return advertencias;

  const idxGrado = headersNorm.findIndex((h) => h === "GRADO");
  const idxGrupo = headersNorm.findIndex((h) => h === "GRUPO");

  for (let i = idxHeader + 1; i < filasResumen.length; i++) {
    const fila = filaTexto(filasResumen[i]!);
    if (fila.every((c) => c === "")) continue;
    const grado = idxGrado >= 0 ? normalizarGradoCatalogo(fila[idxGrado] ?? "") : "";
    const grupo = idxGrupo >= 0 ? normalizarGrupoCatalogo(fila[idxGrupo] ?? "") : "";
    if (!grado || !grupo) continue;
    const clave = `${grado}|${grupo}`;
    const detalle = conteoDetalle.get(clave);
    if (!detalle) continue;
    for (let c = 0; c < headersNorm.length; c++) {
      const dia = diaDeResumen(headersNorm, c);
      if (!dia || dia === "total") continue;
      const valor = /^\d+$/.test(fila[c] ?? "") ? Number(fila[c]) : null;
      const detalleDia = detalle[dia] ?? 0;
      if (valor !== null && valor !== detalleDia) {
        advertencias.push(
          `Resumen «${hojaResumen}»: ${grado} ${grupo} el ${dia} dice ${valor} clases, pero el detalle tiene ${detalleDia}. Se usará el DETALLE (fuente oficial).`,
        );
      }
    }
  }
  return advertencias;
}

/* ---------------------------------------------------------------------------
 * RESOLUCIÓN CONTRA CATÁLOGO (grupos + materias)
 * ------------------------------------------------------------------------- */

/** Traduce la carrera del archivo a la clave del catálogo (alias). */
export function normalizarCarreraHorario(carrera: string): string {
  const base = normalizarTextoCatalogo(carrera);
  const alias: Record<string, string> = {
    MC: "MECATRONICA",
    MECATRONICA: "MECATRONICA",
    RH: "RH",
    "RECURSOS HUMANOS": "RH",
    RRHH: "RH",
    "SIN CARRERA (TRONCO COMUN)": "",
    "SIN CARRERA": "",
    "TRONCO COMUN": "",
  };
  return alias[base] ?? base;
}

type IndiceMaterias = {
  porClave: Map<string, MateriaRow[]>;
  porNombre: Map<string, MateriaRow[]>;
};

async function cargarIndiceMaterias(
  supabase: SupabaseClient,
): Promise<IndiceMaterias> {
  const porClave = new Map<string, MateriaRow[]>();
  const porNombre = new Map<string, MateriaRow[]>();
  const { data, error } = await supabase
    .from(TABLA_MATERIAS)
    .select("id, clave, nombre, activo")
    .eq("activo", true);
  if (error || !data) return { porClave, porNombre };
  for (const m of data as MateriaRow[]) {
    const clave = materiaClaveHorario(m.clave);
    const nombre = materiaClaveHorario(m.nombre ?? "");
    const arrC = porClave.get(clave) ?? [];
    arrC.push(m);
    porClave.set(clave, arrC);
    if (nombre) {
      const arrN = porNombre.get(nombre) ?? [];
      arrN.push(m);
      porNombre.set(nombre, arrN);
    }
  }
  return { porClave, porNombre };
}

/** Resuelve el vínculo de una materia del horario al catálogo (único o null). */
function resolverMateriaCatalogo(
  materia: string,
  indice: IndiceMaterias,
): MateriaRow | null {
  const candidatas = clavesEquivalenciaMateria(materia);
  const encontradas = new Set<MateriaRow>();
  for (const cand of candidatas) {
    for (const m of indice.porClave.get(cand) ?? []) encontradas.add(m);
    for (const m of indice.porNombre.get(cand) ?? []) encontradas.add(m);
  }
  if (encontradas.size === 1) return [...encontradas][0]!;
  return null;
}

/** Encuentra el grupo del catálogo que corresponde a la fila del archivo. */
function resolverGrupoFila(
  grupos: GrupoConCarrera[],
  f: FilaHorarioNormalizada,
): GrupoConCarrera | null {
  const carreraClave = normalizarCarreraHorario(f.carreraOriginal);
  return buscarGrupoEnLista(
    grupos,
    f.gradoOriginal,
    f.grupoOriginal,
    carreraClave,
  );
}


/* ---------------------------------------------------------------------------
 * ANÁLISIS COMPLETO (preview + aplicación)
 * ------------------------------------------------------------------------- */

/** Clave natural de comparación (JS) de un bloque de horario. */
function claveNaturalBloque(input: {
  grupoId: string;
  dia: string;
  horaInicio: string;
  materiaClave: string;
}): string {
  return [
    input.grupoId,
    input.dia,
    normalizarHoraVisible(input.horaInicio),
    input.materiaClave,
  ].join("|");
}

/** Clave natural de una fila lista para escribir (snake_case → clave). */
function claveNaturalBloqueEscritura(f: FilaHorarioParaEscribir): string {
  return claveNaturalBloque({
    grupoId: f.grupo_id,
    dia: f.dia_semana,
    horaInicio: f.hora_inicio,
    materiaClave: f.materia_clave,
  });
}

/** ¿Dos bloques (mismo natural key) difieren en algún campo? */
function bloquesDifieren(
  a: FilaHorarioParaEscribir,
  b: Pick<
    HorarioBloqueRow,
    "hora_fin" | "materia_nombre" | "tipo_clase" | "profesor_nombre"
  >,
): boolean {
  return (
    normalizarHoraVisible(a.hora_fin) !== normalizarHoraVisible(b.hora_fin) ||
    normalizarTextoCatalogo(a.materia_nombre) !==
      normalizarTextoCatalogo(b.materia_nombre ?? "") ||
    normalizarTextoCatalogo(a.tipo_clase) !==
      normalizarTextoCatalogo(b.tipo_clase) ||
    normalizarTextoCatalogo(a.profesor_nombre ?? "") !==
      normalizarTextoCatalogo(b.profesor_nombre ?? "")
  );
}

/** Detalle completo del análisis (compartido por preview y aplicación). */
export type AnalisisImportacionHorario = {
  ok: boolean;
  error?: string;
  periodoNombre: string;
  periodoId: string | null;
  hojaDetalle: string;
  columnasFaltantes: string[];
  totalFilasArchivo: number;
  filasValidas: number;
  filasRechazadas: number;
  gruposEncontrados: string[];
  profesoresEncontrados: string[];
  materiasVinculadas: number;
  materiasSinVinculo: number;
  nuevas: number;
  actualizables: number;
  sinCambios: number;
  aEliminar: number;
  erroresPorFila: FilaReporteHorario[];
  advertencias: string[];
  bloqueaEscritura: boolean;
  filasParaEscribir: FilaHorarioParaEscribir[];
  idsAEliminar: string[];
};

export type ContextoImportacionHorario = {
  periodoNombre: string;
  creadoPor: string | null;
};

/** Detecta un ciclo escolar (20XX-20XX) en las primeras celdas del archivo. */
export function detectarCicloEnFilasHorario(
  filas: (string | number)[][],
): string | null {
  const encontrados: string[] = [];
  const topeFilas = Math.min(filas.length, 25);
  for (let i = 0; i < topeFilas; i++) {
    const fila = filas[i]!;
    const topeCols = Math.min(fila.length, 15);
    for (let c = 0; c < topeCols; c++) {
      const celda = fila[c];
      const texto =
        typeof celda === "string"
          ? celda
          : typeof celda === "number"
            ? String(celda)
            : "";
      const m = texto.match(/(20\d{2})\s*[-–—/]\s*(20\d{2})/);
      if (m) encontrados.push(`${m[1]}-${m[2]}`.toUpperCase());
    }
  }
  const unicos = [...new Set(encontrados)];
  return unicos.length === 1 ? unicos[0]! : null;
}

export async function analizarImportacionHorario(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoImportacionHorario,
): Promise<AnalisisImportacionHorario> {
  const periodoNombre = ctx.periodoNombre.trim().toUpperCase();
  const base = (error: string): AnalisisImportacionHorario => ({
    ok: false,
    error,
    periodoNombre,
    periodoId: null,
    hojaDetalle: "",
    columnasFaltantes: [],
    totalFilasArchivo: 0,
    filasValidas: 0,
    filasRechazadas: 0,
    gruposEncontrados: [],
    profesoresEncontrados: [],
    materiasVinculadas: 0,
    materiasSinVinculo: 0,
    nuevas: 0,
    actualizables: 0,
    sinCambios: 0,
    aEliminar: 0,
    erroresPorFila: [],
    advertencias: [],
    bloqueaEscritura: true,
    filasParaEscribir: [],
    idsAEliminar: [],
  });

  if (!periodoNombre) return base("Indica el periodo/ciclo escolar.");

  // 1) Leer el libro y localizar la hoja de detalle.
  let leido: { hojas: Map<string, (string | number)[][]>; ordenHojas: string[] };
  try {
    leido = await leerLibroExcel(file);
  } catch {
    return base("No se pudo leer el archivo Excel.");
  }
  const detalle = localizarHojaDetalle(leido.hojas, leido.ordenHojas);
  if (!detalle) {
    return base(
      "No se encontró una hoja de detalle con las columnas obligatorias " +
        "(Día, Hora inicio, Hora fin, Materia, Grado/Grupo).",
    );
  }
  const filasHoja = leido.hojas.get(detalle.hoja) ?? [];

  // FASE CICLO — si el archivo identifica explícitamente el ciclo, debe
  // coincidir con el ciclo seleccionado. Nunca se mezclan ciclos en silencio.
  const cicloEnArchivo = detectarCicloEnFilasHorario(filasHoja);
  if (
    cicloEnArchivo &&
    normalizarTextoCatalogo(cicloEnArchivo) !== normalizarTextoCatalogo(periodoNombre)
  ) {
    return base(
      `El archivo pertenece al ciclo «${cicloEnArchivo}» y el ciclo seleccionado es «${periodoNombre}». Bloqueado: no se mezclan horarios de ciclos distintos.`,
    );
  }

  const columnas = detectarColumnasHorario(detalle.headers);
  const faltantes = columnasObligatoriasHorario(columnas);
  if (faltantes.length > 0) {
    return base(
      `La hoja «${detalle.hoja}» no tiene las columnas obligatorias: ${faltantes.join(", ")}.`,
    );
  }

  // 2) Parsear filas posteriores al encabezado (omite vacías).
  const filasParseadas: FilaHorarioNormalizada[] = [];
  for (let i = detalle.filaEncabezado + 1; i < filasHoja.length; i++) {
    const fila = filasHoja[i]!;
    if (filaVacia(fila)) continue;
    filasParseadas.push(parsearFilaHorario(fila, i + 1, columnas));
  }
  if (filasParseadas.length === 0) {
    return base("El archivo no contiene filas de horario después del encabezado.");
  }

  // 3) Validación de forma + duplicados + solapamientos.
  const analisis = analizarFilasHorario(filasParseadas);
  const erroresPorFila: FilaReporteHorario[] = [...analisis.erroresPorFila];

  // 4) Resolver periodo en catálogo.
  const { data: periodo, error: ePeriodo } = await supabase
    .from(TABLA_PERIODOS)
    .select("id")
    .eq("nombre", periodoNombre)
    .limit(1)
    .maybeSingle();
  const periodoId = !ePeriodo && periodo ? String(periodo.id) : null;
  if (!periodoId) {
    return base(
      `El periodo «${periodoNombre}» no existe en el catálogo. Créalo antes de importar el horario.`,
    );
  }

  // 5) Grupos del periodo y materias del catálogo (una consulta cada uno).
  const grupos = await obtenerGruposConCarreraDePeriodo(supabase, periodoId);
  const indiceMaterias = await cargarIndiceMaterias(supabase);


  // 6) Resolver cada fila válida contra el catálogo (grupo + materia).
  const filasParaEscribir: FilaHorarioParaEscribir[] = [];
  const gruposLegibles = new Set<string>();
  const profesores = new Set<string>();
  let materiasVinculadas = 0;
  let materiasSinVinculo = 0;

  for (const f of analisis.filas) {
    const grupoEncontrado = resolverGrupoFila(grupos, f);
    if (!grupoEncontrado) {
      erroresPorFila.push({
        filaOrigen: f.filaOrigen,
        estado: "rechazada",
        grupoLegible: grupoLegibleTexto(f),
        dia: f.dia ?? "",
        horaInicio: f.horaInicio,
        horaFin: f.horaFin,
        materia: f.materia,
        profesor: f.profesor || "Sin profesor asignado",
        errores: [
          `Grupo inexistente en el periodo ${periodoNombre} (carrera «${normalizarCarreraHorario(f.carreraOriginal)}»).`,
        ],
      });
      continue;
    }
    const materiaCatalogo = resolverMateriaCatalogo(f.materia, indiceMaterias);
    if (materiaCatalogo) materiasVinculadas++;
    else materiasSinVinculo++;

    if (f.profesor) profesores.add(f.profesor);
    const etiquetaGrupo =
      `${grupoEncontrado.grado} ${grupoEncontrado.nombre} ${grupoEncontrado.carreraClave || grupoEncontrado.carreraNombre}`.trim();
    gruposLegibles.add(etiquetaGrupo);

    filasParaEscribir.push({
      periodo_id: periodoId,
      grupo_id: grupoEncontrado.id,
      dia_semana: f.dia ?? "lunes",
      hora_inicio: f.horaInicio,
      hora_fin: f.horaFin,
      materia_clave: f.materiaClave,
      materia_nombre: f.materia,
      materia_id: materiaCatalogo ? materiaCatalogo.id : null,
      tipo_clase: f.tipoClase,
      profesor_clave: null,
      profesor_nombre: f.profesor ? f.profesor : null,
      fila_origen: f.filaOrigen,
      creado_por: ctx.creadoPor,
    });
  }

  // 7) Horario ya importado del periodo (una consulta) para el diff.
  const { data: existentes, error: eExistentes } = await supabase
    .from(TABLA_HORARIO_SEMANAL)
    .select(
      "id, grupo_id, dia_semana, hora_inicio, hora_fin, materia_clave, materia_nombre, materia_id, tipo_clase, profesor_clave, profesor_nombre",
    )
    .eq("periodo_id", periodoId);
  if (eExistentes) {
    return base(
      "No se pudo leer el horario actual del periodo. Si la tabla aún no " +
        "existe, ejecuta primero supabase/crear-horario-semanal.sql en el SQL " +
        "Editor de Supabase.",
    );
  }
  const porClave = new Map<string, (HorarioBloqueRow & { id: string })[]>();
  for (const ex of (existentes ?? []) as (HorarioBloqueRow & { id: string })[]) {
    const clave = claveNaturalBloque({
      grupoId: ex.grupo_id,
      dia: ex.dia_semana,
      horaInicio: ex.hora_inicio,
      materiaClave: ex.materia_clave,
    });
    const lista = porClave.get(clave) ?? [];
    lista.push(ex);
    porClave.set(clave, lista);
  }

  // 8) Clasificar filas entrantes: nueva / actualizable / sin cambio.
  let nuevas = 0;
  let actualizables = 0;
  let sinCambios = 0;
  for (const fila of filasParaEscribir) {
    const clave = claveNaturalBloqueEscritura(fila);
    const existente = porClave.get(clave)?.[0];
    if (!existente) {
      nuevas++;
      continue;
    }
    if (bloquesDifieren(fila, existente)) {
      actualizables++;
    } else {
      sinCambios++;
    }
  }

  // 9) Bloques actuales del periodo que el archivo ya no contiene.
  const clavesEntrantes = new Set(
    filasParaEscribir.map((f) => claveNaturalBloqueEscritura(f)),
  );
  const idsAEliminar: string[] = [];
  for (const [clave, lista] of porClave) {
    if (clavesEntrantes.has(clave)) continue;
    for (const ex of lista) idsAEliminar.push(ex.id);
  }

  // 10) Validación cruzada con la hoja resumen (solo advertencias).
  const advertencias = advertenciasResumenVsDetalle(
    leido.hojas,
    leido.ordenHojas,
    analisis.filas,
  );
  if (grupos.length === 0) {
    advertencias.push(
      `El periodo ${periodoNombre} no tiene grupos en el catálogo: todas las filas se rechazan.`,
    );
  }
  if (cicloEnArchivo) {
    advertencias.push(
      `Ciclo detectado en el archivo: ${cicloEnArchivo} (coincide con el seleccionado).`,
    );
  }

  erroresPorFila.sort((a, b) => a.filaOrigen - b.filaOrigen);
  const bloqueaEscritura =
    erroresPorFila.length > 0 || filasParaEscribir.length === 0;

  return {
    ok: true,
    periodoNombre,
    periodoId,
    hojaDetalle: detalle.hoja,
    columnasFaltantes: faltantes,
    totalFilasArchivo: filasParseadas.length,
    filasValidas: analisis.filas.length,
    filasRechazadas: erroresPorFila.length,
    gruposEncontrados: [...gruposLegibles].sort((a, b) => a.localeCompare(b, "es")),
    profesoresEncontrados: [...profesores].sort((a, b) => a.localeCompare(b, "es")),
    materiasVinculadas,
    materiasSinVinculo,
    nuevas,
    actualizables,
    sinCambios,
    aEliminar: idsAEliminar.length,
    erroresPorFila,
    advertencias,
    bloqueaEscritura,
    filasParaEscribir,
    idsAEliminar,
  };
}


/* ---------------------------------------------------------------------------
 * PREVIEW Y APLICACIÓN
 * ------------------------------------------------------------------------- */

/** Convierte el análisis completo en el contrato de preview de la UI. */
export function analisisAPreview(
  analisis: AnalisisImportacionHorario,
): PreviewImportacionHorario {
  if (!analisis.ok) {
    return {
      ok: false,
      error: analisis.error,
      periodoNombre: analisis.periodoNombre,
      periodoId: analisis.periodoId,
      hojaDetalle: "",
      columnasDetectadas: [],
      columnasFaltantes: [],
      totalFilasArchivo: 0,
      filasValidas: 0,
      filasRechazadas: 0,
      gruposEncontrados: [],
      materiasVinculadasCatalogo: 0,
      materiasSinVinculo: 0,
      profesoresEncontrados: [],
      nuevas: 0,
      actualizables: 0,
      sinCambios: 0,
      aEliminar: 0,
      erroresPorFila: [],
      advertencias: [],
      bloqueaEscritura: true,
    };
  }
  return {
    ok: true,
    periodoNombre: analisis.periodoNombre,
    periodoId: analisis.periodoId,
    hojaDetalle: analisis.hojaDetalle,
    columnasDetectadas: [],
    columnasFaltantes: analisis.columnasFaltantes,
    totalFilasArchivo: analisis.totalFilasArchivo,
    filasValidas: analisis.filasValidas,
    filasRechazadas: analisis.filasRechazadas,
    gruposEncontrados: analisis.gruposEncontrados,
    materiasVinculadasCatalogo: analisis.materiasVinculadas,
    materiasSinVinculo: analisis.materiasSinVinculo,
    profesoresEncontrados: analisis.profesoresEncontrados,
    nuevas: analisis.nuevas,
    actualizables: analisis.actualizables,
    sinCambios: analisis.sinCambios,
    aEliminar: analisis.aEliminar,
    erroresPorFila: analisis.erroresPorFila,
    advertencias: analisis.advertencias,
    bloqueaEscritura: analisis.bloqueaEscritura,
  };
}

/**
 * Preview de la importación SIN escribir. Solo directivo (validado en la
 * Server Action). Devuelve el reporte completo: válidas, nuevas,
 * actualizables, sin cambios, a eliminar, rechazadas y errores por fila.
 */
export async function previsualizarImportacionHorario(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoImportacionHorario,
): Promise<PreviewImportacionHorario> {
  const analisis = await analizarImportacionHorario(supabase, file, ctx);
  return analisisAPreview(analisis);
}

const TAMANO_LOTE = 100;

/**
 * Aplica la importación (reemplazo-diferenciado por periodo):
 *   1) re-analiza el archivo (no confía en el preview del cliente);
 *   2) elimina por lotes los bloques actuales del periodo que el archivo ya no
 *      contiene (nunca DELETE masivo ciego);
 *   3) UPSERT por lotes todas las filas del archivo (clave natural).
 *
 * Idempotencia: re-subir el mismo archivo produce nuevas=0, actualizables=0 y
 * sinCambios=total; no se generan duplicados ni filas huérfanas.
 * Solo directivo (validado en la Server Action).
 */
export async function aplicarImportacionHorario(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoImportacionHorario,
): Promise<ResultadoAplicarHorario> {
  const analisis = await analizarImportacionHorario(supabase, file, ctx);
  const periodoNombre = ctx.periodoNombre.trim().toUpperCase();

  if (!analisis.ok || analisis.bloqueaEscritura) {
    return {
      ok: false,
      error:
        analisis.error ??
        "La importación tiene errores que bloquean la escritura. Revisa el reporte.",
      periodoNombre,
      aplicadas: 0,
      actualizadas: 0,
      eliminadas: 0,
      sinCambios: 0,
      rechazadas: analisis.filasRechazadas,
      erroresDetalle: analisis.erroresPorFila
        .slice(0, 20)
        .map((r) => `Fila ${r.filaOrigen}: ${r.errores.join("; ")}`),
    };
  }

  // 1) Eliminar bloques del periodo que el archivo ya no contiene.
  let eliminadas = 0;
  for (let i = 0; i < analisis.idsAEliminar.length; i += TAMANO_LOTE) {
    const lote = analisis.idsAEliminar.slice(i, i + TAMANO_LOTE);
    const { error } = await supabase
      .from(TABLA_HORARIO_SEMANAL)
      .delete()
      .in("id", lote);
    if (error) {
      return {
        ok: false,
        error: `No se pudo limpiar el horario anterior: ${error.message}`,
        periodoNombre,
        aplicadas: 0,
        actualizadas: 0,
        eliminadas,
        sinCambios: 0,
        rechazadas: 0,
        erroresDetalle: [],
      };
    }
    eliminadas += lote.length;
  }

  // 2) UPSERT de todas las filas del archivo (clave natural).
  for (let i = 0; i < analisis.filasParaEscribir.length; i += TAMANO_LOTE) {
    const lote = analisis.filasParaEscribir.slice(i, i + TAMANO_LOTE);
    const { error } = await supabase
      .from(TABLA_HORARIO_SEMANAL)
      .upsert(lote, {
        onConflict: "periodo_id,grupo_id,dia_semana,hora_inicio,materia_clave",
      });
    if (error) {
      return {
        ok: false,
        error: `Error al guardar el horario: ${error.message}`,
        periodoNombre,
        aplicadas: 0,
        actualizadas: 0,
        eliminadas,
        sinCambios: 0,
        rechazadas: 0,
        erroresDetalle: [],
      };
    }
  }

  return {
    ok: true,
    periodoNombre,
    aplicadas: analisis.nuevas,
    actualizadas: analisis.actualizables,
    eliminadas,
    sinCambios: analisis.sinCambios,
    rechazadas: analisis.filasRechazadas,
    erroresDetalle: [],
  };
}

/* ---------------------------------------------------------------------------
 * PLANTILLA DE DESCARGA (referencia oficial para mantener el archivo al día)
 * ------------------------------------------------------------------------- */

/**
 * Genera una plantilla .xlsx (base64) con la ESTRUCTURA OFICIAL del horario:
 * las mismas columnas del archivo «Horario Completo» de referencia
 * (things/CETAC23_Horario_Ago2026-Ene2027 (1).xlsx) y dos filas de ejemplo.
 * El directivo la descarga, la conserva y la vuelve a subir cuando necesite
 * actualizar el horario. La importación es idempotente por clave natural.
 */
export async function plantillaHorarioParaDescarga(): Promise<{
  base64: string;
  nombreArchivo: string;
}> {
  const encabezados = [
    "Carrera",
    "Grado",
    "Grupo",
    "Grado-Grupo",
    "Día",
    "Hora inicio",
    "Hora fin",
    "Duración (min)",
    "Materia",
    "Profesor",
    "Tipo de clase",
  ];
  const filas: (string | number)[][] = [
    encabezados,
    [
      "Sin carrera (tronco común)",
      "1°",
      "A",
      "1°A",
      "Lunes",
      "07:30",
      "08:20",
      50,
      "Lengua y Comunicación I",
      "Sin profesor asignado",
      "Académica",
    ],
    [
      "MC",
      "3°",
      "A",
      "3°A",
      "Lunes",
      "07:30",
      "08:20",
      50,
      "Taller de vivero",
      "Sin profesor asignado",
      "Taller",
    ],
  ];
  return {
    base64: await (async () => {
      const { matrizAXlsxBase64: aoa } = await import("./exportar-xlsx");
      return aoa(filas, "Horario Completo", [26, 7, 7, 9, 11, 12, 12, 15, 48, 26, 16]);
    })(),
    nombreArchivo: "plantilla_horario_semanal.xlsx",
  };
}

