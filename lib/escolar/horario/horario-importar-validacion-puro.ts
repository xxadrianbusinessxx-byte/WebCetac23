/**
 * horario-importar-validacion-puro.ts — MÓDULO PURO de
 * `horario-importar-validacion.ts`.
 *
 * Validación DENTRO del archivo de horario (forma, duplicados, solapamientos),
 * el conteo del detalle, las advertencias contra la hoja resumen, el alias de
 * carrera, la detección del ciclo escolar y el vínculo de cada materia al
 * catálogo (PROMPT AA). Cero I/O.
 *
 * Movido desde `horario-importar-validacion.ts` (PROMPT Q · Parte 1 · R-1);
 * `horario-importar-validacion.ts` re-exporta la API pública. `grupoLegibleTexto`
 * se exporta aquí porque el análisis completo (que consulta el catálogo) lo
 * sigue necesitando.
 */
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
  normalizarTextoCatalogo,
} from "../catalogo/catalogo-academico.ts";
import {
  clavesEquivalenciaMateria,
  horaAMinutos,
  materiaClaveHorario,
} from "./horario-semanal-puro.ts";
import { filaTexto } from "./horario-importar-lectura.ts";
import type { FilaHorarioNormalizada, FilaReporteHorario } from "./horario-importar.ts";

export type ResultadoAnalisisFilas = {
  filas: FilaHorarioNormalizada[];
  erroresPorFila: FilaReporteHorario[];
  totalValidas: number;
  totalRechazadas: number;
};

/** Lo mínimo de una fila de `materias` para vincularla desde el horario. */
export type MateriaIndexable = { id: string; clave: string; nombre: string | null };

/** Materias activas indexadas por clave y por nombre normalizados. */
export type IndiceMaterias<M extends MateriaIndexable> = {
  porClave: Map<string, M[]>;
  porNombre: Map<string, M[]>;
};

export function grupoLegibleTexto(f: FilaHorarioNormalizada): string {
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

/** Indexa las materias del catálogo por clave y nombre normalizados. */
export function indiceMateriasDesdeFilas<M extends MateriaIndexable>(
  filas: readonly M[],
): IndiceMaterias<M> {
  const porClave = new Map<string, M[]>();
  const porNombre = new Map<string, M[]>();
  for (const m of filas) {
    const clave = materiaClaveHorario(m.clave);
    porClave.set(clave, [...(porClave.get(clave) ?? []), m]);
    const nombre = materiaClaveHorario(m.nombre ?? "");
    if (nombre) porNombre.set(nombre, [...(porNombre.get(nombre) ?? []), m]);
  }
  return { porClave, porNombre };
}

/**
 * Vínculo de una materia del horario al catálogo (única o null).
 *
 * PROMPT AA: primero el nombre COMPLETO. «Inglés I» casa con `INGLES I` y, sin
 * romano, con la genérica `INGLES`; juntar las dos lo volvía ambiguo y dejaba la
 * fila sin vínculo. Solo si no hay materia exacta se prueba sin el romano, que
 * es lo que siguen necesitando los grupos con materias genéricas. Dos exactas
 * son una ambigüedad real: no se cae a la genérica.
 */
export function resolverMateriaEnIndice<M extends MateriaIndexable>(
  materia: string,
  indice: IndiceMaterias<M>,
): M | null {
  const [completa, ...sinRomano] = clavesEquivalenciaMateria(materia);
  if (!completa) return null;
  const coincidencias = (claves: string[]) => {
    const encontradas = new Set<M>();
    for (const c of claves) {
      for (const m of indice.porClave.get(c) ?? []) encontradas.add(m);
      for (const m of indice.porNombre.get(c) ?? []) encontradas.add(m);
    }
    return [...encontradas];
  };
  const exactas = coincidencias([completa]);
  const candidatas = exactas.length > 0 ? exactas : coincidencias(sinRomano);
  return candidatas.length === 1 ? candidatas[0]! : null;
}
