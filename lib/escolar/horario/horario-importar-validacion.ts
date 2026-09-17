import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
  normalizarTextoCatalogo,
  type MateriaRow,
} from "../catalogo/catalogo-academico";
import {
  TABLA_HORARIO_SEMANAL,
  TABLA_MATERIAS,
  TABLA_PERIODOS,
} from "../tables";
import {
  buscarGrupoEnLista,
  clavesEquivalenciaMateria,
  horaAMinutos,
  materiaClaveHorario,
  normalizarHoraVisible,
  obtenerGruposConCarreraDePeriodo,
  type GrupoConCarrera,
  type HorarioBloqueRow,
} from "./horario-semanal";
import {
  columnasObligatoriasHorario,
  detectarColumnasHorario,
  filaTexto,
  filaVacia,
  leerLibroExcel,
  localizarHojaDetalle,
  parsearFilaHorario,
} from "./horario-importar-lectura";
import type {
  FilaHorarioNormalizada,
  FilaHorarioParaEscribir,
  FilaReporteHorario,
} from "./horario-importar";

/**
 * HORARIO SEMANAL · IMPORTACIÓN · VALIDACIÓN.
 *
 * Validación DENTRO del archivo (forma, duplicados, solapamientos y
 * advertencias del resumen) y resolución contra el catálogo (grupos y
 * materias), más el análisis completo que alimenta el preview.
 *
 * Segunda de las tres partes del antiguo `lib/escolar/horario/horario-importar.ts`
 * (PROMPT E · R-3); `horario-importar.ts` re-exporta las tres.
 */


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

