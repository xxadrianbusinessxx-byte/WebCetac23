import type { SupabaseClient } from "@supabase/supabase-js";
import {
  archivoCsvAFilasConValores,
} from "../csv.ts";
import {
  matrizAXlsxBase64,
} from "../exportar-xlsx.ts";
import {
  CURP_ALUMNO_RE,
} from "../buscar-en-filas.ts";
import {
  type DiaSemana,
} from "../ciclo/calendario.ts";
import {
  detectarColumnasFechaAsistencia,
} from "../fechas.ts";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
} from "../catalogo/catalogo-academico.ts";
import {
  carreraEscolarDesdeEtiquetas,
} from "../alumno/informacion-personal.ts";
import {
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_CLASES_IMPARTIDAS,
  TABLA_ETIQUETAS_PERSONALES,
  type TipoDiaCalendario,
} from "../tables.ts";
import {
  obtenerConteosHorarioMateria,
} from "../horario/horario-semanal.ts";
import {
  resolverGrupoMateriaIdSubida,
} from "./asistencia-materia-resolucion.ts";
import {
  ERROR_ATRIBUCION_MATERIA_NO_RESUELTA,
  ERROR_ATRIBUCION_SIN_PROFESOR_ID,
  atribuirMateriaAlPlan,
} from "./atribucion-profesor.ts";
import {
  extraerMarcadorMateria,
  validarMarcadorMateria,
} from "./asistencia-marcador.ts";
import {
  traspasarMateriaAProfesor,
} from "../materia/traspaso-materia.ts";
import type {
  EtiquetasPersonalesRow,
} from "../types.ts";
import {
  ERROR_DDL_ATRIBUCION_PENDIENTE,
  FALLBACK_LEGACY_ETIQUETAS_ACTIVO,
  LIMITE_FILAS_SUBIDA,
  TAMANO_PAGINA,
  celdaTexto,
  columnaExiste,
  esEnteroNoNegativo,
  norm,
} from "./asistencia-comun.ts";
import {
  cargarCalendarioAsistenciaContexto,
} from "./asistencia-estados.ts";
import {
  cargarContextoCatalogoAsistencia,
  completarNombresAlumnos,
  obtenerCurpsInscritasGrupo,
} from "./asistencia-configuracion.ts";
import type {
  AlumnoPlantilla,
  ContextoAsistencia,
  PlanAsistencia,
  ResultadoAnalisis,
  ResultadoPlantilla,
} from "./asistencia-comun.ts";
/**
 * C4.3 â€” Obtiene los alumnos de un grado/grupo/carrera.
 * Fuente primaria: inscripciones_alumno (activas) del grupo del catÃ¡logo,
 * completando el nombre desde ALUMNOS.
 * Fallback LEGACY temporal (ETIQUETAS PERSONALES) solo si el grupo no se
 * resuelve en el catÃ¡logo o aÃºn no tiene inscripciones.
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

  // Fuente primaria: catÃ¡logo.
  const catalogo = await cargarContextoCatalogoAsistencia(supabase);
  if (catalogo) {
    const key = `${normalizarGradoCatalogo(g)}|${normalizarGrupoCatalogo(gr)}|${normalizarCarreraCatalogo(c)}`;
    const item = catalogo.indice.get(key);
    if (item) {
      const curps = await obtenerCurpsInscritasGrupo(supabase, item.id);
      if (curps.size > 0) return completarNombresAlumnos(supabase, curps);
      // El grupo existe en el catÃ¡logo pero aÃºn sin inscripciones â†’ se permite
      // el fallback legacy temporal para no perder alumnos pendientes.
    }
  }

  // Fallback LEGACY temporal (grupo no resuelto o sin inscripciones).
  if (FALLBACK_LEGACY_ETIQUETAS_ACTIVO) {
    return obtenerAlumnosDelGrupoLegacy(supabase, g, gr, c);
  }
  return [];
}

/**
 * @deprecated Fallback LEGACY: CURPs del grupo desde ETIQUETAS PERSONALES
 * (GRADO/GRUPO/CARRERA). Se eliminarÃ¡ cuando la migraciÃ³n de inscripciones
 * estÃ© verificada (ver FALLBACK_LEGACY_ETIQUETAS_ACTIVO).
 */
async function obtenerAlumnosDelGrupoLegacy(
  supabase: SupabaseClient,
  g: string,
  gr: string,
  c: string,
): Promise<AlumnoPlantilla[]> {
  const curps = new Set<string>();
  let desde = 0;
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
  return completarNombresAlumnos(supabase, curps);
}

/**
 * FASE HORARIO — Clases oficiales por fecha para la fila CLASES de una materia.
 *
 * Fuente: HORARIO SEMANAL OFICIAL (bloques de la materia seleccionada en el
 * grupo). Cualquier profesor puede generar la plantilla de una materia; el
 * sistema calcula automáticamente cuántas clases tiene esa materia cada día.
 */
async function resolverClasesOficialesParaPlantilla(
  supabase: SupabaseClient,
  ctx: ContextoAsistencia,
  fechas: string[],
): Promise<
  | {
      ok: true;
      usaHorario: boolean;
      aviso: string | null;
      porFecha: Map<string, number>;
    }
  | { ok: false; error: string }
> {
  // FASE HORARIO — la cantidad de clases por día sale del HORARIO OFICIAL de
  // la materia seleccionada (bloques por día). No depende de asignaciones ni
  // de configuración manual del profesor.
  if (!ctx.materiaClave) {
    return { ok: false, error: "Selecciona la materia para generar la plantilla." };
  }
  const materia = await obtenerConteosHorarioMateria(supabase, {
    ciclo: ctx.ciclo,
    grado: ctx.grado,
    grupo: ctx.grupo,
    carrera: ctx.carrera,
    materiaClave: ctx.materiaClave,
    fechas,
  });
  if (!materia.usaHorario) {
    return {
      ok: false,
      error:
        materia.aviso ??
        "El grupo no tiene horario oficial cargado para este periodo.",
    };
  }
  if (!materia.materiaEncontrada) {
    return { ok: false, error: materia.aviso ?? "La materia no se encontró." };
  }
  return {
    ok: true,
    usaHorario: true,
    aviso: null,
    porFecha: materia.conteosPorFecha,
  };
}

/**
 * Genera la plantilla de asistencias para un grado/grupo/carrera y ciclo.
 * Solo usa dÃ­as `tipo = 'clase'` del calendario. La plantilla incluye una fila
 * especial `CLASES` (clases impartidas por el profesor por dÃ­a) y una fila por
 * alumno (asistencia por dÃ­a).
 */
export async function generarPlantillaAsistencia(
  supabase: SupabaseClient,
  ctx: ContextoAsistencia,
): Promise<ResultadoPlantilla> {
  const ciclo = norm(ctx.ciclo);
  if (!ciclo) return { ok: false, error: "Indica un ciclo escolar." };

  const cargaCal = await cargarCalendarioAsistenciaContexto(supabase, ctx, {
    acotarAlParcial: true,
  });
  if (!cargaCal.ok) return { ok: false, error: cargaCal.error };
  const calendario = cargaCal.dias;
  const fechas = calendario
    .filter((d) => d.tipo === "clase")
    .map((d) => d.fecha)
    .sort();

  if (cargaCal.parcial && fechas.length === 0) {
    return {
      ok: false,
      error: `El parcial ${cargaCal.parcial.nombre} no tiene dias de clase en su rango (${cargaCal.parcial.fecha_inicio} a ${cargaCal.parcial.fecha_fin}) para el ciclo ${ciclo}. Verifica el calendario del periodo o el rango del parcial en Configuracion.`,
    };
  }
  if (fechas.length === 0) {
    return {
      ok: false,
      error: `El ciclo ${ciclo} no tiene dÃ­as de clase configurados en el calendario.`,
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
      error: `No hay alumnos en ${ctx.grado} Â· grupo ${ctx.grupo}${ctx.carrera ? ` Â· ${ctx.carrera}` : ""}.`,
    };
  }

  // FASE HORARIO — la fila CLASES se deriva del horario oficial del grupo
  // (bloques programados del profesor); la configuracion legacy solo se usa
  // como respaldo temporal mientras el grupo no tenga horario cargado.
  const clases = await resolverClasesOficialesParaPlantilla(
    supabase,
    ctx,
    fechas,
  );
  if (!clases.ok) return { ok: false, error: clases.error };

  // PROMPT S (A1) — la plantilla lleva su materia. Se resuelve el
  // grupo_materia_id y se escribe una fila reservada `MATERIA` (verifica, no
  // decide). Sin materia resuelta no se puede generar una plantilla válida.
  const resMateria = await resolverGrupoMateriaIdSubida(supabase, ctx);
  if (!resMateria.ok) return { ok: false, error: resMateria.error };
  if (!resMateria.grupoMateriaId) {
    return { ok: false, error: ERROR_ATRIBUCION_MATERIA_NO_RESUELTA };
  }

  const filas: string[][] = [];
  filas.push(["CURP", "NOMBRE", ...fechas]);
  filas.push([
    "CLASES",
    ctx.profesorNombre,
    ...fechas.map((f) => String(clases.porFecha.get(f) ?? 0)),
  ]);
  filas.push(["MATERIA", resMateria.nombreVisible ?? "", resMateria.grupoMateriaId]);
  for (const a of alumnos) {
    filas.push([a.curp, a.nombre, ...fechas.map(() => "")]);
  }

  const nombreBase = [ctx.grado, ctx.grupo, ctx.carrera]
    .filter(Boolean)
    .join("_")
    .replace(/\s+/g, "_");
  // PROMPT S (A1) — el nombre del archivo incluye la clave de la materia.
  const claveMateriaArchivo = (ctx.materiaClave ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_");

  return {
    ok: true,
    plantilla: {
      fechas,
      alumnos,
      // Entregable SIEMPRE en .xlsx (el CSV corrompe CURP, nombres y fechas).
      base64: matrizAXlsxBase64(
        filas,
        "Asistencias",
        [20, 50, ...fechas.map(() => 11)],
      ),
      nombreArchivo: `asistencias_${nombreBase || "grupo"}_${claveMateriaArchivo || "materia"}_${ctx.ciclo}${cargaCal.parcial ? `_parcial${cargaCal.parcial.numero}` : ""}.xlsx`,
      usaHorario: clases.usaHorario,
      aviso: clases.aviso,
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
  //    Excel lleguen como serial numÃ©rico y no como texto regional).
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
    return { ok: false, error: "El archivo estÃ¡ vacÃ­o o solo tiene encabezados." };
  }

  const [rawHead, ...rawDatos] = noVacias;
  const encabezados = rawHead!.map((h, i) =>
    (h == null ? "" : String(h)).trim() || `Col ${i + 1}`,
  );

  // 2) Detectar columnas CURP y NOMBRE (reutiliza el detector del roster).
  const idxCurp = encabezados.findIndex((h) => /^CURP$/i.test(h));
  const idxNombre = encabezados.findIndex((h) => /^NOMBRE$/i.test(h));
  if (idxCurp < 0) {
    return { ok: false, error: "La plantilla debe incluir una columna Â«CURPÂ»." };
  }
  if (idxNombre < 0) {
    return { ok: false, error: "La plantilla debe incluir una columna Â«NOMBREÂ»." };
  }

  // PROMPT S (A1) — la plantilla debe indicar su materia. Se resuelve la
  // materia elegida (ctx.materiaClave, validada en el servidor) y se exige el
  // marcador `MATERIA`: verifica, no decide. Sin materia resuelta no hay nada
  // que comparar y se rechaza.
  const resMateria = await resolverGrupoMateriaIdSubida(supabase, ctx);
  if (!resMateria.ok) return { ok: false, error: resMateria.error };
  if (!resMateria.grupoMateriaId) {
    return { ok: false, error: ERROR_ATRIBUCION_MATERIA_NO_RESUELTA };
  }
  const marcador = extraerMarcadorMateria(rawDatos, idxCurp, idxNombre);
  const validacionMarcador = validarMarcadorMateria(marcador, {
    grupoMateriaId: resMateria.grupoMateriaId,
    nombreVisible: resMateria.nombreVisible ?? "",
  });
  if (!validacionMarcador.ok) {
    return { ok: false, error: validacionMarcador.error };
  }


  // 3) Calendario: dÃ­as vÃ¡lidos de clase del ciclo (fuente de verdad).
  const cargaCal = await cargarCalendarioAsistenciaContexto(supabase, ctx, {
    acotarAlParcial: false,
  });
  if (!cargaCal.ok) return { ok: false, error: cargaCal.error };
  const calendario = cargaCal.dias;
  const diasClase = new Set(
    calendario.filter((d) => d.tipo === "clase").map((d) => d.fecha),
  );
  const diasNoClase = new Map(
    calendario.filter((d) => d.tipo !== "clase").map((d) => [d.fecha, d.tipo]),
  );

  // 4) Detectar columnas de fecha usando la capa canÃ³nica de fechas. Cada
  //    encabezado se normaliza UNA SOLA VEZ a YYYY-MM-DD y se valida contra el
  //    calendario. El CONTRATO INTERNO es: `columna.fecha` (canÃ³nica) es la
  //    ÃšNICA representaciÃ³n de la fecha; `columna.indice` localiza la celda del
  //    alumno. El encabezado original (p.ej. serial Excel "46259") NUNCA vuelve
  //    a usarse para identificar la fecha.
  const deteccion = detectarColumnasFechaAsistencia(
    encabezados,
    calendario,
    [idxCurp, idxNombre],
  );
  // Columnas reconocidas como dÃ­as de clase: { indice, fecha }.
  const columnasFecha = deteccion.columnas.map((c) => ({
    indice: c.indice,
    fecha: c.fecha!,
  }));
  // El parcial acota el rango: fechas de otro parcial en el archivo = error
  // (no se escribe nada). El mensaje indica ejemplos y a qué rango pertenece.
  if (cargaCal.parcial) {
    const fueraDeRango = columnasFecha.filter(
      (c) =>
        !(
          c.fecha >= cargaCal.parcial!.fecha_inicio &&
          c.fecha <= cargaCal.parcial!.fecha_fin
        ),
    );
    if (fueraDeRango.length > 0) {
      const ejemplos = fueraDeRango
        .slice(0, 3)
        .map((c) => c.fecha)
        .join(", ");
      return {
        ok: false,
        error: `La plantilla tiene fechas fuera del parcial «${cargaCal.parcial.nombre}» (${cargaCal.parcial.fecha_inicio} a ${cargaCal.parcial.fecha_fin}). Fuera de rango: ${ejemplos}. Descarga la plantilla del parcial correcto.`,
      };
    }
  }
  if (columnasFecha.length === 0) {

    // Mensaje de error mÃ¡s Ãºtil segÃºn quÃ© fallÃ³.
    if (deteccion.ambiguas > 0) {
      const ejemplos = deteccion.todas
        .filter((c) => c.estado === "ambigua")
        .slice(0, 3)
        .map((c) => `Â«${c.encabezadoOriginal}Â» (Â¿${c.candidatos.join(" o ")}?)`)
        .join(", ");
      return {
        ok: false,
        error: `No se pudieron reconocer las fechas del archivo. ${ejemplos ? `Columnas ambiguas: ${ejemplos}. ` : ""}AsegÃºrate de que las fechas coincidan con dÃ­as de clase del ciclo ${ciclo} (formato YYYY-MM-DD).`,
      };
    }
    if (deteccion.noDiaClase > 0) {
      const ejemplos = deteccion.todas
        .filter((c) => c.estado === "no_es_dia_clase")
        .slice(0, 3)
        .map((c) => `Â«${c.encabezadoOriginal}Â» â†’ ${c.fecha}`)
        .join(", ");
      return {
        ok: false,
        error: `Las fechas del archivo no son dÃ­as de clase del ciclo ${ciclo}. ${ejemplos ? `Ejemplos: ${ejemplos}. ` : ""}Revisa el calendario escolar o descarga una plantilla nueva.`,
      };
    }
    return {
      ok: false,
      error: `La plantilla no tiene columnas de fecha reconocibles. AsegÃºrate de que las fechas coincidan con dÃ­as de clase del ciclo ${ciclo} (formato YYYY-MM-DD).`,
    };
  }
  // `columnasFecha` es el CONTRATO INTERNO: cada elemento es
  //   { indice, fecha } donde `fecha` es YYYY-MM-DD (canÃ³nica) y `indice`
  //   localiza la celda del alumno en la fila. El encabezado original
  //   (p.ej. serial Excel "46259") ya NO se usa para identificar la fecha.


  // 5) Alumnos del grupo (CURP â†’ nombre).

  const alumnos = await obtenerAlumnosDelGrupo(supabase, g, gr, c);
  const alumnosPorCurp = new Map(alumnos.map((a) => [a.curp, a.nombre]));

  // 6/7) Registros previos de ESTE profesor en este grupo (para detectar
  //      "sin cambios" y como respaldo del máximo). PROMPT C/D: el alcance es
  //      SIEMPRE `profesor_id` (nunca la contraseña). Sin profesorId o sin la
  //      columna (esquema pendiente) no se comparan previos (todo pasa a
  //      "actualizado"), lo cual es seguro y nunca mezcla aportes ajenos.
  const pidPrevio =
    ctx.profesorId != null &&
    Number.isInteger(Number(ctx.profesorId)) &&
    Number(ctx.profesorId) > 0
      ? Number(ctx.profesorId)
      : null;
  let previoPorId = false;
  if (pidPrevio) {
    const probe = await supabase
      .from(TABLA_CLASES_IMPARTIDAS)
      .select("profesor_id")
      .limit(1);
    previoPorId = !probe.error;
  }
  const clasesPreviasPorFecha = new Map<string, number>();
  const asistenciasPreviasPorClave = new Map<string, number>();
  if (previoPorId && pidPrevio) {
    const { data: clasesPrevias } = await supabase
      .from(TABLA_CLASES_IMPARTIDAS)
      .select("fecha, clases")
      .eq("profesor_id", pidPrevio)
      .eq("grado", g)
      .eq("grupo", gr)
      .eq("grupo_materia_id", resMateria.grupoMateriaId);
    for (const r of (clasesPrevias ?? []) as { fecha: string; clases: number }[]) {
      clasesPreviasPorFecha.set(r.fecha, r.clases);
    }

    const { data: asistenciasPrevias } = await supabase
      .from(TABLA_ASISTENCIA_ALUMNOS)
      .select("curp, fecha, clases_asistidas")
      .eq("profesor_id", pidPrevio)
      .eq("grado", g)
      .eq("grupo", gr)
      .eq("grupo_materia_id", resMateria.grupoMateriaId);
    for (const r of (asistenciasPrevias ?? []) as {
      curp: string;
      fecha: string;
      clases_asistidas: number;
    }[]) {
      asistenciasPreviasPorClave.set(`${r.curp}|${r.fecha}`, r.clases_asistidas);
    }
  }

  // 8) Clases oficiales por fecha. Fuente: HORARIO OFICIAL (bloques del
  //    profesor); respaldo legacy temporal = configuracion_clases_profesor.
  //    La fila CLASES del archivo es solo informativa.
  const fechasCiclo = [...diasClase].sort();
  const oficialesPlantilla = await resolverClasesOficialesParaPlantilla(
    supabase,
    ctx,
    fechasCiclo,
  );
  if (!oficialesPlantilla.ok) {
    return { ok: false, error: oficialesPlantilla.error };
  }
  const usaHorario = oficialesPlantilla.usaHorario;
  const avisoClases = oficialesPlantilla.aviso;
  const fuenteClases: "horario" | "configuracion" = usaHorario
    ? "horario"
    : "configuracion";

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

  // 10) Fila CLASES del archivo: se compara contra la fuente oficial
  //     (horario o configuracion legacy). Las discrepancias son informativas
  //     y NO alteran la fuente. El valor oficial de `clases_impartidas` es el
  //     de la fuente oficial.
  const clasesArchivoPorFecha = new Map<string, number>();
  for (const fila of rawDatos) {
    const curpCelda = celdaTexto(fila[idxCurp]).toUpperCase();
    if (curpCelda !== "CLASES") continue;

    for (const columna of columnasFecha) {
      const fecha = columna.fecha;
      const valor = celdaTexto(fila[columna.indice]);
      if (valor === "") continue; // celda vacÃ­a: no aporta informaciÃ³n
      if (!esEnteroNoNegativo(valor)) {
        erroresDetalle.push(`Fila CLASES: Â«${valor}Â» no es un nÃºmero vÃ¡lido para ${fecha}.`);
        errores++;
        continue;
      }
      clasesArchivoPorFecha.set(fecha, Number(valor));
    }

  }


  // 11) Clases oficiales por fecha (fuente: horario oficial o config legacy).
  //     Solo para las fechas presentes en el archivo que sean dÃ­as de clase.
  const clasesOficialesPorFecha = new Map<string, number>();
  for (const columna of columnasFecha) {
    const fecha = columna.fecha;
    if (!diasClase.has(fecha)) continue;
    const oficial = oficialesPlantilla.porFecha.get(fecha) ?? 0;
    clasesOficialesPorFecha.set(fecha, oficial);

    const delArchivo = clasesArchivoPorFecha.get(fecha);
    if (delArchivo !== undefined && delArchivo !== oficial) {
      discrepanciasDetalle.push(
        `Fila CLASES: el archivo dice ${delArchivo} clases el ${fecha}, pero la fuente oficial (${fuenteClases}) indica ${oficial}. Se usarÃ¡ ${oficial}.`,
      );
      discrepancias++;
    }

    // `clases_impartidas` registra el dato efectivo (fuente oficial).
    clasesImpartidas.push({
      profesor_clave: ctx.profesorClave,
      grado: g,
      grupo: gr,
      carrera: c,
      fecha,
      clases: oficial,
    });
  }

  // 12) DÃ­as PENDIENTES: dÃ­as de clase del ciclo en los que el profesor tiene
  //     clases segÃºn la fuente oficial (oficial > 0) pero que NO vienen en el
  //     archivo. Quedan pendientes (sin registro), NO se marcan como falta.
  const fechasEnArchivo = new Set(columnasFecha.map((c) => c.fecha));

  const pendientesDetalle: string[] = [];
  const diasClaseOrdenados = [...diasClase].sort();
  for (const fecha of diasClaseOrdenados) {
    if (fechasEnArchivo.has(fecha)) continue;
    // CICLO GLOBAL + PARCIAL — los PENDIENTES se calculan solo dentro del
    // rango del parcial elegido (no del ciclo entero).
    if (
      cargaCal.parcial &&
      !(
        fecha >= cargaCal.parcial.fecha_inicio &&
        fecha <= cargaCal.parcial.fecha_fin
      )
    ) {
      continue;
    }
    const oficial = oficialesPlantilla.porFecha.get(fecha) ?? 0;
    if (oficial > 0) {
      pendientesDetalle.push(
        `${fecha} (${oficial} clases segÃºn ${fuenteClases === "horario" ? "el horario oficial" : "tu configuraciÃ³n"})`,
      );
    }
  }

  // 13) Filas de alumnos.
  for (const fila of rawDatos) {
    const curp = celdaTexto(fila[idxCurp]).toUpperCase();
    // La fila reservada `MATERIA` se salta igual que `CLASES` (A1).
    if (!curp || curp === "CLASES" || curp === "MATERIA") continue;


    // CURP vÃ¡lido.
    if (!CURP_ALUMNO_RE.test(curp)) {
      omitidosDetalle.push(`CURP invÃ¡lido: Â«${curp}Â»`);
      omitidos++;
      continue;
    }

    // Evitar duplicados dentro del archivo.
    if (curpsVistos.has(curp)) {
      omitidosDetalle.push(`CURP duplicado en el archivo: Â«${curp}Â»`);
      omitidos++;
      continue;
    }
    curpsVistos.add(curp);

    // Alumno debe pertenecer al grado/grupo seleccionado.
    const nombreEsperado = alumnosPorCurp.get(curp);
    if (nombreEsperado === undefined) {
      omitidosDetalle.push(`CURP no pertenece a ${g} Â· grupo ${gr}: Â«${curp}Â»`);
      omitidos++;
      continue;
    }

    const nombre = celdaTexto(fila[idxNombre]) || nombreEsperado;
    procesados++;

    for (const columna of columnasFecha) {
      const fecha = columna.fecha;
      const valor = celdaTexto(fila[columna.indice]);


      // Fecha debe ser dÃ­a de clase. `fecha` es SIEMPRE la canÃ³nica YYYY-MM-DD
      // (nunca el encabezado original, p.ej. serial Excel "46259").
      if (!diasClase.has(fecha)) {
        const tipo = diasNoClase.get(fecha);
        erroresDetalle.push(
          tipo
            ? `${curp}: ${fecha} no es dÃ­a de clase (${tipo}).`
            : `${curp}: ${fecha} no estÃ¡ en el calendario del ciclo.`,
        );
        errores++;
        continue;
      }


      // Celda VACÃA â‰  0. VacÃ­o = sin registro = PENDIENTE (no se escribe nada).
      if (valor === "") continue;

      if (!esEnteroNoNegativo(valor)) {
        erroresDetalle.push(`${curp}: Â«${valor}Â» no es un nÃºmero vÃ¡lido para ${fecha}.`);
        errores++;
        continue;
      }
      const asistencia = Number(valor);

      // No puede superar las clases oficiales del profesor ese dÃ­a.
      const maxClases = clasesOficialesPorFecha.get(fecha) ?? 0;
      if (asistencia > maxClases) {
        erroresDetalle.push(
          `${curp}: asistencia ${asistencia} supera las ${maxClases} clases del ${fecha} segÃºn la fuente oficial (${fuenteClases}).`,
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
      grupoMateriaId: resMateria.grupoMateriaId,
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
        fuenteClases,
        usaHorario,
        aviso: avisoClases,
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

// ============================================================================
// PROMPT C (R-3) — ATRIBUCIÓN DE MATERIA AL PROFESOR EN LA SUBIDA
// ----------------------------------------------------------------------------
// Al confirmar una plantilla se resuelve el grupo_materia_id (UNA resolución
// por subida, nunca por fila de alumno), se activa/crea la asignación
// (profesor_id, grupo_materia_id) y se guardan las filas nuevas con
// profesor_id + grupo_materia_id. Las decisiones de escritura (claves de
// conflicto, idempotencia) viven en lib/escolar/atribucion-profesor.ts (puro).
// ============================================================================

/**
 * Verifica que el esquema de atribución exista (profesor_id + grupo_materia_id
 * en ambas tablas). Sin él, confirmarAsistencias NO escribe (R-2/R-3).
 */
async function verificarEsquemaAtribucion(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [p1, p2, g1, g2] = await Promise.all([
    columnaExiste(supabase, TABLA_CLASES_IMPARTIDAS, "profesor_id"),
    columnaExiste(supabase, TABLA_ASISTENCIA_ALUMNOS, "profesor_id"),
    columnaExiste(supabase, TABLA_CLASES_IMPARTIDAS, "grupo_materia_id"),
    columnaExiste(supabase, TABLA_ASISTENCIA_ALUMNOS, "grupo_materia_id"),
  ]);
  if (!p1 || !p2 || !g1 || !g2) {
    return { ok: false, error: ERROR_DDL_ATRIBUCION_PENDIENTE };
  }
  return { ok: true };
}

/**
 * Confirma la plantilla y ATRIBUYE la materia (Prompt C — R-3 + PROMPT S · A).
 *
 *  1. La identidad SIEMPRE es `profesor_id` (sesion.profesorId); sin ella se
 *     rechaza y NO se escribe con la contraseña (sesión vieja → re-login).
 *  2. Requiere el esquema R-1 (grupo_materia_id); sin él responde error
 *     controlado y NO escribe con la contraseña.
 *  3. Reusa la materia resuelta por `analizarPlantillaAsistencia` (UNA
 *     resolución por subida, validada contra el marcador MATERIA) y rechaza
 *     si no es atribuible al grupo en el catálogo.
 *  4. LLAMA la RPC `traspasar_materia_a_profesor` (Prompt D) ANTES de escribir:
 *     el que sube la plantilla se convierte en dueño de la materia (asignación
 *     y registros previos se traspasan) en una sola transacción. Si la RPC no
 *     está desplegada, NO se escribe nada.
 *  5. Una sola petición UPSERT POR TABLA (A3) de clases_impartidas /
 *     asistencia_alumnos con `profesor_id` + `grupo_materia_id` + `periodo_id`
 *     y la clave de conflicto POR MATERIA (2 materias del mismo grupo y día =
 *     2 filas; re-subir la misma = actualizar, no duplicar).
 */
export async function confirmarAsistencias(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoAsistencia,
): Promise<ResultadoAnalisis> {
  const analisis = await analizarPlantillaAsistencia(supabase, file, ctx);
  if (!analisis.ok) return analisis;

  const { plan } = analisis;

  // FASE HORARIO — si la fuente es el horario oficial pero el profesor no
  // puede atribuirse bloques (sin asignación en el grupo o sin materias
  // suyas), NO se escribe: evita sobrescribir registros previos con ceros.
  if (plan.resumen.usaHorario && plan.resumen.aviso) {
    return { ok: false, error: plan.resumen.aviso };
  }

  // PROMPT S (A3) — escritura por tabla, sin medias tintas. Si el plan supera
  // el límite se rechaza ANTES de escribir y se pide subir por parcial.
  const totalFilas = plan.clasesImpartidas.length + plan.asistencias.length;
  if (totalFilas > LIMITE_FILAS_SUBIDA) {
    return {
      ok: false,
      error: `La subida supera el límite de ${LIMITE_FILAS_SUBIDA} filas (tiene ${totalFilas}). Divídela por parcial para guardarla.`,
    };
  }

  // R-2/R-3 — identidad estructural PROFESORES.ID (nunca la contraseña).
  const profesorId =
    ctx.profesorId != null &&
    Number.isInteger(Number(ctx.profesorId)) &&
    Number(ctx.profesorId) > 0
      ? Number(ctx.profesorId)
      : null;
  if (!profesorId) {
    return { ok: false, error: ERROR_ATRIBUCION_SIN_PROFESOR_ID };
  }

  // Esquema R-1 aplicado (columnas de atribución) — sin él, nada de escrituras.
  const esquema = await verificarEsquemaAtribucion(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };

  // Materia resuelta ya por analizarPlantillaAsistencia (A1): se reutiliza para
  // no repetir la resolución. Sin materia no se escribe.
  const grupoMateriaId = plan.grupoMateriaId;
  if (!grupoMateriaId) {
    return { ok: false, error: ERROR_ATRIBUCION_MATERIA_NO_RESUELTA };
  }

  // Decisión pura de escritura (filas enriquecidas + claves de conflicto).
  // Va ANTES del traspaso: el traspaso es un efecto que no se deshace, y una
  // subida que la decisión pura va a rechazar no debe cambiar de dueño la materia.
  const atribuido = atribuirMateriaAlPlan(
    { clasesImpartidas: plan.clasesImpartidas, asistencias: plan.asistencias },
    {
      profesorId,
      grupoMateriaId,
      profesorClave: ctx.profesorClave,
      periodoId: ctx.periodoId ?? null,
    },
  );
  if (!atribuido.ok) return atribuido;

  // PROMPT D — TRASPASO antes de escribir: la RPC deja la materia completa a
  // este profesor (asignaciones de otros → inactivas; sus registros → su id).
  // Cero N+1: una sola llamada por subida. Si falla, NO se escribe nada.
  const traspaso = await traspasarMateriaAProfesor(
    supabase,
    grupoMateriaId,
    profesorId,
  );
  if (!traspaso.ok) return { ok: false, error: traspaso.error };

  // PROMPT S (A3) — una sola petición UPSERT por tabla (cada petición de
  // PostgREST es una transacción). Orden: primero clases, después asistencias.
  const { error: errClases } = await supabase
    .from(TABLA_CLASES_IMPARTIDAS)
    .upsert(atribuido.clasesImpartidas, { onConflict: atribuido.conflictoClases });
  if (errClases) {
    return { ok: false, error: `Error en clases impartidas: ${errClases.message}` };
  }

  // UPSERT asistencia_alumnos (profesor_id + materia + curp + grupo + fecha).
  // Si falla, los días quedan PENDIENTES (nunca en falta) y volver a subir el
  // mismo archivo es idempotente.
  const { error: errAsist } = await supabase
    .from(TABLA_ASISTENCIA_ALUMNOS)
    .upsert(atribuido.asistencias, { onConflict: atribuido.conflictoAsistencia });
  if (errAsist) {
    return {
      ok: false,
      error: `Error en asistencias: ${errAsist.message}. Los días quedan pendientes (nunca en falta) y volver a subir el mismo archivo es idempotente.`,
    };
  }

  return { ok: true, plan };
}


// ============================================================================
// ESTADOS DERIVADOS DE ASISTENCIA (Bloque 5D)
// ----------------------------------------------------------------------------
// Para la futura visualizaciÃ³n del alumno/padre (calendario visual) se derivan
// cuatro estados a partir de los datos existentes. NO se almacenan en ninguna
// tabla nueva:
//
//   asistio   â†’ existe registro y clases_asistidas > 0
//   falta     â†’ existe registro y clases_asistidas = 0 (0 EXPLÃCITO)
//   pendiente â†’ dÃ­a tipo='clase' + el profesor tiene clases ese dÃ­a (config)
//               + el alumno pertenece al grupo + NO existe registro
//   sin_clase â†’ el dÃ­a NO es tipo='clase' (festivo/mantenimiento/descanso) o
//               el profesor no tiene clases ese dÃ­a
//
// Reglas crÃ­ticas:
//   Â· VACÃO â‰  0. Sin registro = pendiente, nunca falta.
//   Â· Nunca convertir pendiente en falta.
//   Â· Nunca almacenar estados ni porcentajes (son derivados).
// ============================================================================

export type EstadoAsistencia = "asistio" | "falta" | "pendiente" | "sin_clase";

export type DiaEstadoAsistencia = {
  fecha: string;
  diaSemana: DiaSemana;
  tipo: TipoDiaCalendario;
  estado: EstadoAsistencia;
  /** Clases que el profesor deberÃ­a impartir ese dÃ­a (config semanal). */
  clasesEsperadas: number;
  /** Clases a las que asistiÃ³ el alumno (null si no hay registro). */
  clasesAsistidas: number | null;
};

