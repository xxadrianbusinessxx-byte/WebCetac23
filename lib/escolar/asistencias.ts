import type { SupabaseClient } from "@supabase/supabase-js";
import { archivoCsvAFilasConValores, matrizACsvTexto } from "./csv";
import { CURP_ALUMNO_RE } from "./buscar-en-filas";
import {
  diaSemanaDesdeFecha,
  obtenerCalendarioEscolar,
  type DiaSemana,
} from "./calendario";
import { detectarColumnasFechaAsistencia } from "./fechas";

import { carreraEscolarDesdeEtiquetas } from "./informacion-personal";
import { nombreCompletoAlumno } from "./alumnos";
import {
  TABLA_ALUMNOS,
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_CLASES_IMPARTIDAS,
  TABLA_CONFIGURACION_CLASES_PROFESOR,
  TABLA_ETIQUETAS_PERSONALES,
  type TipoDiaCalendario,
} from "./tables";


import type { AlumnoRow, EtiquetasPersonalesRow } from "./types";


/**
 * Dominio de ASISTENCIAS DEL PROFESOR (Bloque 5B).
 *
 * Cada fila de `asistencia_alumnos` representa el aporte INDEPENDIENTE de UN
 * profesor:
 *
 *   (profesor_clave, curp, grado, grupo, fecha) → clases_asistidas
 *
 * Esto permite que varios profesores actualicen su propio aporte mediante
 * UPSERT sin acumular ni sobrescribir el aporte de otro profesor. El total real
 * del alumno se calcula con SUM(clases_asistidas) y NUNCA se almacena.
 *
 * La identidad del profesor SIEMPRE es `profesor_clave` (matrícula de la
 * sesión), nunca un valor del archivo ni del navegador.
 */

export type ContextoAsistencia = {
  grado: string;
  grupo: string;
  carrera: string;
  ciclo: string;
  profesorClave: string;
  profesorNombre: string;
};

export type AlumnoPlantilla = {
  curp: string;
  nombre: string;
};

export type PlantillaAsistencia = {
  fechas: string[];
  alumnos: AlumnoPlantilla[];
  csv: string;
};

export type ResumenAsistencia = {
  procesados: number;
  actualizados: number;
  sinCambios: number;
  omitidos: number;
  errores: number;
  /** Días de clase del ciclo en los que el profesor tiene clases según su
   *  configuración pero que NO vienen en el archivo. Quedan PENDIENTES (no se
   *  marcan como falta). */
  pendientes: number;
  /** Discrepancias entre la fila CLASES del archivo y la configuración semanal
   *  del profesor (fuente de verdad). Son informativas: NO alteran la config. */
  discrepancias: number;
  omitidosDetalle: string[];
  erroresDetalle: string[];
  pendientesDetalle: string[];
  discrepanciasDetalle: string[];
};


export type PlanAsistencia = {
  clasesImpartidas: {
    profesor_clave: string;
    grado: string;
    grupo: string;
    carrera: string;
    fecha: string;
    clases: number;
  }[];
  asistencias: {
    profesor_clave: string;
    curp: string;
    grado: string;
    grupo: string;
    carrera: string;
    nombre: string;
    fecha: string;
    clases_asistidas: number;
  }[];
  resumen: ResumenAsistencia;
};

export type ResultadoPlantilla =
  | { ok: true; plantilla: PlantillaAsistencia }
  | { ok: false; error: string };

export type ResultadoAnalisis =
  | { ok: true; plan: PlanAsistencia }
  | { ok: false; error: string };

const TAMANO_PAGINA = 1000;
const TAMANO_LOTE = 100;

/** Normaliza grado/grupo/carrera a mayúsculas y sin espacios. */
function norm(texto: string): string {
  return texto.trim().toUpperCase();
}

/** ¿El texto es un entero no negativo? */
function esEnteroNoNegativo(texto: string): boolean {
  return /^\d+$/.test(texto.trim());
}


/** Convierte una celda (string | number) a texto recortado. */
function celdaTexto(celda: string | number | null | undefined): string {
  if (celda == null) return "";
  return String(celda).trim();
}


/** Configuración semanal de clases de un profesor (Bloque 5C). */
export type ConfiguracionClasesProfesor = {
  profesor_clave: string;
  lunes: number;
  martes: number;
  miercoles: number;
  jueves: number;
  viernes: number;
};

/** Claves de día de semana → columna de la configuración. */
const CLAVE_DIA_A_COLUMNA: Record<DiaSemana, keyof ConfiguracionClasesProfesor> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miercoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "lunes", // no aplica (no es día escolar)
  domingo: "lunes", // no aplica (no es día escolar)
};

/** Configuración vacía por defecto (todas las clases en 0). */
export function configuracionVacia(profesorClave: string): ConfiguracionClasesProfesor {
  return {
    profesor_clave: profesorClave,
    lunes: 0,
    martes: 0,
    miercoles: 0,
    jueves: 0,
    viernes: 0,
  };
}

/** Obtiene la configuración semanal de clases de un profesor (o null si no existe). */
export async function obtenerConfiguracionClasesProfesor(
  supabase: SupabaseClient,
  profesorClave: string,
): Promise<ConfiguracionClasesProfesor | null> {
  const clave = norm(profesorClave);
  if (!clave) return null;

  const { data, error } = await supabase
    .from(TABLA_CONFIGURACION_CLASES_PROFESOR)
    .select("profesor_clave, lunes, martes, miercoles, jueves, viernes")
    .eq("profesor_clave", clave)
    .maybeSingle();

  if (error || !data) return null;
  return data as ConfiguracionClasesProfesor;
}

/**
 * Guarda (UPSERT) la configuración semanal de clases de un profesor.
 * La identidad es `profesor_clave` (de la sesión). Re-guardar actualiza, no
 * duplica. Valida que cada día sea un entero >= 0.
 */
export async function guardarConfiguracionClasesProfesor(
  supabase: SupabaseClient,
  input: {
    profesorClave: string;
    lunes: number;
    martes: number;
    miercoles: number;
    jueves: number;
    viernes: number;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clave = norm(input.profesorClave);
  if (!clave) return { ok: false, error: "No se pudo identificar al profesor." };

  const dias: [keyof ConfiguracionClasesProfesor, number][] = [
    ["lunes", input.lunes],
    ["martes", input.martes],
    ["miercoles", input.miercoles],
    ["jueves", input.jueves],
    ["viernes", input.viernes],
  ];
  for (const [dia, valor] of dias) {
    if (!Number.isInteger(valor) || valor < 0) {
      return { ok: false, error: `El valor de ${dia} debe ser un entero >= 0.` };
    }
  }

  const { error } = await supabase
    .from(TABLA_CONFIGURACION_CLASES_PROFESOR)
    .upsert(
      {
        profesor_clave: clave,
        lunes: input.lunes,
        martes: input.martes,
        miercoles: input.miercoles,
        jueves: input.jueves,
        viernes: input.viernes,
      },
      { onConflict: "profesor_clave" },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Número de clases que el profesor imparte en una fecha según su configuración. */
export function clasesDelProfesorParaFecha(
  config: ConfiguracionClasesProfesor | null,
  fecha: string,
): number {
  if (!config) return 0;
  const dia = diaSemanaDesdeFecha(fecha);
  const columna = CLAVE_DIA_A_COLUMNA[dia];
  const valor = config[columna];
  return typeof valor === "number" ? valor : 0;
}


/**
 * Lista los grupos (grado + grupo + carrera) que existen en ETIQUETAS
 * PERSONALES. Fuente real de datos: NO se hardcodean grados/grupos/carreras.
 */

export async function listarGruposAsistencia(
  supabase: SupabaseClient,
): Promise<{ grado: string; grupo: string; carrera: string }[]> {
  const grupos = new Map<string, { grado: string; grupo: string; carrera: string }>();
  let desde = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_ETIQUETAS_PERSONALES)
      .select("GRADO, GRUPO, CARRERA")
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (error || !data || data.length === 0) break;

    for (const r of data as EtiquetasPersonalesRow[]) {
      const grado = norm(String(r.GRADO ?? ""));
      const grupo = norm(String(r.GRUPO ?? ""));
      if (!grado || !grupo) continue;
      const carrera = norm(carreraEscolarDesdeEtiquetas(r));
      const key = `${grado}|${grupo}|${carrera}`;
      if (!grupos.has(key)) grupos.set(key, { grado, grupo, carrera });
    }

    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }

  return [...grupos.values()].sort((a, b) =>
    `${a.grado} ${a.grupo} ${a.carrera}`.localeCompare(
      `${b.grado} ${b.grupo} ${b.carrera}`,
      "es",
    ),
  );
}

/**
 * Obtiene los alumnos de un grado/grupo/carrera desde ETIQUETAS PERSONALES
 * (fuente real de grado/grupo/carrera) y completa el nombre desde ALUMNOS.
 * Carga ALUMNOS paginado en un Map para evitar N+1.
 */
export async function obtenerAlumnosDelGrupo(
  supabase: SupabaseClient,
  grado: string,
  grupo: string,
  carrera: string,
): Promise<AlumnoPlantilla[]> {
  const g = norm(grado);
  const gr = norm(grupo);
  const c = norm(carrera);
  if (!g || !gr) return [];

  // 1) CURPs del grupo desde ETIQUETAS PERSONALES.
  const curps = new Set<string>();
  let desde = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_ETIQUETAS_PERSONALES)
      .select("CURP, GRADO, GRUPO, CARRERA")
      .eq("GRADO", g)
      .eq("GRUPO", gr)
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (error || !data || data.length === 0) break;

    for (const r of data as EtiquetasPersonalesRow[]) {
      const curp = norm(String(r.CURP ?? ""));
      if (!curp) continue;
      // Filtrar por carrera en memoria (CARRERA puede contener URLs de foto).
      const carreraFila = norm(carreraEscolarDesdeEtiquetas(r));
      if (c && carreraFila !== c) continue;
      curps.add(curp);
    }

    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }

  if (curps.size === 0) return [];

  // 2) Nombre completo desde ALUMNOS (paginado, en un Map).
  const porCurp = new Map<string, string>();
  let desdeAl = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_ALUMNOS)
      .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO")
      .range(desdeAl, desdeAl + TAMANO_PAGINA - 1);

    if (error || !data || data.length === 0) break;

    for (const r of data as AlumnoRow[]) {
      const curp = norm(String(r.CURP ?? ""));
      if (curp && curps.has(curp)) {
        porCurp.set(curp, nombreCompletoAlumno(r));
      }
    }

    if (data.length < TAMANO_PAGINA) break;
    desdeAl += TAMANO_PAGINA;
  }

  const alumnos: AlumnoPlantilla[] = [];
  for (const curp of curps) {
    alumnos.push({ curp, nombre: porCurp.get(curp) ?? "" });
  }
  alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return alumnos;
}

/**
 * Genera la plantilla de asistencias para un grado/grupo/carrera y ciclo.
 * Solo usa días `tipo = 'clase'` del calendario. La plantilla incluye una fila
 * especial `CLASES` (clases impartidas por el profesor por día) y una fila por
 * alumno (asistencia por día).
 */
export async function generarPlantillaAsistencia(
  supabase: SupabaseClient,
  ctx: ContextoAsistencia,
): Promise<ResultadoPlantilla> {
  const ciclo = norm(ctx.ciclo);
  if (!ciclo) return { ok: false, error: "Indica un ciclo escolar." };

  const calendario = await obtenerCalendarioEscolar(supabase, ciclo);
  const fechas = calendario
    .filter((d) => d.tipo === "clase")
    .map((d) => d.fecha)
    .sort();

  if (fechas.length === 0) {
    return {
      ok: false,
      error: `El ciclo ${ciclo} no tiene días de clase configurados en el calendario.`,
    };
  }

  const alumnos = await obtenerAlumnosDelGrupo(
    supabase,
    ctx.grado,
    ctx.grupo,
    ctx.carrera,
  );
  if (alumnos.length === 0) {
    return {
      ok: false,
      error: `No hay alumnos en ${ctx.grado} · grupo ${ctx.grupo}${ctx.carrera ? ` · ${ctx.carrera}` : ""}.`,
    };
  }

  // Configuración semanal del profesor (Bloque 5C). Si no existe, la fila
  // CLASES queda vacía y la UI indicará que debe configurarla.
  const config = await obtenerConfiguracionClasesProfesor(
    supabase,
    ctx.profesorClave,
  );

  const filas: string[][] = [];
  filas.push(["CURP", "NOMBRE", ...fechas]);
  // Fila especial: clases impartidas por el profesor por día. Se auto-rellena
  // según el día REAL de cada fecha del calendario + la configuración semanal.
  filas.push([
    "CLASES",
    ctx.profesorNombre,
    ...fechas.map((f) => String(clasesDelProfesorParaFecha(config, f))),
  ]);
  for (const a of alumnos) {
    filas.push([a.curp, a.nombre, ...fechas.map(() => "")]);
  }

  return {
    ok: true,
    plantilla: {
      fechas,
      alumnos,
      csv: matrizACsvTexto(filas),
    },
  };
}


/**
 * Analiza una plantilla subida: parsea, detecta columnas, valida contra el
 * calendario, los alumnos del grupo y las clases impartidas por el profesor.
 * NO escribe en Supabase. Devuelve el plan de cambios y un resumen.
 */
export async function analizarPlantillaAsistencia(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoAsistencia,
): Promise<ResultadoAnalisis> {
  const g = norm(ctx.grado);
  const gr = norm(ctx.grupo);
  const c = norm(ctx.carrera);
  const ciclo = norm(ctx.ciclo);
  if (!g || !gr) return { ok: false, error: "Indica grado y grupo." };
  if (!ciclo) return { ok: false, error: "Indica un ciclo escolar." };

  // 1) Parsear archivo conservando los valores crudos (para que las fechas de
  //    Excel lleguen como serial numérico y no como texto regional).
  let filas: (string | number)[][];
  try {
    const parsed = await archivoCsvAFilasConValores(file);
    filas = parsed.filas;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el archivo.";
    return { ok: false, error: msg };
  }

  const noVacias = filas.filter((fila) =>
    fila.some((cel) => (cel == null ? "" : String(cel)).trim() !== ""),
  );
  if (noVacias.length < 2) {
    return { ok: false, error: "El archivo está vacío o solo tiene encabezados." };
  }

  const [rawHead, ...rawDatos] = noVacias;
  const encabezados = rawHead!.map((h, i) =>
    (h == null ? "" : String(h)).trim() || `Col ${i + 1}`,
  );

  // 2) Detectar columnas CURP y NOMBRE (reutiliza el detector del roster).
  const idxCurp = encabezados.findIndex((h) => /^CURP$/i.test(h));
  const idxNombre = encabezados.findIndex((h) => /^NOMBRE$/i.test(h));
  if (idxCurp < 0) {
    return { ok: false, error: "La plantilla debe incluir una columna «CURP»." };
  }
  if (idxNombre < 0) {
    return { ok: false, error: "La plantilla debe incluir una columna «NOMBRE»." };
  }

  // 3) Calendario: días válidos de clase del ciclo (fuente de verdad).
  const calendario = await obtenerCalendarioEscolar(supabase, ciclo);
  const diasClase = new Set(
    calendario.filter((d) => d.tipo === "clase").map((d) => d.fecha),
  );
  const diasNoClase = new Map(
    calendario.filter((d) => d.tipo !== "clase").map((d) => [d.fecha, d.tipo]),
  );

  // 4) Detectar columnas de fecha usando la capa canónica de fechas. Cada
  //    encabezado se normaliza UNA SOLA VEZ a YYYY-MM-DD y se valida contra el
  //    calendario. El CONTRATO INTERNO es: `columna.fecha` (canónica) es la
  //    ÚNICA representación de la fecha; `columna.indice` localiza la celda del
  //    alumno. El encabezado original (p.ej. serial Excel "46259") NUNCA vuelve
  //    a usarse para identificar la fecha.
  const deteccion = detectarColumnasFechaAsistencia(
    encabezados,
    calendario,
    [idxCurp, idxNombre],
  );
  // Columnas reconocidas como días de clase: { indice, fecha }.
  const columnasFecha = deteccion.columnas.map((c) => ({
    indice: c.indice,
    fecha: c.fecha!,
  }));
  if (columnasFecha.length === 0) {

    // Mensaje de error más útil según qué falló.
    if (deteccion.ambiguas > 0) {
      const ejemplos = deteccion.todas
        .filter((c) => c.estado === "ambigua")
        .slice(0, 3)
        .map((c) => `«${c.encabezadoOriginal}» (¿${c.candidatos.join(" o ")}?)`)
        .join(", ");
      return {
        ok: false,
        error: `No se pudieron reconocer las fechas del archivo. ${ejemplos ? `Columnas ambiguas: ${ejemplos}. ` : ""}Asegúrate de que las fechas coincidan con días de clase del ciclo ${ciclo} (formato YYYY-MM-DD).`,
      };
    }
    if (deteccion.noDiaClase > 0) {
      const ejemplos = deteccion.todas
        .filter((c) => c.estado === "no_es_dia_clase")
        .slice(0, 3)
        .map((c) => `«${c.encabezadoOriginal}» → ${c.fecha}`)
        .join(", ");
      return {
        ok: false,
        error: `Las fechas del archivo no son días de clase del ciclo ${ciclo}. ${ejemplos ? `Ejemplos: ${ejemplos}. ` : ""}Revisa el calendario escolar o descarga una plantilla nueva.`,
      };
    }
    return {
      ok: false,
      error: `La plantilla no tiene columnas de fecha reconocibles. Asegúrate de que las fechas coincidan con días de clase del ciclo ${ciclo} (formato YYYY-MM-DD).`,
    };
  }
  // `columnasFecha` es el CONTRATO INTERNO: cada elemento es
  //   { indice, fecha } donde `fecha` es YYYY-MM-DD (canónica) y `indice`
  //   localiza la celda del alumno en la fila. El encabezado original
  //   (p.ej. serial Excel "46259") ya NO se usa para identificar la fecha.


  // 5) Alumnos del grupo (CURP → nombre).

  const alumnos = await obtenerAlumnosDelGrupo(supabase, g, gr, c);
  const alumnosPorCurp = new Map(alumnos.map((a) => [a.curp, a.nombre]));

  // 6) Clases impartidas ya guardadas por este profesor en este grupo (para
  //    detectar "sin cambios" y como respaldo del máximo).
  const { data: clasesPrevias } = await supabase
    .from(TABLA_CLASES_IMPARTIDAS)
    .select("fecha, clases")
    .eq("profesor_clave", ctx.profesorClave)
    .eq("grado", g)
    .eq("grupo", gr);
  const clasesPreviasPorFecha = new Map<string, number>();
  for (const r of (clasesPrevias ?? []) as { fecha: string; clases: number }[]) {
    clasesPreviasPorFecha.set(r.fecha, r.clases);
  }

  // 7) Asistencias ya guardadas por este profesor (para detectar "sin cambios").
  const { data: asistenciasPrevias } = await supabase
    .from(TABLA_ASISTENCIA_ALUMNOS)
    .select("curp, fecha, clases_asistidas")
    .eq("profesor_clave", ctx.profesorClave)
    .eq("grado", g)
    .eq("grupo", gr);
  const asistenciasPreviasPorClave = new Map<string, number>();
  for (const r of (asistenciasPrevias ?? []) as {
    curp: string;
    fecha: string;
    clases_asistidas: number;
  }[]) {
    asistenciasPreviasPorClave.set(`${r.curp}|${r.fecha}`, r.clases_asistidas);
  }

  // 8) Configuración semanal del profesor: FUENTE DE VERDAD de cuántas clases
  //    imparte por día. La fila CLASES del archivo es solo informativa.
  const config = await obtenerConfiguracionClasesProfesor(
    supabase,
    ctx.profesorClave,
  );

  // 9) Recorrer filas.
  const clasesImpartidas: PlanAsistencia["clasesImpartidas"] = [];
  const asistencias: PlanAsistencia["asistencias"] = [];
  const omitidosDetalle: string[] = [];
  const erroresDetalle: string[] = [];
  const discrepanciasDetalle: string[] = [];
  const curpsVistos = new Set<string>();
  let procesados = 0;
  let actualizados = 0;
  let sinCambios = 0;
  let omitidos = 0;
  let errores = 0;
  let discrepancias = 0;

  // 10) Fila CLASES del archivo: se compara contra la configuración semanal
  //     (fuente de verdad). Las discrepancias son informativas y NO alteran la
  //     configuración. El valor oficial de `clases_impartidas` es el de la
  //     configuración semanal.
  const clasesArchivoPorFecha = new Map<string, number>();
  for (const fila of rawDatos) {
    const curpCelda = celdaTexto(fila[idxCurp]).toUpperCase();
    if (curpCelda !== "CLASES") continue;

    for (const columna of columnasFecha) {
      const fecha = columna.fecha;
      const valor = celdaTexto(fila[columna.indice]);
      if (valor === "") continue; // celda vacía: no aporta información
      if (!esEnteroNoNegativo(valor)) {
        erroresDetalle.push(`Fila CLASES: «${valor}» no es un número válido para ${fecha}.`);
        errores++;
        continue;
      }
      clasesArchivoPorFecha.set(fecha, Number(valor));
    }

  }


  // 11) Clases oficiales por fecha (desde la configuración semanal). Solo para
  //     las fechas presentes en el archivo que sean días de clase. La fecha
  //     SIEMPRE es `columna.fecha` (canónica YYYY-MM-DD).
  const clasesOficialesPorFecha = new Map<string, number>();
  for (const columna of columnasFecha) {
    const fecha = columna.fecha;
    if (!diasClase.has(fecha)) continue;
    const oficial = clasesDelProfesorParaFecha(config, fecha);
    clasesOficialesPorFecha.set(fecha, oficial);

    const delArchivo = clasesArchivoPorFecha.get(fecha);
    if (delArchivo !== undefined && delArchivo !== oficial) {
      discrepanciasDetalle.push(
        `Fila CLASES: el archivo dice ${delArchivo} clases el ${fecha}, pero tu configuración semanal indica ${oficial}. Se usará ${oficial} (configuración).`,
      );
      discrepancias++;
    }

    // `clases_impartidas` registra el dato efectivo (fuente: configuración).
    clasesImpartidas.push({
      profesor_clave: ctx.profesorClave,
      grado: g,
      grupo: gr,
      carrera: c,
      fecha,
      clases: oficial,
    });
  }

  // 12) Días PENDIENTES: días de clase del ciclo en los que el profesor tiene
  //     clases según su configuración (oficial > 0) pero que NO vienen en el
  //     archivo. Quedan pendientes (sin registro), NO se marcan como falta.
  const fechasEnArchivo = new Set(columnasFecha.map((c) => c.fecha));

  const pendientesDetalle: string[] = [];
  const diasClaseOrdenados = [...diasClase].sort();
  for (const fecha of diasClaseOrdenados) {
    if (fechasEnArchivo.has(fecha)) continue;
    const oficial = clasesDelProfesorParaFecha(config, fecha);
    if (oficial > 0) {
      pendientesDetalle.push(`${fecha} (${oficial} clases según tu configuración)`);
    }
  }

  // 13) Filas de alumnos.
  for (const fila of rawDatos) {
    const curp = celdaTexto(fila[idxCurp]).toUpperCase();
    if (!curp || curp === "CLASES") continue;


    // CURP válido.
    if (!CURP_ALUMNO_RE.test(curp)) {
      omitidosDetalle.push(`CURP inválido: «${curp}»`);
      omitidos++;
      continue;
    }

    // Evitar duplicados dentro del archivo.
    if (curpsVistos.has(curp)) {
      omitidosDetalle.push(`CURP duplicado en el archivo: «${curp}»`);
      omitidos++;
      continue;
    }
    curpsVistos.add(curp);

    // Alumno debe pertenecer al grado/grupo seleccionado.
    const nombreEsperado = alumnosPorCurp.get(curp);
    if (nombreEsperado === undefined) {
      omitidosDetalle.push(`CURP no pertenece a ${g} · grupo ${gr}: «${curp}»`);
      omitidos++;
      continue;
    }

    const nombre = celdaTexto(fila[idxNombre]) || nombreEsperado;
    procesados++;

    for (const columna of columnasFecha) {
      const fecha = columna.fecha;
      const valor = celdaTexto(fila[columna.indice]);


      // Fecha debe ser día de clase. `fecha` es SIEMPRE la canónica YYYY-MM-DD
      // (nunca el encabezado original, p.ej. serial Excel "46259").
      if (!diasClase.has(fecha)) {
        const tipo = diasNoClase.get(fecha);
        erroresDetalle.push(
          tipo
            ? `${curp}: ${fecha} no es día de clase (${tipo}).`
            : `${curp}: ${fecha} no está en el calendario del ciclo.`,
        );
        errores++;
        continue;
      }


      // Celda VACÍA ≠ 0. Vacío = sin registro = PENDIENTE (no se escribe nada).
      if (valor === "") continue;

      if (!esEnteroNoNegativo(valor)) {
        erroresDetalle.push(`${curp}: «${valor}» no es un número válido para ${fecha}.`);
        errores++;
        continue;
      }
      const asistencia = Number(valor);

      // No puede superar las clases oficiales del profesor ese día (config).
      const maxClases = clasesOficialesPorFecha.get(fecha) ?? 0;
      if (asistencia > maxClases) {
        erroresDetalle.push(
          `${curp}: asistencia ${asistencia} supera las ${maxClases} clases del ${fecha} según tu configuración.`,
        );
        errores++;
        continue;
      }

      asistencias.push({
        profesor_clave: ctx.profesorClave,
        curp,
        grado: g,
        grupo: gr,
        carrera: c,
        nombre,
        fecha,
        clases_asistidas: asistencia,
      });

      const previo = asistenciasPreviasPorClave.get(`${curp}|${fecha}`);
      if (previo === asistencia) sinCambios++;
      else actualizados++;
    }
  }

  return {
    ok: true,
    plan: {
      clasesImpartidas,
      asistencias,
      resumen: {
        procesados,
        actualizados,
        sinCambios,
        omitidos,
        errores,
        pendientes: pendientesDetalle.length,
        discrepancias,
        omitidosDetalle,
        erroresDetalle,
        pendientesDetalle,
        discrepanciasDetalle,
      },
    },
  };
}


/** Previsualiza la plantilla SIN escribir. Devuelve el resumen. */
export async function previsualizarAsistencias(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoAsistencia,
): Promise<ResultadoAnalisis> {
  return analizarPlantillaAsistencia(supabase, file, ctx);
}

/**
 * Confirma la plantilla: UPSERT en `clases_impartidas` y `asistencia_alumnos`.
 * La identidad del profesor SIEMPRE es `ctx.profesorClave` (de la sesión).
 * El UPSERT sobre la UNIQUE garantiza que re-subir NO acumule.
 */
export async function confirmarAsistencias(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoAsistencia,
): Promise<ResultadoAnalisis> {
  const analisis = await analizarPlantillaAsistencia(supabase, file, ctx);
  if (!analisis.ok) return analisis;

  const { plan } = analisis;

  // UPSERT clases_impartidas (profesor + grado + grupo + fecha).
  for (let i = 0; i < plan.clasesImpartidas.length; i += TAMANO_LOTE) {
    const lote = plan.clasesImpartidas.slice(i, i + TAMANO_LOTE);
    const { error } = await supabase
      .from(TABLA_CLASES_IMPARTIDAS)
      .upsert(lote, { onConflict: "profesor_clave,grado,grupo,fecha" });
    if (error) return { ok: false, error: `Error en clases impartidas: ${error.message}` };
  }

  // UPSERT asistencia_alumnos (profesor + curp + grado + grupo + fecha).
  for (let i = 0; i < plan.asistencias.length; i += TAMANO_LOTE) {
    const lote = plan.asistencias.slice(i, i + TAMANO_LOTE);
    const { error } = await supabase
      .from(TABLA_ASISTENCIA_ALUMNOS)
      .upsert(lote, { onConflict: "profesor_clave,curp,grado,grupo,fecha" });
    if (error) return { ok: false, error: `Error en asistencias: ${error.message}` };
  }

  return { ok: true, plan };
}


// ============================================================================
// ESTADOS DERIVADOS DE ASISTENCIA (Bloque 5D)
// ----------------------------------------------------------------------------
// Para la futura visualización del alumno/padre (calendario visual) se derivan
// cuatro estados a partir de los datos existentes. NO se almacenan en ninguna
// tabla nueva:
//
//   asistio   → existe registro y clases_asistidas > 0
//   falta     → existe registro y clases_asistidas = 0 (0 EXPLÍCITO)
//   pendiente → día tipo='clase' + el profesor tiene clases ese día (config)
//               + el alumno pertenece al grupo + NO existe registro
//   sin_clase → el día NO es tipo='clase' (festivo/mantenimiento/descanso) o
//               el profesor no tiene clases ese día
//
// Reglas críticas:
//   · VACÍO ≠ 0. Sin registro = pendiente, nunca falta.
//   · Nunca convertir pendiente en falta.
//   · Nunca almacenar estados ni porcentajes (son derivados).
// ============================================================================

export type EstadoAsistencia = "asistio" | "falta" | "pendiente" | "sin_clase";

export type DiaEstadoAsistencia = {
  fecha: string;
  diaSemana: DiaSemana;
  tipo: TipoDiaCalendario;
  estado: EstadoAsistencia;
  /** Clases que el profesor debería impartir ese día (config semanal). */
  clasesEsperadas: number;
  /** Clases a las que asistió el alumno (null si no hay registro). */
  clasesAsistidas: number | null;
};

/**
 * Deriva el estado de asistencia de un alumno para una fecha concreta.
 * Pura (sin I/O): recibe los datos ya cargados y resuelve el estado.
 */
export function estadoAsistenciaAlumno(input: {
  tipo: TipoDiaCalendario;
  clasesEsperadas: number;
  clasesAsistidas: number | null;
}): EstadoAsistencia {
  // Día no escolar (festivo/mantenimiento/descanso) → sin_clase.
  if (input.tipo !== "clase") return "sin_clase";
  // Día de clase pero el profesor no tiene clases ese día → sin_clase.
  if (input.clasesEsperadas <= 0) return "sin_clase";
  // Sin registro → pendiente (nunca falta).
  if (input.clasesAsistidas === null) return "pendiente";
  // 0 explícito → falta.
  if (input.clasesAsistidas === 0) return "falta";
  // > 0 → asistió.
  return "asistio";
}

/**
 * Obtiene el calendario de asistencia de un alumno (por CURP) para un ciclo.
 *
 * Realiza SOLO 3 consultas (calendario + clases_impartidas + asistencia_alumnos)
 * y resuelve los estados en memoria (sin N+1). Reutilizable para el perfil del
 * alumno, el perfil del padre y el calendario visual futuro.
 *
 * Si se pasa `profesorClave`, se limita a ese profesor (estado por profesor).
 * Si no, se agrega el aporte de todos los profesores del grupo (estado global).
 */
export async function obtenerEstadosAsistenciaAlumno(
  supabase: SupabaseClient,
  input: {
    curp: string;
    grado: string;
    grupo: string;
    carrera?: string;
    ciclo: string;
    profesorClave?: string;
  },
): Promise<DiaEstadoAsistencia[]> {
  const g = norm(input.grado);
  const gr = norm(input.grupo);
  const ciclo = norm(input.ciclo);
  if (!g || !gr || !ciclo) return [];

  // 1) Calendario del ciclo (fuente de verdad de días escolares).
  const calendario = await obtenerCalendarioEscolar(supabase, ciclo);
  if (calendario.length === 0) return [];

  // 2) Clases impartidas del grupo (SUM por fecha). Si hay profesorClave, solo
  //    el aporte de ese profesor; si no, el total del grupo.
  let qClases = supabase
    .from(TABLA_CLASES_IMPARTIDAS)
    .select("fecha, clases")
    .eq("grado", g)
    .eq("grupo", gr);
  if (input.profesorClave) {
    qClases = qClases.eq("profesor_clave", input.profesorClave);
  }
  const { data: clasesData } = await qClases;
  const clasesPorFecha = new Map<string, number>();
  for (const r of (clasesData ?? []) as { fecha: string; clases: number }[]) {
    clasesPorFecha.set(r.fecha, (clasesPorFecha.get(r.fecha) ?? 0) + r.clases);
  }

  // 3) Asistencia del alumno (SUM por fecha). Mismo filtro de profesor.
  let qAsist = supabase
    .from(TABLA_ASISTENCIA_ALUMNOS)
    .select("fecha, clases_asistidas")
    .eq("curp", input.curp)
    .eq("grado", g)
    .eq("grupo", gr);
  if (input.profesorClave) {
    qAsist = qAsist.eq("profesor_clave", input.profesorClave);
  }
  const { data: asistData } = await qAsist;
  const asistPorFecha = new Map<string, number>();
  for (const r of (asistData ?? []) as { fecha: string; clases_asistidas: number }[]) {
    asistPorFecha.set(r.fecha, (asistPorFecha.get(r.fecha) ?? 0) + r.clases_asistidas);
  }

  // 4) Resolver estados en memoria.
  const dias: DiaEstadoAsistencia[] = [];
  for (const d of calendario) {
    const fecha = d.fecha;
    const clasesEsperadas = clasesPorFecha.get(fecha) ?? 0;
    const clasesAsistidas = asistPorFecha.has(fecha)
      ? asistPorFecha.get(fecha)!
      : null;
    dias.push({
      fecha,
      diaSemana: diaSemanaDesdeFecha(fecha),
      tipo: d.tipo,
      estado: estadoAsistenciaAlumno({
        tipo: d.tipo,
        clasesEsperadas,
        clasesAsistidas,
      }),
      clasesEsperadas,
      clasesAsistidas,
    });
  }

  dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return dias;
}

/**
 * Calcula el porcentaje de asistencia SOLO sobre las clases registradas
 * (asistencias + faltas). Los días pendientes NO entran al denominador.
 *
 *   porcentaje = asistencias / (asistencias + faltas)
 *
 * Ejemplo: 18 asistencias + 2 faltas + 5 pendientes → 18/20 = 90%.
 * Es un valor DERIVADO: NO se almacena.
 */
export function calcularPorcentajeAsistencia(
  dias: DiaEstadoAsistencia[],
): number {
  let asistencias = 0;
  let faltas = 0;
  for (const d of dias) {
    if (d.estado === "asistio") asistencias++;
    else if (d.estado === "falta") faltas++;
  }
  const total = asistencias + faltas;
  if (total === 0) return 0;
  return Math.round((asistencias / total) * 100);
}


