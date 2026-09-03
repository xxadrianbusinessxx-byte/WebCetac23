import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activarCicloOperativo,
  configuracionPermitidaEnPeriodo,
  crearCicloBorrador,
  marcarCicloNoOperativo,
} from "./ciclo-estado";
import {
  TABLA_PERIODOS,
  TABLA_PERIODOS_EVALUACION,
} from "./tables";

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

export type PeriodoEscolarRow = {
  id: string;
  nombre: string;
  activo: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PeriodoEvaluacionRow = {
  id: string;
  periodo_id: string;
  numero: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Resultado de la resolución de una fecha contra ciclo y parcial. */
export type FechaCicloEvaluacion = {
  periodo: PeriodoEscolarRow;
  /** null = la fecha pertenece al ciclo pero no a ningún parcial activo. */
  evaluacion: PeriodoEvaluacionRow | null;
};

/* ---------------------------------------------------------------------------
 * VALIDACIÓN DE FECHAS (solo fechas YYYY-MM-DD; comparación lexicográfica
 * segura e independiente de la zona horaria del servidor)
 * ------------------------------------------------------------------------- */

const ISO_FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaISO(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  if (!ISO_FECHA_RE.test(valor)) return false;
  const [a, m, d] = valor.split("-").map(Number);
  const fecha = new Date(a ?? 0, (m ?? 1) - 1, d ?? 1);
  return (
    fecha.getFullYear() === a &&
    fecha.getMonth() + 1 === m &&
    fecha.getDate() === d
  );
}

export function normalizarFechaEvaluacion(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  return esFechaISO(v) ? v : null;
}

/** ¿Una fecha pertenece al rango [fecha_inicio, fecha_fin] (inclusive)? */
export function evaluacionContieneFecha(
  evaluacion: Pick<PeriodoEvaluacionRow, "fecha_inicio" | "fecha_fin">,
  fecha: string,
): boolean {
  return fecha >= evaluacion.fecha_inicio && fecha <= evaluacion.fecha_fin;
}

/** ¿El ciclo (con rango definido) contiene la fecha? Sin rango → false. */
export function cicloContieneFecha(
  periodo: Pick<PeriodoEscolarRow, "fecha_inicio" | "fecha_fin">,
  fecha: string,
): boolean {
  if (!periodo.fecha_inicio || !periodo.fecha_fin) return false;
  return fecha >= periodo.fecha_inicio && fecha <= periodo.fecha_fin;
}

/** ¿Dos rangos inclusive de fechas se solapan? */

/* ---------------------------------------------------------------------------
 * VALIDACIÓN PURA DE ENTRADA (reutilizada por UI y Server Actions)
 * ------------------------------------------------------------------------- */

export type InputEvaluacion = {
  numero: number | string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo?: boolean;
};

export type ResultadoValidacionEvaluacion =
  | {
      ok: true;
      valor: {
        numero: number;
        nombre: string;
        fechaInicio: string;
        fechaFin: string;
        activo: boolean;
      };
    }
  | { ok: false; errores: string[] };

export function validarInputEvaluacion(
  input: InputEvaluacion,
): ResultadoValidacionEvaluacion {
  const errores: string[] = [];
  const numeroNum = Number(input.numero);
  if (!Number.isInteger(numeroNum) || numeroNum < 1) {
    errores.push("El número de parcial debe ser un entero >= 1.");
  }
  const nombre = (input.nombre ?? "").trim();
  if (!nombre) errores.push("Indica el nombre del parcial.");
  else if (nombre.length > 80) errores.push("El nombre no puede superar 80 caracteres.");
  const fechaInicio = normalizarFechaEvaluacion(input.fechaInicio);
  const fechaFin = normalizarFechaEvaluacion(input.fechaFin);
  if (!fechaInicio) errores.push("Fecha de inicio inválida (usa YYYY-MM-DD).");
  if (!fechaFin) errores.push("Fecha de cierre inválida (usa YYYY-MM-DD).");
  if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
    errores.push("La fecha de cierre no puede ser anterior a la de inicio.");
  }
  if (errores.length > 0) return { ok: false, errores };
  return {
    ok: true,
    valor: {
      numero: numeroNum,
      nombre,
      fechaInicio: fechaInicio!,
      fechaFin: fechaFin!,
      activo: input.activo !== false,
    },
  };
}

/** ¿Dos rangos inclusive de fechas se solapan? */
export function rangosSeSolapan(
  a: { fecha_inicio: string; fecha_fin: string },
  b: { fecha_inicio: string; fecha_fin: string },
): boolean {
  return a.fecha_fin >= b.fecha_inicio && b.fecha_fin >= a.fecha_inicio;
}

/** Otras evaluaciones del MISMO ciclo que se solapan con el rango propuesto. */
export function evaluacionesEnConflicto(
  rango: { fechaInicio: string; fechaFin: string },
  otras: Array<
    Pick<PeriodoEvaluacionRow, "id" | "numero" | "nombre" | "fecha_inicio" | "fecha_fin">
  >,
  ignorarId?: string,
): Array<Pick<PeriodoEvaluacionRow, "id" | "numero" | "nombre" | "fecha_inicio" | "fecha_fin">> {
  const otrosRango = {
    fecha_inicio: rango.fechaInicio,
    fecha_fin: rango.fechaFin,
  };
  return otras.filter((o) => {
    if (ignorarId && o.id === ignorarId) return false;
    return rangosSeSolapan(otrosRango, o);
  });
}

/* ---------------------------------------------------------------------------
 * RESOLUCIÓN PURA POR FECHA (compartida con las pruebas sin Supabase)
 * ------------------------------------------------------------------------- */

/** Parcial (activo) que contiene la fecha; null si no hay. */
export function resolverEvaluacionPorFechaLocal(
  fecha: string,
  evaluaciones: PeriodoEvaluacionRow[],
): PeriodoEvaluacionRow | null {
  for (const e of evaluaciones) {
    if (e.activo === false) continue;
    if (evaluacionContieneFecha(e, fecha)) return e;
  }
  return null;
}

/**
 * Resuelve fecha → (ciclo, parcial) sin base de datos.
 *
 * Regla determinista:
 *   1) Si existe un ciclo con RANGO explícito que contiene la fecha, ese es el
 *      ciclo; el parcial se busca dentro de ese ciclo.
 *   2) Si ningún ciclo tiene rango que la contenga, se acepta un ciclo cuyo
 *      PARCIAL contenga la fecha (permite operar ciclos sin rango definido).
 *   3) Se prefiere un ciclo ACTIVO; en caso de empate se usa el primero del
 *      arreglo (el flujo real mantiene un único ciclo activo).
 */
export function resolverCicloEvaluacionLocal(
  fecha: string,
  periodos: PeriodoEscolarRow[],
  evaluacionesPorPeriodo: Map<string, PeriodoEvaluacionRow[]>,
): FechaCicloEvaluacion | null {
  const activos = periodos.filter((p) => p.activo);
  const todos = periodos.filter((p) => !p.activo);

  const elegirPeriodo = (
    candidatos: PeriodoEscolarRow[],
  ): PeriodoEscolarRow | null => {
    if (candidatos.length === 0) return null;
    return candidatos[0]!;
  };

  // 1) Ciclos con rango que contienen la fecha.
  const conRango = [...activos, ...todos].filter((p) => cicloContieneFecha(p, fecha));
  const periodoBase = elegirPeriodo(conRango);

  if (periodoBase) {
    const evaluacion =
      resolverEvaluacionPorFechaLocal(
        fecha,
        evaluacionesPorPeriodo.get(periodoBase.id) ?? [],
      ) ?? null;
    return { periodo: periodoBase, evaluacion };
  }

  // 2) Ciclos sin rango cuyo parcial contiene la fecha (solo parciales activos).
  const conParcial = [...activos, ...todos].filter((p) => {
    const evals = evaluacionesPorPeriodo.get(p.id) ?? [];
    return evals.some((e) => e.activo !== false && evaluacionContieneFecha(e, fecha));
  });
  const periodoParcial = elegirPeriodo(conParcial);
  if (!periodoParcial) return null;
  const evaluacion = resolverEvaluacionPorFechaLocal(
    fecha,
    evaluacionesPorPeriodo.get(periodoParcial.id) ?? [],
  );
  return { periodo: periodoParcial, evaluacion };
}

/** Ordena parciales por numero de forma estable. */
export function ordenarEvaluacionesPorNumero<T extends { numero: number }>(
  filas: T[],
): T[] {
  return [...filas].sort((a, b) => a.numero - b.numero);
}


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
    const r = await activarCicloOperativo(supabase, periodoId);
    if (!r.ok) {
      return { ok: false, error: ("error" in r && r.error) || "No se pudo activar el ciclo." };
    }
    return { ok: true, mensaje: "mensaje" in r ? r.mensaje : undefined };
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


