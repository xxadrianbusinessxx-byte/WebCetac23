/**
 * C3.1/F3 — CARGA MASIVA DE ALUMNOS + PERTENENCIA ACADÉMICA
 *
 * Extiende el pipeline existente de carga (ALUMNOS) para resolver, en la misma
 * operación, la PERTENENCIA ACADÉMICA contra el catálogo (inscripciones_alumno).
 *
 * PRINCIPIOS:
 *   - ALUMNOS = identidad/datos personales (motor existente intacto).
 *   - INSCRIPCIONES_ALUMNO = pertenencia académica.
 *   - NUNCA se guarda GRADO/GRUPO/CARRERA en ALUMNOS.
 *   - NUNCA se usa ETIQUETAS PERSONALES como fuente de pertenencia en la carga.
 *   - NUNCA se interpretan nombres de tablas legacy (ni tabla_legacy) para
 *     resolver grupos: se resuelve contra periodos/grupos/carreras con la
 *     normalización G2.
 *   - La preview NO escribe. La aplicación requiere confirmación explícita
 *     (la Server Action valida rol directivo).
 *   - Bloquea la escritura si existen AMBIGUOS, GRUPOS INEXISTENTES o
 *     CONFLICTOS ACADÉMICOS por CURP duplicada.
 *   - F3 (ruta con `periodoId`): una carga dirigida a un período NUNCA
 *     modifica, desactiva ni sustituye inscripciones de otro período. El
 *     destino se resuelve por `periodos.id`, los grupos por
 *     `grupos.periodo_id = periodoId AND activo`, y la inscripción se aplica
 *     con `inscribirAlumnoEnCiclo` (BORRADOR → activo=false). La clasificación
 *     (SIN_CAMBIO / NUEVA_INSCRIPCION / CAMBIO_DE_GRUPO) se calcula SOLO
 *     dentro del período destino.
 *   - Cambios de grupo (ruta legacy sin periodoId): nunca DELETE; se desactiva
 *     la activa anterior y se activa la nueva (historial conservado vía
 *     inscribirAlumno/unaActiva).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { pareceCurp, normalizarCurp } from "./buscar-en-filas";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
  obtenerInscripcionActiva,
  inscribirAlumno,
  type CarreraRow,
  type GrupoRow,
  type InscripcionRow,
} from "./catalogo-academico";
import {
  analizarRoster,
  sincronizarAlumnosDesdeArchivo,
} from "./alumnos";
import { archivoCsvAFilas } from "./csv";
import {
  ESTADO_HISTORICO,
  consultarPeriodo,
  resolverEstadoPeriodo,
  type FilaPeriodoEstado,
} from "./ciclo-estado";
import { inscribirAlumnoEnCiclo } from "./inscripciones-borrador";
import {
  detectarColumnasRoster,
  mapeoRosterValido,
  crearMapeoRoster,
  type MapeoRoster,
} from "./mapeo-columnas";
import {
  TABLA_CARRERAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_PERIODOS,
} from "./tables";

/* ---------------------------------------------------------------------------
 * TIPOS
 * ------------------------------------------------------------------------- */

/**
 * Contexto académico externo (modo B: Excel sin columnas G/G/C).
 *
 * F3: `periodoId` presente → ruta nueva (destino = `periodos.id = periodoId`,
 * BORRADOR u OPERATIVO; grupos por `grupos.periodo_id`). `periodoId` ausente →
 * ruta legacy (destino por `periodoNombre` + ciclo operativo global). Se
 * conserva `periodoNombre` por compatibilidad con consumidores legacy.
 */
export type ContextoAcademico = {
  periodoNombre: string;
  periodoId?: string;
  grado: string;
  grupo: string;
  carrera: string;
};

export type EstadoAcademico =
  | "SIN_DATOS_ACADEMICOS"
  | "NUEVA_INSCRIPCION"
  | "SIN_CAMBIO"
  | "CAMBIO_DE_GRUPO"
  | "GRUPO_INEXISTENTE"
  | "AMBIGUO"
  | "CURP_DUPLICADA_CONFLICTO_ACADEMICO";

/** Grupo legible (grado + nombre + carrera) para la previsualización UX. */
export type GrupoDetalleCarga = {
  grado: string;
  nombre: string;
  carrera: string | null;
};

export type DetalleCargaAcademica = {
  curp: string;
  gradoOriginal: string;
  grupoOriginal: string;
  carreraOriginal: string;
  gradoNormalizado: string;
  grupoNormalizado: string;
  carreraNormalizada: string;
  estado: EstadoAcademico;
  grupoDestinoId?: string;
  grupoActualId?: string | null;
  /** C4.24 — grupo actual legible del alumno (null = sin inscripción). */
  grupoActual?: GrupoDetalleCarga | null;
  /** C4.24 — grupo destino legible (grado+grupo+carrera). */
  grupoDestino?: GrupoDetalleCarga | null;
  candidatos?: { grupoId: string; grado: string; grupo: string; carrera: string | null }[];
  esAlumnoNuevo: boolean;
};

export type ResumenAlumnos = {
  totalFilas: number;
  curpsValidas: number;
  curpsAusentes: number;
  curpsDuplicadas: number;
  alumnosNuevos: number;
  alumnosExistentes: number;
  alumnosSinCambios: number;
  camposCompletados: number;
};

export type ResumenAcademico = {
  sinDatosAcademicos: number;
  nuevasInscripciones: number;
  sinCambio: number;
  cambiosDeGrupo: number;
  gruposInexistentes: number;
  ambiguos: number;
  conflictosAcademicos: number;
};

export type PreviewCargaAcademica = {
  ok: boolean;
  error?: string;
  mapeo: MapeoRoster;
  periodoUtilizado: string | null;
  alumnos: ResumenAlumnos;
  academico: ResumenAcademico;
  bloqueaEscritura: boolean;
  detalle: DetalleCargaAcademica[];
};

export type OpcionesCargaAcademica = {
  mapeo?: MapeoRoster;
  contexto?: ContextoAcademico;
};

export type ResultadoAplicarCarga = {
  ok: boolean;
  error?: string;
  alumnos: {
    agregados: number;
    completados: number;
    yaExistentesSinCambios: number;
    omitidos: number;
    duplicados: number;
  };
  inscripciones: {
    nuevas: number;
    cambiosDeGrupo: number;
    errores: number;
    erroresDetalle: string[];
  };
};

/* ---------------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------------- */

type FilaContexto = {
  curp: string;
  gradoOriginal: string;
  grupoOriginal: string;
  carreraOriginal: string;
  gradoNorm: string;
  grupoNorm: string;
  carreraNorm: string;
  conflicto: boolean;
};

type FilasParseadas = {
  mapeo: MapeoRoster;
  totalFilas: number;
  filasSinCurp: number;
  curpsDuplicadas: number;
  porCurp: Map<string, FilaContexto>;
};

/** Parsea el archivo y extrae el contexto académico por CURP (primera gana). */
async function leerFilasConContexto(
  file: File,
  mapeo?: MapeoRoster,
): Promise<FilasParseadas> {
  const { filas } = await archivoCsvAFilas(file);
  const datos = filas.filter((f) => f.some((c) => (c ?? "").trim() !== ""));
  if (datos.length < 1) {
    throw new Error("El archivo está vacío o no se pudo leer.");
  }

  const head = datos[0].map((h, i) => (h ?? "").trim() || `Col ${i + 1}`);
  const mapeoFinal =
    mapeo && mapeoRosterValido(mapeo, head.length)
      ? mapeo
      : detectarColumnasRoster(head);

  const filasDatos = datos.slice(1);
  const porCurp = new Map<string, FilaContexto>();
  let filasSinCurp = 0;
  let curpsDuplicadas = 0;

  for (const fila of filasDatos) {
    const curp = normalizarCurp(String(fila[mapeoFinal.curp] ?? ""));
    if (!curp || !pareceCurp(curp)) {
      filasSinCurp++;
      continue;
    }

    const gradoOriginal =
      mapeoFinal.grado >= 0 ? String(fila[mapeoFinal.grado] ?? "").trim() : "";
    const grupoOriginal =
      mapeoFinal.grupo >= 0 ? String(fila[mapeoFinal.grupo] ?? "").trim() : "";
    const carreraOriginal =
      mapeoFinal.carrera >= 0 ? String(fila[mapeoFinal.carrera] ?? "").trim() : "";

    const ctx: FilaContexto = {
      curp,
      gradoOriginal,
      grupoOriginal,
      carreraOriginal,
      gradoNorm: normalizarGradoCatalogo(gradoOriginal),
      grupoNorm: normalizarGrupoCatalogo(grupoOriginal),
      carreraNorm: normalizarCarreraCatalogo(carreraOriginal),
      conflicto: false,
    };

    const previo = porCurp.get(curp);
    if (previo) {
      // Regla actual: la primera ocurrencia es la fila ganadora.
      curpsDuplicadas++;
      // Mejora de diagnóstico: conflicto académico si el contexto difiere.
      if (
        !previo.conflicto &&
        (previo.gradoNorm !== ctx.gradoNorm ||
          previo.grupoNorm !== ctx.grupoNorm ||
          previo.carreraNorm !== ctx.carreraNorm)
      ) {
        previo.conflicto = true;
      }
      continue;
    }
    porCurp.set(curp, ctx);
  }

  return {
    mapeo: mapeoFinal,
    totalFilas: filasDatos.length,
    filasSinCurp,
    curpsDuplicadas,
    porCurp,
  };
}

/**
 * Índice de grupos activos por identidad normalizada G2.
 *
 * F3: si `periodoId` está presente el destino se resuelve EXCLUSIVAMENTE por
 * `grupos.periodo_id = periodoId AND grupos.activo = true` (no depende de
 * `periodoNombre` ni de que el período sea OPERATIVO; BORRADOR también carga).
 * Sin `periodoId` se mantiene la semántica legacy (período por nombre y solo
 * si es el ciclo operativo).
 */
async function cargarIndiceGrupos(
  supabase: SupabaseClient,
  periodoNombre: string,
  periodoId?: string,
): Promise<Map<string, GrupoRow[]> | null> {
  const pid = periodoId?.trim() || "";
  if (!pid) {
    const con = await supabase
      .from(TABLA_PERIODOS)
      .select("id, activo, estado")
      .eq("nombre", periodoNombre.trim())
      .maybeSingle();
    const sinEsquema =
      Boolean(con.error) && /42703|does not exist/i.test(String(con.error?.message ?? ""));
    const { data: periodo } = sinEsquema
      ? await supabase
          .from(TABLA_PERIODOS)
          .select("id, activo")
          .eq("nombre", periodoNombre.trim())
          .maybeSingle()
      : con;
    if (!periodo) return null;
    const esOperativo = sinEsquema
      ? Boolean((periodo as { activo: boolean }).activo)
      : String((periodo as { estado?: string | null }).estado ?? "").toLowerCase() === "operativo";
    if (!esOperativo) return null;
    return construirIndiceGrupos(supabase, String((periodo as { id: string }).id));
  }
  return construirIndiceGrupos(supabase, pid);
}

/** Grupos activos de un período (por id) indexados por clave normalizada G2. */
async function construirIndiceGrupos(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<Map<string, GrupoRow[]> | null> {
  const { data: grupos } = await supabase
    .from(TABLA_GRUPOS)
    .select("*")
    .eq("periodo_id", periodoId)
    .eq("activo", true);
  const filasGrupos = (grupos ?? []) as GrupoRow[];

  const carreraIds = [
    ...new Set(filasGrupos.map((g) => g.carrera_id).filter((x): x is string => Boolean(x))),
  ];
  const claveCarreraPorId = new Map<string, string>();
  if (carreraIds.length) {
    const { data: carreras } = await supabase
      .from(TABLA_CARRERAS)
      .select("*")
      .in("id", carreraIds);
    for (const c of (carreras ?? []) as CarreraRow[]) {
      claveCarreraPorId.set(c.id, normalizarCarreraCatalogo(c.clave));
    }
  }

  const indice = new Map<string, GrupoRow[]>();
  for (const g of filasGrupos) {
    const key = `${normalizarGradoCatalogo(g.grado)}|${normalizarGrupoCatalogo(g.nombre)}|${
      g.carrera_id ? (claveCarreraPorId.get(g.carrera_id) ?? "") : ""
    }`;
    const arr = indice.get(key) ?? [];
    arr.push(g);
    indice.set(key, arr);
  }
  return indice;
}

/**
 * F3 — Inscripción relevante de un alumno DENTRO de un período concreto
 * (no global). Consulta únicamente filas cuyo grupo pertenezca a
 * `grupos.periodo_id = periodoId`. Prefiere la fila `activo=true`; en un
 * BORRADOR (todas inactivas) devuelve la más reciente. Devuelve null si el
 * alumno no tiene ninguna fila en ese período.
 *
 * NUNCA se usa para la ruta legacy: `obtenerInscripcionActiva(curp)` (global)
 * sigue intacta y es la que consumen los flujos sin `periodoId`.
 */
export async function obtenerInscripcionActivaEnPeriodo(
  supabase: SupabaseClient,
  curp: string,
  periodoId: string,
): Promise<InscripcionRow | null> {
  const c = (curp ?? "").trim().toUpperCase();
  const pid = (periodoId ?? "").trim();
  if (!c || !pid) return null;

  const { data: grupos, error: eG } = await supabase
    .from(TABLA_GRUPOS)
    .select("id")
    .eq("periodo_id", pid)
    .eq("activo", true);
  if (eG) return null;
  const grupoIds = ((grupos ?? []) as Array<{ id: string }>).map((g) => g.id);
  if (grupoIds.length === 0) return null;

  const { data, error } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("*")
    .eq("curp", c)
    .in("grupo_id", grupoIds)
    .order("created_at", { ascending: false });
  if (error || !data?.length) return null;
  const filas = data as InscripcionRow[];
  return filas.find((f) => f.activo) ?? filas[0]!;
}

/**
 * F3 — Valida el período destino de una carga dirigida (`periodoId` presente).
 * Estados permitidos: BORRADOR u OPERATIVO. Rechaza HISTORICO e inexistente.
 * Reutiliza los helpers existentes (`consultarPeriodo`, `resolverEstadoPeriodo`)
 * y NO depende de `obtenerCicloOperativoGlobal()`.
 */
export async function validarPeriodoDestinoCarga(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<{ ok: true; periodo: FilaPeriodoEstado; esquema: boolean } | { ok: false; error: string }> {
  const pid = (periodoId ?? "").trim();
  if (!pid) return { ok: false, error: "Indica el periodoId destino." };
  const r = await consultarPeriodo(supabase, pid);
  if (r.error) return { ok: false, error: r.error };
  if (!r.periodo) {
    return { ok: false, error: "El periodo destino no existe (periodo_inexistente)." };
  }
  if (r.esquema && resolverEstadoPeriodo(r.periodo) === ESTADO_HISTORICO) {
    return { ok: false, error: "No se puede cargar alumnos sobre un periodo HISTORICO." };
  }
  return { ok: true, periodo: r.periodo, esquema: r.esquema };
}

/**
 * Contexto académico final de una fila: los valores del Excel tienen prioridad;
 * el contexto seleccionado completa únicamente lo que falte. Devuelve null si
 * no hay grado+grupo suficientes (SIN_DATOS_ACADEMICOS).
 */
function contextoFinal(
  fila: FilaContexto,
  contexto: ContextoAcademico | undefined,
): {
  gradoNorm: string;
  grupoNorm: string;
  carreraNorm: string;
  gradoOriginal: string;
  grupoOriginal: string;
  carreraOriginal: string;
} | null {
  const grado = fila.gradoOriginal || contexto?.grado || "";
  const grupo = fila.grupoOriginal || contexto?.grupo || "";
  if (!grado || !grupo) return null;
  const carrera = fila.carreraOriginal || contexto?.carrera || "";
  return {
    gradoNorm: normalizarGradoCatalogo(grado),
    grupoNorm: normalizarGrupoCatalogo(grupo),
    carreraNorm: normalizarCarreraCatalogo(carrera),
    gradoOriginal: grado,
    grupoOriginal: grupo,
    carreraOriginal: carrera,
  };
}

/* ---------------------------------------------------------------------------
 * PREVIEW (SIN escritura)
 * ------------------------------------------------------------------------- */

/**
 * C3.1 — Preview completa de la carga (ALUMNOS + ACADÉMICO).
 * Solo SELECT; no escribe nada.
 */
export async function previsualizarCargaAcademica(
  supabase: SupabaseClient,
  file: File,
  opts?: OpcionesCargaAcademica,
): Promise<PreviewCargaAcademica> {
  try {
    const analisis = await analizarRoster(supabase, file, opts?.mapeo);
    if (!analisis.ok) {
      return { ok: false, error: analisis.error, mapeo: crearMapeoRoster(opts?.mapeo ?? {}), periodoUtilizado: null, alumnos: vacioAlumnos(), academico: vacioAcademico(), bloqueaEscritura: false, detalle: [] };
    }
    const plan = analisis.plan;

    const parseo = await leerFilasConContexto(file, opts?.mapeo);

    const curpsNuevas = new Set(plan.aInsertar.map((r) => String(r.CURP ?? "")));
    const alumnosExistentes =
      plan.aActualizar.length + plan.yaExistentesSinCambios;

    const contexto = opts?.contexto;
    const periodoUtilizado = contexto?.periodoNombre?.trim() || null;
    const pidDestino = contexto?.periodoId?.trim() || "";
    let indice: Map<string, GrupoRow[]> | null = null;
    let periodoMostrado: string | null = periodoUtilizado;
    if (pidDestino) {
      // F3 — destino por `periodos.id`; BORRADOR/OPERATIVO permitidos.
      const val = await validarPeriodoDestinoCarga(supabase, pidDestino);
      if (!val.ok) {
        return {
          ok: false,
          error: val.error,
          mapeo: parseo.mapeo,
          periodoUtilizado: null,
          alumnos: vacioAlumnos(),
          academico: vacioAcademico(),
          bloqueaEscritura: false,
          detalle: [],
        };
      }
      periodoMostrado = val.periodo.nombre || pidDestino;
      indice = await cargarIndiceGrupos(supabase, "", pidDestino);
    } else {
      // Ruta legacy (sin periodoId): destino por nombre del ciclo operativo.
      indice = periodoUtilizado
        ? await cargarIndiceGrupos(supabase, periodoUtilizado)
        : null;
    }

    const academico: ResumenAcademico = vacioAcademico();
    const detalle: DetalleCargaAcademica[] = [];

    for (const fila of parseo.porCurp.values()) {
      // Valores reportados cuando NO hay contexto final (archivo sin G/G/C y
      // sin contexto útil): reflejan lo que trae el archivo.
      const baseFila = {
        curp: fila.curp,
        gradoOriginal: fila.gradoOriginal,
        grupoOriginal: fila.grupoOriginal,
        carreraOriginal: fila.carreraOriginal,
        gradoNormalizado: fila.gradoNorm,
        grupoNormalizado: fila.grupoNorm,
        carreraNormalizada: fila.carreraNorm,
        esAlumnoNuevo: curpsNuevas.has(fila.curp),
      };

      if (fila.conflicto) {
        academico.conflictosAcademicos++;
        detalle.push({ ...baseFila, estado: "CURP_DUPLICADA_CONFLICTO_ACADEMICO" });
        continue;
      }

      const final = contextoFinal(fila, contexto);
      if (!final || !indice) {
        academico.sinDatosAcademicos++;
        detalle.push({ ...baseFila, estado: "SIN_DATOS_ACADEMICOS" });
        continue;
      }

      // B1 (C3.3): el detalle reporta el contexto académico FINAL realmente
      // usado para resolver (valores del Excel con precedencia; el contexto de
      // la UI completa únicamente lo que falte).
      const baseFinal = {
        ...baseFila,
        gradoOriginal: final.gradoOriginal,
        grupoOriginal: final.grupoOriginal,
        carreraOriginal: final.carreraOriginal,
        gradoNormalizado: final.gradoNorm,
        grupoNormalizado: final.grupoNorm,
        carreraNormalizada: final.carreraNorm,
      };

      const key = `${final.gradoNorm}|${final.grupoNorm}|${final.carreraNorm}`;
      const candidatos = indice.get(key) ?? [];

      if (candidatos.length === 0) {
        academico.gruposInexistentes++;
        detalle.push({ ...baseFinal, estado: "GRUPO_INEXISTENTE" });
        continue;
      }
      if (candidatos.length > 1) {
        academico.ambiguos++;
        detalle.push({
          ...baseFinal,
          estado: "AMBIGUO",
          candidatos: candidatos.map((c) => ({
            grupoId: c.id,
            grado: c.grado,
            grupo: c.nombre,
            carrera: c.carrera_id,
          })),
        });
        continue;
      }

      const grupoDestino = candidatos[0]!;
      // F3 — En la ruta con `periodoId` la clasificación se calcula SOLO dentro
      // del período destino (nunca con la inscripción activa global, que podría
      // pertenecer al OPERATIVO A y falsear un CAMBIO_DE_GRUPO).
      const inscripcionActiva: InscripcionRow | null = pidDestino
        ? await obtenerInscripcionActivaEnPeriodo(supabase, fila.curp, pidDestino)
        : await obtenerInscripcionActiva(supabase, fila.curp);

      if (!inscripcionActiva) {
        academico.nuevasInscripciones++;
        detalle.push({
          ...baseFinal,
          estado: "NUEVA_INSCRIPCION",
          grupoDestinoId: grupoDestino.id,
          grupoActualId: null,
        });
      } else if (inscripcionActiva.grupo_id === grupoDestino.id) {
        academico.sinCambio++;
        detalle.push({
          ...baseFinal,
          estado: "SIN_CAMBIO",
          grupoDestinoId: grupoDestino.id,
          grupoActualId: inscripcionActiva.grupo_id,
        });
      } else {
        academico.cambiosDeGrupo++;
        detalle.push({
          ...baseFinal,
          estado: "CAMBIO_DE_GRUPO",
          grupoDestinoId: grupoDestino.id,
          grupoActualId: inscripcionActiva.grupo_id,
        });
      }
    }

    // C4.24 — Enriquece el detalle con grupos LEGIBLES (el servidor resuelve;
    // el cliente solo presenta). Una sola consulta para todos los ids.
    const idsGrupos = [
      ...new Set(
        detalle.flatMap((d) =>
          [d.grupoDestinoId, d.grupoActualId].filter(
            (x): x is string => Boolean(x),
          ),
        ),
      ),
    ];
    const gruposPorId = new Map<string, GrupoRow>();
    if (idsGrupos.length) {
      const { data: filasGrupos } = await supabase
        .from(TABLA_GRUPOS)
        .select("*")
        .in("id", idsGrupos);
      for (const g of (filasGrupos ?? []) as GrupoRow[]) {
        gruposPorId.set(g.id, g);
      }
    }
    const carreraIds = [
      ...new Set(
        [...gruposPorId.values()]
          .map((g) => g.carrera_id)
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const claveCarreraPorId = new Map<string, string>();
    if (carreraIds.length) {
      const { data: carreras } = await supabase
        .from(TABLA_CARRERAS)
        .select("id, clave")
        .in("id", carreraIds);
      for (const c of (carreras ?? []) as Array<{ id: string; clave: string }>) {
        claveCarreraPorId.set(c.id, c.clave);
      }
    }
    const grupoLegible = (
      id?: string | null,
    ): GrupoDetalleCarga | null | undefined => {
      if (id === null) return null;
      if (id === undefined) return undefined;
      const g = gruposPorId.get(id);
      if (!g) return null;
      return {
        grado: g.grado,
        nombre: g.nombre,
        carrera: g.carrera_id
          ? (claveCarreraPorId.get(g.carrera_id) ?? null)
          : null,
      };
    };
    for (const d of detalle) {
      d.grupoActual = grupoLegible(d.grupoActualId);
      d.grupoDestino = grupoLegible(d.grupoDestinoId);
    }

    const alumnos: ResumenAlumnos = {
      totalFilas: parseo.totalFilas,
      curpsValidas: parseo.porCurp.size + parseo.curpsDuplicadas,
      curpsAusentes: parseo.filasSinCurp,
      curpsDuplicadas: parseo.curpsDuplicadas,
      alumnosNuevos: plan.aInsertar.length,
      alumnosExistentes,
      alumnosSinCambios: plan.yaExistentesSinCambios,
      camposCompletados: plan.aActualizar.length,
    };

    return {
      ok: true,
      mapeo: parseo.mapeo,
      periodoUtilizado: periodoMostrado,
      alumnos,
      academico,
      bloqueaEscritura:
        academico.ambiguos > 0 ||
        academico.gruposInexistentes > 0 ||
        academico.conflictosAcademicos > 0,
      detalle,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el archivo.";
    return {
      ok: false,
      error: msg,
      mapeo: crearMapeoRoster(opts?.mapeo ?? {}),
      periodoUtilizado: opts?.contexto?.periodoNombre?.trim() || null,
      alumnos: vacioAlumnos(),
      academico: vacioAcademico(),
      bloqueaEscritura: false,
      detalle: [],
    };
  }
}

function vacioAlumnos(): ResumenAlumnos {
  return {
    totalFilas: 0,
    curpsValidas: 0,
    curpsAusentes: 0,
    curpsDuplicadas: 0,
    alumnosNuevos: 0,
    alumnosExistentes: 0,
    alumnosSinCambios: 0,
    camposCompletados: 0,
  };
}

function vacioAcademico(): ResumenAcademico {
  return {
    sinDatosAcademicos: 0,
    nuevasInscripciones: 0,
    sinCambio: 0,
    cambiosDeGrupo: 0,
    gruposInexistentes: 0,
    ambiguos: 0,
    conflictosAcademicos: 0,
  };
}

/* ---------------------------------------------------------------------------
 * APLICACIÓN (solo tras confirmación explícita en la Server Action)
 * ------------------------------------------------------------------------- */

/**
 * C3.1 — Aplica la carga:
 *   FASE 1: ALUMNOS (motor existente, idempotente).
 *   FASE 2: INSCRIPCIONES (solo estados NUEVA_INSCRIPCION / CAMBIO_DE_GRUPO).
 * No escribe ETIQUETAS PERSONALES, PROFESORES, catálogo, tablas legacy ni RLS.
 * Si la preview detecta estados que bloquean (ambiguos, grupos inexistentes o
 * conflictos académicos), NO escribe NADA.
 */
export async function aplicarCargaAcademica(
  supabase: SupabaseClient,
  file: File,
  opts?: OpcionesCargaAcademica,
): Promise<ResultadoAplicarCarga> {
  const preview = await previsualizarCargaAcademica(supabase, file, opts);
  if (!preview.ok) {
    return {
      ok: false,
      error: preview.error ?? "No se pudo generar la preview.",
      alumnos: { agregados: 0, completados: 0, yaExistentesSinCambios: 0, omitidos: 0, duplicados: 0 },
      inscripciones: { nuevas: 0, cambiosDeGrupo: 0, errores: 0, erroresDetalle: [] },
    };
  }
  if (preview.bloqueaEscritura) {
    return {
      ok: false,
      error:
        "La carga contiene estados que bloquean la escritura (grupos ambiguos, " +
        "grupos inexistentes o conflictos académicos por CURP duplicada). " +
        "Corrige el archivo/contexto y reintenta. No se escribió nada.",
      alumnos: { agregados: 0, completados: 0, yaExistentesSinCambios: 0, omitidos: 0, duplicados: 0 },
      inscripciones: { nuevas: 0, cambiosDeGrupo: 0, errores: 0, erroresDetalle: [] },
    };
  }

  // FASE 1 — ALUMNOS (motor existente).
  const alumnos = await sincronizarAlumnosDesdeArchivo(
    supabase,
    file,
    preview.mapeo,
  );
  if (!alumnos.ok) {
    return {
      ok: false,
      error: `Fase ALUMNOS: ${alumnos.error}`,
      alumnos: { agregados: 0, completados: 0, yaExistentesSinCambios: 0, omitidos: 0, duplicados: 0 },
      inscripciones: { nuevas: 0, cambiosDeGrupo: 0, errores: 0, erroresDetalle: [] },
    };
  }

  // FASE 2 — INSCRIPCIONES (solo registros válidos de la preview).
  // F3: con `periodoId` presente la inscripción usa SIEMPRE
  // `inscribirAlumnoEnCiclo` (BORRADOR → activo=false, referencia cruzada de
  // grupo→periodo, período no preparable rechazado, alumno inexistente
  // rechazado, sin duplicación). La ruta legacy conserva `inscribirAlumno`
  // con `unaActiva` (semántica operativo global). NUNCA se usa `unaActiva`
  // en la ruta con `periodoId`.
  const pidDestino = opts?.contexto?.periodoId?.trim() || "";
  const rutaPeriodo = Boolean(pidDestino);
  let nuevas = 0;
  let cambiosDeGrupo = 0;
  let errores = 0;
  const erroresDetalle: string[] = [];
  for (const d of preview.detalle) {
    if (d.estado !== "NUEVA_INSCRIPCION" && d.estado !== "CAMBIO_DE_GRUPO") continue;
    if (!d.grupoDestinoId) continue;
    const r = rutaPeriodo
      ? await inscribirAlumnoEnCiclo(supabase, {
          curp: d.curp,
          grupoId: d.grupoDestinoId,
          periodoId: pidDestino,
        })
      : await inscribirAlumno(supabase, d.curp, d.grupoDestinoId, {
          unaActiva: d.estado === "CAMBIO_DE_GRUPO",
        });
    if (!r.ok) {
      errores++;
      erroresDetalle.push(`${d.curp}: ${r.error}`);
    } else if (d.estado === "CAMBIO_DE_GRUPO") {
      cambiosDeGrupo++;
    } else {
      nuevas++;
    }
  }

  return {
    ok: true,
    alumnos: {
      agregados: alumnos.agregados,
      completados: alumnos.completados,
      yaExistentesSinCambios: alumnos.yaExistentesSinCambios,
      omitidos: alumnos.omitidos,
      duplicados: alumnos.duplicados,
    },
    inscripciones: { nuevas, cambiosDeGrupo, errores, erroresDetalle },
  };
}



