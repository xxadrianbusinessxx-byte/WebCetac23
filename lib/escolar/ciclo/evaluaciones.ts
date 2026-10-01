import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activarCicloOperativoAtomico,
  configuracionPermitidaEnPeriodo,
  crearCicloBorrador,
  marcarCicloNoOperativo,
  obtenerCicloOperativoGlobal,
  validarIntegridadCiclo,
} from "./ciclo-estado.ts";
import {
  TABLA_PERIODOS,
  TABLA_PERIODOS_EVALUACION,
} from "../tables.ts";

// Re-export del módulo puro (PROMPT Q · R-1). Se importan aparte los que este
// archivo sigue usando en el repositorio/acciones.
import {
  evaluacionesEnConflicto,
  normalizarFechaEvaluacion,
  ordenarEvaluacionesPorNumero,
  resolverCicloEvaluacionLocal,
  resolverEvaluacionPorFechaLocal,
  validarInputEvaluacion,
} from "./evaluaciones-puro.ts";
import type {
  FechaCicloEvaluacion,
  InputEvaluacion,
  PeriodoEscolarRow,
  PeriodoEvaluacionRow,
} from "./evaluaciones-puro.ts";
export {
  cicloContieneFecha,
  esFechaISO,
  evaluacionContieneFecha,
  evaluacionesEnConflicto,
  normalizarFechaEvaluacion,
  ordenarEvaluacionesPorNumero,
  rangosSeSolapan,
  resolverCicloEvaluacionLocal,
  resolverEvaluacionPorFechaLocal,
  validarInputEvaluacion,
} from "./evaluaciones-puro.ts";
export type {
  FechaCicloEvaluacion,
  InputEvaluacion,
  PeriodoEscolarRow,
  PeriodoEvaluacionRow,
  ResultadoValidacionEvaluacion,
} from "./evaluaciones-puro.ts";

/**
 * FASE CICLO — PERIODOS DE EVALUACIÓN (parciales) POR CICLO ESCOLAR.
 *
 * Modelo:
 *   periodos (ciclo escolar)
 *     ├── fecha_inicio / fecha_fin  (aditivo, OPCIONAL: rango del ciclo)
 *     └── periodos_evaluacion       (parciales: numero, nombre, fechas)
 *
 * Resolución centralizada de fecha (evita lógica duplicada en cada módulo):
 *
 *   fecha
 *     ↓
 *   ciclo (periodos)            ← fechas del ciclo o parcial que la contiene
 *     ↓
 *   periodo de evaluación/parcial
 *
 * Reglas:
 *   - El parcial pertenece inequívocamente a un ciclo (periodo_id FK).
 *   - Nunca se duplica el nombre del ciclo ni se usan strings compuestos
 *     ("2026-2027 - Parcial 1") como identidad: identidad por IDs.
 *   - `horario_semanal` NO conoce parciales: sigue versionado por periodo_id.
 *   - Históricos: nunca DELETE; desactivar = activo=false.
 *   - Este módulo no importa tablas de catálogo de negocio: solo constantes de
 *     tabla y tipos, para poder ejecutar sus funciones PURAS sin Supabase.
 */

export const ERROR_ESQUEMA_EVALUACIONES_PENDIENTE =
  "Esquema FASE CICLO pendiente: aplicar supabase/crear-periodos-evaluacion.sql antes de administrar evaluaciones.";



/* ---------------------------------------------------------------------------
 * REPOSITORIO (Supabase)
 * ------------------------------------------------------------------------- */

export type ResultadoAccion =
  | { ok: true; mensaje?: string }
  | { ok: false; error: string };

/** Verifica que el esquema FASE CICLO exista (DDL aplicado). */
export async function verificarEsquemaEvaluaciones(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from(TABLA_PERIODOS_EVALUACION)
    .select("id")
    .limit(1);
  if (!error) return { ok: true };
  const mensaje = String(error.message ?? "");
  if (
    /does not exist/i.test(mensaje) ||
    /could not find the table/i.test(mensaje) ||
    /in the schema cache/i.test(mensaje)
  ) {
    return { ok: false, error: ERROR_ESQUEMA_EVALUACIONES_PENDIENTE };
  }
  return { ok: false, error: mensaje };
}

/** Parciales de un ciclo (todos, activos e inactivos) ordenados por número. */
export async function listarEvaluacionesDePeriodo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<
  | { ok: true; evaluaciones: PeriodoEvaluacionRow[] }
  | { ok: false; error: string }
> {
  const esquema = await verificarEsquemaEvaluaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error ?? "Esquema pendiente." };
  const { data, error } = await supabase
    .from(TABLA_PERIODOS_EVALUACION)
    .select("*")
    .eq("periodo_id", periodoId)
    .order("numero", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    evaluaciones: (data ?? []) as PeriodoEvaluacionRow[],
  };
}

/** Ciclos con sus parciales (2 consultas; sin N+1 por ciclo). */
export async function listarCiclosConEvaluaciones(
  supabase: SupabaseClient,
): Promise<
  | {
      ok: true;
      ciclos: Array<{
        periodo: PeriodoEscolarRow;
        evaluaciones: PeriodoEvaluacionRow[];
      }>;
    }
  | { ok: false; error: string }
> {
  const esquema = await verificarEsquemaEvaluaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error ?? "Esquema pendiente." };

  const { data: periodos, error: eP } = await supabase
    .from(TABLA_PERIODOS)
    .select("id, nombre, activo, fecha_inicio, fecha_fin, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (eP || !periodos) return { ok: false, error: eP?.message ?? "Sin ciclos." };

  const { data: evaluaciones, error: eE } = await supabase
    .from(TABLA_PERIODOS_EVALUACION)
    .select("*");
  if (eE) return { ok: false, error: eE.message };

  const porPeriodo = new Map<string, PeriodoEvaluacionRow[]>();
  for (const ev of (evaluaciones ?? []) as PeriodoEvaluacionRow[]) {
    const lista = porPeriodo.get(ev.periodo_id) ?? [];
    lista.push(ev);
    porPeriodo.set(ev.periodo_id, lista);
  }
  return {
    ok: true,
    ciclos: (periodos as PeriodoEscolarRow[]).map((p) => ({
      periodo: p,
      evaluaciones: ordenarEvaluacionesPorNumero(porPeriodo.get(p.id) ?? []),
    })),
  };
}

/**
 * F1 — Crea un ciclo en estado BORRADOR. NUNCA activa. Nombre único.
 * Delega en `crearCicloBorrador` (lib/escolar/ciclo-estado.ts).
 */
export async function crearCicloEscolar(
  supabase: SupabaseClient,
  input: { nombre: string; fechaInicio?: string; fechaFin?: string },
): Promise<ResultadoAccion> {
  const r = await crearCicloBorrador(supabase, input);
  if (!r.ok) {
    return { ok: false, error: ("error" in r && r.error) || "No se pudo crear el ciclo." };
  }
  return { ok: true, mensaje: "mensaje" in r ? r.mensaje : undefined };
}

/** Actualiza rango de fechas del ciclo (aditivo; null limpia el rango). */
export async function actualizarRangoCiclo(
  supabase: SupabaseClient,
  periodoId: string,
  input: { fechaInicio: string | null; fechaFin: string | null },
): Promise<ResultadoAccion> {
  const fechaInicio = input.fechaInicio
    ? normalizarFechaEvaluacion(input.fechaInicio)
    : null;
  const fechaFin = input.fechaFin ? normalizarFechaEvaluacion(input.fechaFin) : null;
  if (input.fechaInicio && !fechaInicio) {
    return { ok: false, error: "Fecha de inicio inválida." };
  }
  if (input.fechaFin && !fechaFin) {
    return { ok: false, error: "Fecha de cierre inválida." };
  }
  if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
    return { ok: false, error: "El cierre no puede ser anterior al inicio." };
  }
  const { error } = await supabase
    .from(TABLA_PERIODOS)
    .update({ fecha_inicio: fechaInicio, fecha_fin: fechaFin })
    .eq("id", periodoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, mensaje: "Rango del ciclo actualizado." };
}

/**
 * F1 — Activa/desactiva un ciclo con reglas de dominio (nunca DELETE).
 *
 * - `activo=true`  → `activarCicloOperativo`: valida integridad, garantiza
 *   exclusividad (un solo OPERATIVO) y pasa el ciclo anterior a HISTORICO.
 * - `activo=false` → `marcarCicloNoOperativo`: OPERATIVO → HISTORICO.
 *
 * Un ciclo vacío/incompleto NO puede activarse.
 */
export async function setActivoCiclo(
  supabase: SupabaseClient,
  periodoId: string,
  activo: boolean,
): Promise<ResultadoAccion> {
  if (activo) {
    // F7 — validación amigable previa (contrato único del servidor). La UI la
    // muestra vía actionDetalleCicloAdmin; aquí se re-ejecuta antes de la RPC.
    const previa = await validarIntegridadCiclo(supabase, periodoId);
    if (!previa.ok) {
      const detalle = (previa.errores ?? [])
        .map((e) => `· ${e.mensaje}`)
        .join("\n");
      return {
        ok: false,
        error: `El ciclo no supera la validación integral:\n${detalle}`,
      };
    }
    // F8 — autoridad única: RPC transaccional. Sin secuencia multi-paso aquí.
    const r = await activarCicloOperativoAtomico(supabase, periodoId);
    if (!r.ok) {
      return { ok: false, error: r.error ?? "No se pudo activar el ciclo." };
    }
    return { ok: true, mensaje: r.mensaje };
  }
  const r = await marcarCicloNoOperativo(supabase, periodoId);
  if (!r.ok) {
    return { ok: false, error: ("error" in r && r.error) || "No se pudo desactivar el ciclo." };
  }
  return { ok: true, mensaje: "mensaje" in r ? r.mensaje : undefined };
}

/** Guarda (crea/actualiza) un parcial validando fechas y solapamientos. */
export async function guardarPeriodoEvaluacion(
  supabase: SupabaseClient,
  input: InputEvaluacion & { periodoId: string; id?: string | null },
): Promise<ResultadoAccion> {
  const validacion = validarInputEvaluacion(input);
  if (!validacion.ok) {
    const errores = "errores" in validacion ? validacion.errores : [];
    return { ok: false, error: errores.join(" · ") };
  }
  const v = validacion.valor;
  const periodoId = (input.periodoId ?? "").trim();

  // F1 — Configurar parciales debe poder hacerse sobre un ciclo BORRADOR (o
  // OPERATIVO). Solo se bloquea sobre ciclos HISTORICO (cuando hay esquema).
  const permitido = await configuracionPermitidaEnPeriodo(supabase, periodoId);
  if (!permitido.ok) {
    return { ok: false, error: permitido.error ?? "El ciclo no existe o no admite configuración." };
  }

  const esquema = await verificarEsquemaEvaluaciones(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error ?? "Esquema pendiente." };

  const { data: otras, error: eO } = await supabase
    .from(TABLA_PERIODOS_EVALUACION)
    .select("id, numero, nombre, fecha_inicio, fecha_fin")
    .eq("periodo_id", periodoId);
  if (eO) return { ok: false, error: eO.message };

  const otrasRows = (otras ?? []) as Array<
    Pick<PeriodoEvaluacionRow, "id" | "numero" | "nombre" | "fecha_inicio" | "fecha_fin">
  >;
  const idActual = input.id ? input.id.trim() : null;

  const duplicadoNumero = otrasRows.find(
    (o) => o.numero === v.numero && o.id !== idActual,
  );
  if (duplicadoNumero) {
    return { ok: false, error: `Ya existe el parcial número ${v.numero} en este ciclo.` };
  }
  const duplicadoNombre = otrasRows.find(
    (o) => o.nombre.toLowerCase() === v.nombre.toLowerCase() && o.id !== idActual,
  );
  if (duplicadoNombre) {
    return { ok: false, error: `Ya existe un parcial llamado «${v.nombre}» en este ciclo.` };
  }
  const conflictos = evaluacionesEnConflicto(
    { fechaInicio: v.fechaInicio, fechaFin: v.fechaFin },
    otrasRows,
    idActual ?? undefined,
  );
  if (conflictos.length > 0) {
    return {
      ok: false,
      error: `El rango se solapa con: ${conflictos.map((c) => c.nombre).join(", ")}.`,
    };
  }

  const fila = {
    periodo_id: periodoId,
    numero: v.numero,
    nombre: v.nombre,
    fecha_inicio: v.fechaInicio,
    fecha_fin: v.fechaFin,
    activo: v.activo,
  };

  if (idActual) {
    const { error } = await supabase
      .from(TABLA_PERIODOS_EVALUACION)
      .update(fila)
      .eq("id", idActual)
      .eq("periodo_id", periodoId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, mensaje: `Parcial «${v.nombre}» actualizado.` };
  }

  const { error } = await supabase
    .from(TABLA_PERIODOS_EVALUACION)
    .upsert(fila, { onConflict: "periodo_id,numero" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, mensaje: `Parcial «${v.nombre}» guardado.` };
}

/** Activa/desactiva un parcial (UPDATE; nunca DELETE). */
export async function setActivoEvaluacion(
  supabase: SupabaseClient,
  periodoId: string,
  evaluacionId: string,
  activo: boolean,
): Promise<ResultadoAccion> {
  const { data: ev, error: eE } = await supabase
    .from(TABLA_PERIODOS_EVALUACION)
    .select("nombre")
    .eq("id", evaluacionId)
    .eq("periodo_id", periodoId)
    .maybeSingle();
  if (eE || !ev) return { ok: false, error: eE?.message ?? "Parcial inexistente." };
  const { error } = await supabase
    .from(TABLA_PERIODOS_EVALUACION)
    .update({ activo })
    .eq("id", evaluacionId);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    mensaje: `Parcial «${String(ev.nombre)}» ${activo ? "activado" : "desactivado"}.`,
  };
}

/** Fecha → parcial dentro de un ciclo conocido (1 consulta). */
export async function resolverEvaluacionEnPeriodoPorFecha(
  supabase: SupabaseClient,
  periodoId: string,
  fecha: string,
): Promise<PeriodoEvaluacionRow | null> {
  if (!normalizarFechaEvaluacion(fecha)) return null;
  const { data, error } = await supabase
    .from(TABLA_PERIODOS_EVALUACION)
    .select("*")
    .eq("periodo_id", periodoId)
    .eq("activo", true);
  if (error || !data) return null;
  const evaluaciones = (data as PeriodoEvaluacionRow[]).sort(
    (a, b) => a.numero - b.numero,
  );
  return resolverEvaluacionPorFechaLocal(fecha, evaluaciones) as PeriodoEvaluacionRow | null;
}

/** Fecha → ciclo + parcial (2 consultas; sin N+1). */
export async function resolverCicloEvaluacionPorFecha(
  supabase: SupabaseClient,
  fecha: string,
): Promise<FechaCicloEvaluacion | null> {
  if (!normalizarFechaEvaluacion(fecha)) return null;
  const { data: periodos, error: eP } = await supabase
    .from(TABLA_PERIODOS)
    .select("id, nombre, activo, fecha_inicio, fecha_fin, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (eP || !periodos || periodos.length === 0) return null;

  const { data: evaluaciones, error: eE } = await supabase
    .from(TABLA_PERIODOS_EVALUACION)
    .select("*")
    .eq("activo", true);
  if (eE || !evaluaciones) return null;

  const porPeriodo = new Map<string, PeriodoEvaluacionRow[]>();
  for (const ev of evaluaciones as PeriodoEvaluacionRow[]) {
    const lista = porPeriodo.get(ev.periodo_id) ?? [];
    lista.push(ev);
    porPeriodo.set(ev.periodo_id, lista);
  }
  return resolverCicloEvaluacionLocal(fecha, periodos as PeriodoEscolarRow[], porPeriodo);
}

//__EVALUACIONES_CONTINUA__

/* ---------------------------------------------------------------------------
 * CICLO OPERATIVO + PARCIALES (para las Server Actions)
 * ---------------------------------------------------------------------------
 * Bajado de `app/actions/asistencias.ts` (PROMPT E · R-3): resolver el ciclo
 * operativo y validar el parcial es decisión de dominio, no de la action.
 */

/**
 * Resuelve el periodo OPERATIVO único con sus parciales ACTIVOS. El cliente
 * nunca decide el ciclo: esta es la única vía.
 */
export async function resolverOperativoConParciales(
  supabase: SupabaseClient,
): Promise<
  | {
      ok: true;
      periodoId: string;
      periodoNombre: string;
      parciales: PeriodoEvaluacionRow[];
    }
  | { ok: false; error: string }
> {
  const operativo = await obtenerCicloOperativoGlobal(supabase);
  if (!operativo.ok) {
    return {
      ok: false,
      error: operativo.error ?? "F1: no hay un único ciclo OPERATIVO.",
    };
  }
  if (!operativo.periodo) {
    return {
      ok: false,
      error:
        "No hay ningún periodo OPERATIVO activado todavía. Activa el ciclo en Configuración.",
    };
  }
  const evs = await listarEvaluacionesDePeriodo(
    supabase,
    String(operativo.periodo.id),
  );
  if (!evs.ok) {
    return {
      ok: false,
      error: evs.error ?? "No se pudieron cargar los parciales del periodo.",
    };
  }
  return {
    ok: true,
    periodoId: String(operativo.periodo.id),
    periodoNombre: String(operativo.periodo.nombre),
    parciales: evs.evaluaciones.filter((e) => e.activo !== false),
  };
}

/**
 * CICLO GLOBAL + PARCIAL — resuelve el operativo y valida que el parcial
 * solicitado (`evaluacionId`) pertenezca a él y esté activo. Un parcial de otro
 * periodo = error: nunca se usan parciales ajenos al ciclo operativo.
 */
export async function resolverOperativoYValidarParcial(
  supabase: SupabaseClient,
  evaluacionId: string | null,
): Promise<
  | {
      ok: true;
      periodoId: string;
      periodoNombre: string;
      parciales: PeriodoEvaluacionRow[];
    }
  | { ok: false; error: string }
> {
  const base = await resolverOperativoConParciales(supabase);
  if (!base.ok) return base;
  if (evaluacionId) {
    const parcial = base.parciales.find(
      (e) => e.id === evaluacionId && e.activo !== false,
    );
    if (!parcial) {
      return {
        ok: false,
        error:
          "El parcial seleccionado no pertenece al periodo operativo o está inactivo. Recarga la página.",
      };
    }
  }
  return {
    ok: true,
    periodoId: base.periodoId,
    periodoNombre: base.periodoNombre,
    parciales: base.parciales,
  };
}



