import type { SupabaseClient } from "@supabase/supabase-js";
import { contarDiasClaseDePeriodo } from "./calendario";
import {
  TABLA_GRUPOS,
  TABLA_GRUPO_MATERIAS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_MATERIAS,
  TABLA_PERIODOS,
  TABLA_PERIODOS_EVALUACION,
} from "./tables";
import {
  ESTADO_BORRADOR,
  ESTADO_HISTORICO,
  ESTADO_OPERATIVO,
  planActivacionExclusiva,
  resolverEstadoPeriodo,
  validarIntegridadCiclo as validarIntegridadCicloPura,
  type AsuntoIntegridad,
  type CambioEstadoPeriodo,
  type EstadoCiclo,
  type FilaPeriodoEstado,
  type ResultadoIntegridad,
} from "./ciclo-estado-puro";

/**
 * F1 — ESTADO E INTEGRIDAD DEL CICLO (capa Supabase).
 *
 * Reglas:
 *   - crearCicloEscolar()/crearCicloBorrador() NUNCA activa: nace BORRADOR.
 *   - activar = validarIntegridadCiclo() + exclusividad (un solo operativo).
 *   - `estado` es conceptual; `activo` es compatibilidad (espejo temporal).
 *     Sin la columna `estado` (DDL pendiente) las operaciones funcionan con
 *     `activo` y reportan que el esquema de estados está pendiente.
 */

export const ERROR_ESQUEMA_ESTADO_PENDIENTE =
  "Esquema F1 pendiente: aplicar supabase/agregar-estado-ciclo.sql (columna periodos.estado) para distinguir borrador/historico.";

const ERROR_COLUMNA_ESTADO =
  /42703|does not exist|could not find the table|in the schema cache/i;

type ResultadoConDetalle =
  | { ok: true; mensaje: string; advertencias?: AsuntoIntegridad[] }
  | {
      ok: false;
      error: string;
      errores?: AsuntoIntegridad[];
      advertencias?: AsuntoIntegridad[];
    };

/** ¿La columna `periodos.estado` existe? (una consulta de 1 fila). */
export async function verificarEsquemaEstadoCiclo(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; esquema: boolean; error?: string }> {
  const { error } = await supabase.from(TABLA_PERIODOS).select("estado").limit(1);
  if (!error) return { ok: true, esquema: true };
  if (ERROR_COLUMNA_ESTADO.test(String(error.message ?? ""))) {
    return { ok: true, esquema: false };
  }
  return { ok: false, esquema: false, error: error.message };
}

const SELECT_PERIODO_CON_ESTADO =
  "id, nombre, activo, estado, fecha_inicio, fecha_fin";
const SELECT_PERIODO_SIN_ESTADO = "id, nombre, activo, fecha_inicio, fecha_fin";

/** Fila de `periodos` con detección de esquema (estado presente o no). */
export async function consultarPeriodo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<{ periodo: FilaPeriodoEstado | null; esquema: boolean; error?: string }> {
  const conEstado = await supabase
    .from(TABLA_PERIODOS)
    .select(SELECT_PERIODO_CON_ESTADO)
    .eq("id", periodoId)
    .maybeSingle();
  if (!conEstado.error) {
    return { periodo: (conEstado.data ?? null) as FilaPeriodoEstado | null, esquema: true };
  }
  if (!ERROR_COLUMNA_ESTADO.test(String(conEstado.error.message ?? ""))) {
    return { periodo: null, esquema: false, error: conEstado.error.message };
  }
  const sinEstado = await supabase
    .from(TABLA_PERIODOS)
    .select(SELECT_PERIODO_SIN_ESTADO)
    .eq("id", periodoId)
    .maybeSingle();
  if (sinEstado.error) {
    return { periodo: null, esquema: false, error: sinEstado.error.message };
  }
  return { periodo: (sinEstado.data ?? null) as FilaPeriodoEstado | null, esquema: false };
}

/** Todos los periodos (para planes de activación exclusiva). */
export async function listarPeriodos(
  supabase: SupabaseClient,
): Promise<{ filas: FilaPeriodoEstado[]; esquema: boolean; error?: string }> {
  const conEstado = await supabase
    .from(TABLA_PERIODOS)
    .select(SELECT_PERIODO_CON_ESTADO)
    .order("created_at", { ascending: true });
  if (!conEstado.error) {
    return { filas: (conEstado.data ?? []) as FilaPeriodoEstado[], esquema: true };
  }
  if (!ERROR_COLUMNA_ESTADO.test(String(conEstado.error.message ?? ""))) {
    return { filas: [], esquema: false, error: conEstado.error.message };
  }
  const sinEstado = await supabase
    .from(TABLA_PERIODOS)
    .select(SELECT_PERIODO_SIN_ESTADO)
    .order("created_at", { ascending: true });
  if (sinEstado.error) return { filas: [], esquema: false, error: sinEstado.error.message };
  return { filas: (sinEstado.data ?? []) as FilaPeriodoEstado[], esquema: false };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Crea un ciclo en estado BORRADOR. NUNCA activa. Nombre único (idempotente).
 * Con esquema F1 aplicado escribe { activo:false, estado:'borrador' };
 * sin esquema escribe { activo:false } (compatibilidad).
 */
export async function crearCicloBorrador(
  supabase: SupabaseClient,
  input: { nombre: string; fechaInicio?: string | null; fechaFin?: string | null },
): Promise<ResultadoConDetalle & { periodoId?: string | null }> {
  const nombre = (input.nombre ?? "").trim().toUpperCase();
  if (!nombre) return { ok: false, error: "Indica el nombre del ciclo (ej. 2027-2028)." };
  const inicio = input.fechaInicio?.trim() || null;
  const fin = input.fechaFin?.trim() || null;
  if (inicio && !ISO_RE.test(inicio)) return { ok: false, error: "Fecha de inicio inválida (YYYY-MM-DD)." };
  if (fin && !ISO_RE.test(fin)) return { ok: false, error: "Fecha de cierre inválida (YYYY-MM-DD)." };
  if (inicio && fin && inicio >= fin) {
    return { ok: false, error: "El inicio debe ser anterior al fin del ciclo." };
  }

  const { data: dup } = await supabase
    .from(TABLA_PERIODOS)
    .select("id")
    .eq("nombre", nombre)
    .limit(1)
    .maybeSingle();
  if (dup) return { ok: false, error: `El ciclo «${nombre}» ya existe.` };

  const esquema = await verificarEsquemaEstadoCiclo(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error ?? ERROR_ESQUEMA_ESTADO_PENDIENTE };

  const fila: Record<string, unknown> = { nombre, activo: false };
  if (inicio) fila.fecha_inicio = inicio;
  if (fin) fila.fecha_fin = fin;
  if (esquema.esquema) fila.estado = ESTADO_BORRADOR;

  const { data, error } = await supabase
    .from(TABLA_PERIODOS)
    .insert(fila)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const periodoId = data ? String(data.id) : null;
  const nota = esquema.esquema ? "" : ` ${ERROR_ESQUEMA_ESTADO_PENDIENTE}`;
  return {
    ok: true,
    periodoId,
    mensaje: `Ciclo «${nombre}» creado en estado BORRADOR (no operativo).${nota}`,
  };
}

/** Estado actual de un ciclo + compatibilidad con `activo`. */
export async function estadoActualCiclo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<{ ok: boolean; estado?: EstadoCiclo; activo?: boolean; esquema?: boolean; error?: string }> {
  const r = await consultarPeriodo(supabase, periodoId);
  if (r.error) return { ok: false, error: r.error };
  if (!r.periodo) return { ok: false, error: "El ciclo no existe." };
  return {
    ok: true,
    estado: resolverEstadoPeriodo(r.periodo),
    activo: Boolean(r.periodo.activo),
    esquema: r.esquema,
  };
}

/** ¿Se permite configurar sobre este ciclo? (borrador/operativo SÍ; histórico NO). */
export async function configuracionPermitidaEnPeriodo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<{ ok: boolean; error?: string; periodo?: FilaPeriodoEstado; esquema?: boolean }> {
  const r = await consultarPeriodo(supabase, periodoId);
  if (r.error) return { ok: false, error: r.error };
  if (!r.periodo) return { ok: false, error: "El ciclo no existe o está inactivo." };
  if (r.esquema && resolverEstadoPeriodo(r.periodo) === ESTADO_HISTORICO) {
    return { ok: false, error: "No se puede configurar un ciclo histórico." };
  }
  return { ok: true, periodo: r.periodo, esquema: r.esquema };
}

export type ConteosCiclo = {
  grupos: number;
  gruposActivos: number;
  materiasActivas: number;
  inscripcionesActivas: number;
  parciales: number;
  diasClase: number;
};

/** Valida la integridad de un ciclo con datos reales (envuelve al dominio puro). */
export async function validarIntegridadCiclo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<
  ResultadoIntegridad & {
    periodo?: FilaPeriodoEstado | null;
    esquema?: boolean;
    conteos?: ConteosCiclo;
  }
> {
  const rp = await consultarPeriodo(supabase, periodoId);
  if (rp.error) {
    return { ok: false, errores: [{ codigo: "error_lectura", mensaje: rp.error }], advertencias: [] };
  }
  const periodo = rp.periodo;
  const base = { periodo, esquema: rp.esquema };
  if (!periodo) {
    const r = validarIntegridadCicloPura({
      periodo: null,
      grupos: [],
      grupoMaterias: [],
      materiasActivas: new Set(),
      inscripciones: [],
      parciales: [],
      diasClase: 0,
    });
    return {
      ...r,
      ...base,
      conteos: { grupos: 0, gruposActivos: 0, materiasActivas: 0, inscripcionesActivas: 0, parciales: 0, diasClase: 0 },
    };
  }

  const [{ data: grupos, error: eG }, { data: parciales, error: eP }] = await Promise.all([
    supabase.from(TABLA_GRUPOS).select("id, grado, nombre, carrera_id, activo").eq("periodo_id", periodoId),
    supabase.from(TABLA_PERIODOS_EVALUACION).select("id, numero, nombre, fecha_inicio, fecha_fin, activo").eq("periodo_id", periodoId),
  ]);
  if (eG || eP) {
    return { ok: false, ...base, errores: [{ codigo: "error_lectura", mensaje: eG?.message ?? eP?.message ?? "Error de lectura." }], advertencias: [] };
  }

  const filasGrupos = (grupos ?? []) as Array<{ id: string; grado: string; nombre: string; carrera_id: string | null; activo: boolean }>;
  const grupoIds = filasGrupos.map((g) => g.id);

  const [{ data: inscripciones, error: eI }, { data: gms, error: eGM }] = await Promise.all([
    grupoIds.length
      ? supabase.from(TABLA_INSCRIPCIONES_ALUMNO).select("curp, grupo_id, activo").in("grupo_id", grupoIds)
      : Promise.resolve({ data: [], error: null }),
    grupoIds.length
      ? supabase.from(TABLA_GRUPO_MATERIAS).select("grupo_id, materia_id, activo").in("grupo_id", grupoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eI || eGM) {
    return { ok: false, ...base, errores: [{ codigo: "error_lectura", mensaje: eI?.message ?? eGM?.message ?? "Error de lectura." }], advertencias: [] };
  }

  const filasGm = (gms ?? []) as Array<{ grupo_id: string; materia_id: string; activo: boolean }>;
  const materiaIds = [...new Set(filasGm.map((gm) => gm.materia_id))];
  let materiasActivas = new Set<string>();
  if (materiaIds.length > 0) {
    const { data: materias, error: eM } = await supabase
      .from(TABLA_MATERIAS)
      .select("id, activo")
      .in("id", materiaIds);
    if (eM) {
      return { ok: false, ...base, errores: [{ codigo: "error_lectura", mensaje: eM.message }], advertencias: [] };
    }
    materiasActivas = new Set(
      ((materias ?? []) as Array<{ id: string; activo: boolean }>)
        .filter((m) => m.activo)
        .map((m) => m.id),
    );
  }

  const filasInscripciones = (inscripciones ?? []) as Array<{ curp: string; grupo_id: string; activo: boolean }>;
  // F5 — días de clase por PERIODO (columna periodo_id si existe; fallback texto).
  const diasClase = await contarDiasClaseDePeriodo(supabase, periodo);
  const filasParciales = (parciales ?? []) as Array<{
    id: string; numero: number; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean;
  }>;

  const resultado = validarIntegridadCicloPura({
    periodo,
    grupos: filasGrupos,
    grupoMaterias: filasGm,
    materiasActivas,
    inscripciones: filasInscripciones,
    parciales: filasParciales,
    diasClase,
  });
  return {
    ...resultado,
    ...base,
    conteos: {
      grupos: filasGrupos.length,
      gruposActivos: filasGrupos.filter((g) => g.activo).length,
      materiasActivas: materiasActivas.size,
      inscripcionesActivas: new Set(filasInscripciones.map((i) => i.curp)).size,
      parciales: filasParciales.length,
      diasClase,
    },
  };
}

/**
 * Resumen para el panel administrativo F2: estado + conteos + integridad.
 * Reutiliza `validarIntegridadCiclo` (una sola carga de datos). No duplica
 * reglas de validación en la UI.
 */
export async function resumenCicloParaAdmin(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<
  | {
      ok: true;
      estado: EstadoCiclo;
      esquema: boolean;
      periodo: FilaPeriodoEstado;
      conteos: ConteosCiclo;
      validacion: ResultadoIntegridad;
    }
  | { ok: false; error: string }
> {
  const rp = await consultarPeriodo(supabase, periodoId);
  if (rp.error) return { ok: false, error: rp.error };
  if (!rp.periodo) return { ok: false, error: "El ciclo no existe." };
  const val = await validarIntegridadCiclo(supabase, periodoId);
  const conteosVacio: ConteosCiclo = { grupos: 0, gruposActivos: 0, materiasActivas: 0, inscripcionesActivas: 0, parciales: 0, diasClase: 0 };
  return {
    ok: true,
    estado: resolverEstadoPeriodo(rp.periodo),
    esquema: rp.esquema,
    periodo: rp.periodo,
    conteos: val.conteos ?? conteosVacio,
    validacion: { ok: val.ok, errores: val.errores, advertencias: val.advertencias },
  };
}

/** Aplica una transición de estado a una fila (activo + estado sincronizados). */
async function aplicarEstado(
  supabase: SupabaseClient,
  cambio: CambioEstadoPeriodo,
  esquema: boolean,
): Promise<string | null> {
  if (esquema) {
    const { error } = await supabase
      .from(TABLA_PERIODOS)
      .update({ activo: cambio.activo, estado: cambio.estado })
      .eq("id", cambio.id);
    return error?.message ?? null;
  }
  const { error } = await supabase
    .from(TABLA_PERIODOS)
    .update({ activo: cambio.activo })
    .eq("id", cambio.id);
  return error?.message ?? null;
}

/**
 * F3 — Al activar un ciclo OPERATIVO, las inscripciones deben apuntar al ciclo
 * que quedó operativo:
 *   - dentro del ciclo objetivo se activa SOLO la fila más reciente por CURP
 *     (permite haber preparado/ajustado grupos en BORRADOR sin duplicar);
 *   - las filas de otros ciclos (ahora inactivos) pasan a activo=false.
 * No crea ni mueve filas: solo sincroniza el flag legacy `activo`.
 */
async function sincronizarInscripcionesOperativo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<string | null> {
  type FilaInsc = { id: string; curp: string; grupo_id: string; activo: boolean; created_at?: string | null };
  const porId = (v: unknown) => String(v);

  const { data: gruposObj, error: eG } = await supabase
    .from(TABLA_GRUPOS)
    .select("id")
    .eq("periodo_id", periodoId);
  if (eG) return eG.message;
  const grupoIds = ((gruposObj ?? []) as Array<{ id: string }>).map((g) => porId(g.id));
  if (grupoIds.length === 0) return null;

  const { data: filasObj, error: eI } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("id, curp, grupo_id, activo, created_at")
    .in("grupo_id", grupoIds);
  if (eI) return eI.message;
  const filas = (filasObj ?? []) as FilaInsc[];

  const porCurp = new Map<string, FilaInsc[]>();
  for (const f of filas) {
    const lista = porCurp.get(f.curp) ?? [];
    lista.push(f);
    porCurp.set(f.curp, lista);
  }
  const activarIds: string[] = [];
  const desactivarIds: string[] = [];
  for (const lista of porCurp.values()) {
    const ordenadas = [...lista].sort((a, b) => {
      const ca = String(a.created_at ?? "");
      const cb = String(b.created_at ?? "");
      if (ca !== cb) return ca < cb ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
    const elegida = ordenadas[0];
    for (const f of lista) {
      if (f.id === elegida?.id) {
        if (!f.activo) activarIds.push(porId(f.id));
      } else if (f.activo) {
        desactivarIds.push(porId(f.id));
      }
    }
  }

  // Filas activas de OTROS ciclos pasan a inactivas (ya no hay otro operativo).
  const { data: otrosObj, error: eO } = await supabase
    .from(TABLA_GRUPOS)
    .select("id")
    .neq("periodo_id", periodoId);
  if (!eO && (otrosObj ?? []).length > 0) {
    const otrosIds = ((otrosObj ?? []) as Array<{ id: string }>).map((g) => porId(g.id));
    const { data: activasOtros, error: eAO } = await supabase
      .from(TABLA_INSCRIPCIONES_ALUMNO)
      .select("id")
      .in("grupo_id", otrosIds)
      .eq("activo", true);
    if (eAO) return eAO.message;
    for (const r of (activasOtros ?? []) as Array<{ id: string }>) desactivarIds.push(porId(r.id));
  }

  const aplicar = async (ids: string[], activo: boolean): Promise<string | null> => {
    if (ids.length === 0) return null;
    const { error } = await supabase
      .from(TABLA_INSCRIPCIONES_ALUMNO)
      .update({ activo })
      .in("id", ids);
    return error?.message ?? null;
  };
  const err1 = await aplicar(desactivarIds, false);
  if (err1) return err1;
  return aplicar(activarIds, true);
}

/**
 * Activa un ciclo como OPERATIVO ÚNICO.
 * 1) valida integridad; 2) calcula el plan exclusivo; 3) desactiva el resto;
 * 4) activa el objetivo. Nunca deja dos operativos.
 */
export async function activarCicloOperativo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<ResultadoConDetalle> {
  const rp = await consultarPeriodo(supabase, periodoId);
  if (rp.error) return { ok: false, error: rp.error };
  if (!rp.periodo) return { ok: false, error: "El ciclo a activar no existe." };

  // F4 — solo un BORRADOR (o, sin esquema F1, un ciclo inactivo legacy) puede
  // activarse. Un HISTORICO jamás se reactiva.
  if (rp.esquema) {
    const estadoPrevio = resolverEstadoPeriodo(rp.periodo);
    if (estadoPrevio === ESTADO_HISTORICO) {
      return { ok: false, error: `El ciclo «${rp.periodo.nombre}» es HISTORICO y no puede reactivarse.` };
    }
    if (estadoPrevio === ESTADO_OPERATIVO && rp.periodo.activo) {
      const ya = await listarPeriodos(supabase);
      if (!ya.error && ya.filas.filter((f) => f.activo).length === 1) {
        return { ok: true, mensaje: `El ciclo «${rp.periodo.nombre}» ya es el único OPERATIVO.` };
      }
    }
  }

  const validacion = await validarIntegridadCiclo(supabase, periodoId);
  if (!validacion.ok) {
    const detalle = validacion.errores.map((e) => `· ${e.mensaje}`).join("\n");
    return {
      ok: false,
      error: `El ciclo «${rp.periodo.nombre}» no cumple la integridad mínima:\n${detalle}`,
      errores: validacion.errores,
      advertencias: validacion.advertencias,
    };
  }

  const lista = await listarPeriodos(supabase);
  if (lista.error) return { ok: false, error: lista.error };
  const plan = planActivacionExclusiva(lista.filas, periodoId);
  if (!plan.ok) return { ok: false, error: plan.error ?? "No se pudo activar el ciclo." };

  if (plan.cambios.length === 0) {
    return { ok: true, mensaje: `El ciclo «${rp.periodo.nombre}» ya es el único OPERATIVO.` };
  }

  // Primero apagar el resto; al final activar el objetivo (evita dos operativos).
  const apagar = plan.cambios.filter((c) => c.id !== periodoId);
  const encender = plan.cambios.find((c) => c.id === periodoId);
  for (const cambio of apagar) {
    const error = await aplicarEstado(supabase, cambio, rp.esquema);
    if (error) return { ok: false, error: `No se pudo desactivar el ciclo anterior: ${error}` };
  }
  if (encender) {
    const error = await aplicarEstado(supabase, encender, rp.esquema);
    if (error) return { ok: false, error: `No se pudo activar el ciclo: ${error}` };
  }

  // F3 — sincroniza inscripciones al ciclo que quedó operativo (idempotente).
  const errorSync = await sincronizarInscripcionesOperativo(supabase, periodoId);
  if (errorSync) {
    return {
      ok: false,
      error: `El ciclo quedó OPERATIVO pero no se pudieron sincronizar las inscripciones: ${errorSync}. Reintenta la activación (es idempotente).`,
    };
  }

  const nota = rp.esquema ? "" : ` ${ERROR_ESQUEMA_ESTADO_PENDIENTE}`;
  return {
    ok: true,
    mensaje: `Ciclo «${rp.periodo.nombre}» activado como OPERATIVO (exclusivo). El/los ciclo(s) anterior(es) pasaron a HISTORICO.${nota}`,
    advertencias: validacion.advertencias,
  };
}

/** Desactiva un ciclo OPERATIVO → HISTORICO (o deja inactivo el que ya lo está). */
export async function marcarCicloNoOperativo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<ResultadoConDetalle> {
  const rp = await consultarPeriodo(supabase, periodoId);
  if (rp.error) return { ok: false, error: rp.error };
  if (!rp.periodo) return { ok: false, error: "El ciclo no existe." };
  if (!rp.periodo.activo && (!rp.esquema || resolverEstadoPeriodo(rp.periodo) === ESTADO_HISTORICO)) {
    return { ok: true, mensaje: `El ciclo «${rp.periodo.nombre}» ya no está operativo.` };
  }
  const error = await aplicarEstado(
    supabase,
    { id: periodoId, activo: false, estado: ESTADO_HISTORICO },
    rp.esquema,
  );
  if (error) return { ok: false, error };
  return { ok: true, mensaje: `Ciclo «${rp.periodo.nombre}» desactivado (HISTORICO).` };
}

export { ESTADO_BORRADOR, ESTADO_OPERATIVO, ESTADO_HISTORICO };
export {
  resolverEstadoPeriodo,
  estadoDesdeActivo,
  esEstadoCiclo,
  validarIntegridadCiclo as validarIntegridadCicloPura,
} from "./ciclo-estado-puro";
export type {
  EstadoCiclo,
  FilaPeriodoEstado,
  AsuntoIntegridad,
  ResultadoIntegridad,
  DatosValidacionCiclo,
} from "./ciclo-estado-puro";



